import { Router } from "express";
import { z } from "zod";
import { priorityLevels, ticketPopulation, ticketStatuses } from "../constants/workflow.js";
import { postgres } from "../config/postgres.js";
import { listQuerySchema, pageMeta, parseOr400 } from "../lib/http.js";
import { measureAsync } from "../lib/performance.js";
import { requireAuth, requireRole, requireWorkspace, type AuthRequest } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { Organization } from "../models/Organization.js";
import { Cycle } from "../models/Cycle.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { Invitation, OrganizationMembership } from "../models/WorkspaceAccess.js";
import { WorkspaceRole } from "../models/Role.js";
import { WorkspaceResource } from "../models/WorkspaceResource.js";
import { cycleSchema, projectSchema, settingsSchema, sprintSchema, teamSchema, ticketSchema } from "../schemas/workspace.js";
import { applySlaState, cycleMetricsForTickets, normalizeSlaPolicy, slaFieldsForTicket, statusTransition } from "../services/sla.js";
import { filterReportRows } from "../services/reporting.js";
import { applyWorkspaceRules } from "../services/rules.js";
import { ensureWorkspaceRoles, publicRole } from "../services/roles.js";

const router = Router();
router.use(requireAuth);
router.use(requireWorkspace);
router.use(enforceApiAccess);

const orgId = (req: AuthRequest) => req.user!.organizationId;
const userId = (req: AuthRequest) => req.user!.userId;
const orgFilter = (req: AuthRequest) => ({ organization: orgId(req) });
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const Resources = WorkspaceResource as any;
const projectScope = (req: AuthRequest) => req.user!.role === "admin" || req.user!.workspaceAccessSource === "group" ? {} : { members: userId(req) };
const canManageProject = (req: AuthRequest, project: any) =>
  req.user!.role === "admin" || req.user!.workspaceAccessSource === "group" || (req.user!.permissions?.includes("projects.manage") && project?.members?.map(String).includes(userId(req)));
async function canAccessTicket(req: AuthRequest, ticket: any) {
  if (!ticket) return false;
  if (req.user!.role === "admin" || req.user!.workspaceAccessSource === "group") return true;
  return Boolean(await Project.exists({ _id: ticket.project, organization: orgId(req), members: userId(req) }));
}

function isDuplicateProjectKeyError(error: unknown) {
  return typeof error === "object"
    && error !== null
    && "code" in error
    && (error as { code?: string }).code === "23505"
    && "constraint" in error
    && (error as { constraint?: string }).constraint === "projects_organization_key_key";
}

async function nextTicketId(req: AuthRequest, project: { _id: string; key: string }) {
  const result = await postgres.query<{ value: string }>(
    `INSERT INTO counters (organization, scope, value)
     VALUES ($1, $2, 101)
     ON CONFLICT (organization, scope)
     DO UPDATE SET value = counters.value + 1
     RETURNING value`,
    [orgId(req), `ticket:${project._id}`],
  );
  return `${project.key}-${String(result.rows[0].value).padStart(3, "0")}`;
}

router.get("/me", async (req: AuthRequest, res) => {
  const [user, organization] = await Promise.all([
    User.findById(userId(req)).select("-passwordHash"),
    Organization.findById(orgId(req)),
  ]);
  return res.json({ user, organization });
});

router.get("/dashboard", async (req: AuthRequest, res) => {
  const projectFilter = { ...orgFilter(req), ...projectScope(req) };
  const projectIds = (await Project.find(projectFilter).select("_id")).map((project) => project._id);
  const deliveryFilter = req.user!.role === "admin" ? orgFilter(req) : { ...orgFilter(req), project: { $in: projectIds } };
  const [projects, sprints, cycles, tickets, users, invitations, roles] = await Promise.all([
    Project.find(projectFilter).populate("members", "name role avatarColor organization"),
    Sprint.find(deliveryFilter).populate("project", "key name organization"),
    Cycle.find(orgFilter(req)).populate({ path: "sprints", select: "name status startDate endDate plannedPoints completedPoints riskScore organization project", populate: { path: "project", select: "key name organization" } }),
    Ticket.find(deliveryFilter).populate(ticketPopulation),
    OrganizationMembership.find({ organization: orgId(req) }).populate("user", "name email avatarColor notificationPreferences"),
    Invitation.find({ organization: orgId(req), status: "pending" }),
    ensureWorkspaceRoles(orgId(req)!),
  ]);
  const activeSprint = sprints.find((sprint) => sprint.status === "active") ?? sprints[0];
  const blockedTickets = tickets.filter((ticket) => ticket.blocked);
  return res.json({
    summary: {
      activeProjects: projects.length,
      sprintsInProgress: sprints.filter((sprint) => sprint.status === "active").length,
      atRiskSprints: sprints.filter((sprint) => sprint.riskScore >= 65).length,
      blockedTasks: blockedTickets.length,
      sprintHealth: activeSprint ? 100 - activeSprint.riskScore : 0,
    },
    projects,
    sprints,
    cycles,
    tickets,
    users: req.user!.permissions?.includes("team.view")
      ? [
          ...users.map((membership: any) => ({ ...(membership.user?.toObject?.() || membership.user || {}), role: membership.role, inviteStatus: membership.status, skills: membership.skills, availability: membership.availability, capacity: membership.capacity })),
          ...invitations.map((invitation: any) => ({ _id: invitation.id, id: invitation.id, name: invitation.name, email: invitation.email, role: invitation.role, inviteStatus: "invited", capacity: invitation.capacity, skills: [] })),
        ]
      : users.map((membership: any) => ({ _id: membership.user?._id, id: membership.user?.id, name: membership.user?.name, avatarColor: membership.user?.avatarColor, role: membership.role })),
    roles: roles.map((role: any) => publicRole(role)),
    trends: {
      risk: sprints.length
        ? sprints.slice(-5).map((sprint) => ({ name: sprint.name, value: sprint.riskScore }))
        : [{ name: "Current", value: 0 }],
      velocity: sprints
        .flatMap((sprint) => (sprint.velocityHistory || []).map((value: number, index: number) => ({ name: `${sprint.name} ${index + 1}`, value })))
        .slice(-5),
    },
    recommendation: {
      title: blockedTickets.length ? "Resolve blockers before scope grows" : "Keep capacity inside the sprint plan",
      body: blockedTickets.length ? "Blocked work is increasing deterministic sprint risk. Reassign or defer dependency-heavy tickets first." : "Current workspace data is healthy; keep planned points aligned with available capacity.",
      confidence: Math.max(0, Math.min(100, Math.round(100 - (activeSprint?.riskScore ?? 0) * 0.6 - Math.min(blockedTickets.length * 5, 30)))),
    },
  });
});

router.get("/my-work", async (req: AuthRequest, res) => {
  const [user, tickets, sprints] = await Promise.all([
    User.findById(userId(req)).select("name capacity"),
    Ticket.find(orgFilter(req)),
    Sprint.find(orgFilter(req)).sort("startDate"),
  ]);
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const assigned = tickets.filter((ticket) => String(ticket.assignee || "") === String(user?._id || ""));
  const dueThisWeek = assigned.filter((ticket) => ticket.dueDate >= weekStart && ticket.dueDate < weekEnd);
  const watched = tickets.filter((ticket) => ticket.watchers.some((watcher: unknown) => String(watcher) === String(user?._id || "")));
  const activeSprint = sprints.find((sprint) => sprint.status === "active") || sprints.at(-1);
  const sprintStart = activeSprint?.startDate ? new Date(activeSprint.startDate) : null;
  const sprintEnd = activeSprint?.endDate ? new Date(activeSprint.endDate) : null;
  if (sprintEnd) sprintEnd.setHours(23, 59, 59, 999);
  const loggedHours = tickets.reduce((total, ticket) => {
    if (!activeSprint || String(ticket.sprint || "") !== String(activeSprint._id)) return total;
    return total + ticket.workLogs.reduce((hours: number, log: any) => {
      const createdAt = new Date(log.createdAt);
      const inSprint = !sprintStart || !sprintEnd || (createdAt >= sprintStart && createdAt <= sprintEnd);
      return log.author === user?.name && inSprint ? hours + (log.hours || 0) : hours;
    }, 0);
  }, 0);
  const updatedToday = watched.filter((ticket) => ticket.updatedAt?.toDateString() === now.toDateString()).length;
  return res.json({
    assigned: assigned.length,
    projects: new Set(assigned.map((ticket) => String(ticket.project))).size,
    dueThisWeek: dueThisWeek.length,
    dueThisWeekHighPriority: dueThisWeek.filter((ticket) => ticket.priority === "high" || ticket.priority === "critical").length,
    loggedHours,
    capacity: user?.capacity ?? 0,
    watched: watched.length,
    watchedUpdatedToday: updatedToday,
  });
});

router.route("/projects")
  .get(async (req: AuthRequest, res) => {
    const query = parseOr400(listQuerySchema, req.query, res);
    if (!query) return;
    const filter = { ...orgFilter(req), ...projectScope(req), ...(query.search ? { $or: [{ name: { $regex: query.search, $options: "i" } }, { key: { $regex: query.search, $options: "i" } }] } : {}) };
    const [projects, total] = await Promise.all([
      Project.find(filter).sort(query.sort).skip((query.page - 1) * query.limit).limit(query.limit).populate("members", "name role avatarColor organization"),
      Project.countDocuments(filter),
    ]);
    return res.json({ projects, meta: pageMeta(query.page, query.limit, total) });
  })
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(projectSchema, req.body, res);
    if (!body) return;
    try {
      const members = req.user!.role === "manager" ? [...new Set([...(body.members ?? []), userId(req)])] : body.members;
      const project = await Project.create({ ...body, members, organization: orgId(req) });
      return res.status(201).json({ project: await project.populate("members", "name role avatarColor organization") });
    } catch (error) {
      if (isDuplicateProjectKeyError(error)) {
        return res.status(409).json({ error: { code: "PROJECT_KEY_EXISTS", message: `Project key ${body.key} already exists in this workspace` } });
      }
      throw error;
    }
  });

router.route("/projects/:id")
  .patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(projectSchema.partial(), req.body, res);
    if (!body) return;
    const existing = await Project.findOne({ _id: req.params.id, organization: orgId(req) });
    if (!existing) return res.status(404).json({ message: "Project not found" });
    if (!canManageProject(req, existing)) return res.status(403).json({ message: "Only an assigned manager can manage this project" });
    if (body.members) {
      const memberCount = await OrganizationMembership.countDocuments({ user: { $in: body.members }, organization: orgId(req), status: "active" });
      if (memberCount !== new Set(body.members).size) return res.status(400).json({ message: "One or more project members are invalid" });
    }
    const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, body, { new: true }).populate("members", "name role avatarColor organization");
    if (!project) return res.status(404).json({ message: "Project not found" });
    return res.json({ project });
  })
  .delete(requireRole(["admin"]), async (req: AuthRequest, res) => {
    const project = await Project.findOneAndDelete({ _id: req.params.id, organization: orgId(req) });
    if (!project) return res.status(404).json({ message: "Project not found" });
    await Promise.all([Sprint.deleteMany({ project: project._id, organization: orgId(req) }), Ticket.deleteMany({ project: project._id, organization: orgId(req) })]);
    return res.json({ ok: true });
  });

router.route("/sprints")
  .get(async (req: AuthRequest, res) => res.json({ sprints: await Sprint.find(orgFilter(req)).populate("project", "key name organization") }))
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(sprintSchema, req.body, res);
    if (!body) return;
    const project = await Project.findOne({ _id: body.project, organization: orgId(req) });
    if (!project) return res.status(404).json({ message: "Project not found" });
    if (!canManageProject(req, project)) return res.status(403).json({ message: "Only an assigned manager can plan this project" });
    const sprint = await Sprint.create({ ...body, organization: orgId(req) });
    return res.status(201).json({ sprint: await sprint.populate("project", "key name organization") });
  });

router.route("/cycles")
  .get(async (req: AuthRequest, res) => {
    const cycles = await Cycle.find(orgFilter(req)).sort("startDate").populate({ path: "sprints", select: "name status startDate endDate plannedPoints completedPoints riskScore organization project", populate: { path: "project", select: "key name organization" } });
    return res.json({ cycles });
  })
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(cycleSchema, req.body, res);
    if (!body) return;
    const sprintCount = body.sprints.length ? await Sprint.countDocuments({ _id: { $in: body.sprints }, organization: orgId(req) }) : 0;
    if (sprintCount !== new Set(body.sprints).size) return res.status(400).json({ message: "One or more sprints are invalid" });
    const cycle = await Cycle.create({ ...body, organization: orgId(req) });
    return res.status(201).json({ cycle: await cycle.populate({ path: "sprints", select: "name status startDate endDate plannedPoints completedPoints riskScore organization project", populate: { path: "project", select: "key name organization" } }) });
  });

router.route("/cycles/:id")
  .get(async (req: AuthRequest, res) => {
    const cycle = await Cycle.findOne({ _id: req.params.id, organization: orgId(req) }).populate({ path: "sprints", select: "name status startDate endDate plannedPoints completedPoints riskScore organization project", populate: { path: "project", select: "key name organization" } });
    return cycle ? res.json({ cycle }) : res.status(404).json({ message: "Cycle not found" });
  })
  .patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(cycleSchema.partial(), req.body, res);
    if (!body) return;
    if (body.sprints) {
      const sprintCount = body.sprints.length ? await Sprint.countDocuments({ _id: { $in: body.sprints }, organization: orgId(req) }) : 0;
      if (sprintCount !== new Set(body.sprints).size) return res.status(400).json({ message: "One or more sprints are invalid" });
    }
    const cycle = await Cycle.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, body, { new: true }).populate({ path: "sprints", select: "name status startDate endDate plannedPoints completedPoints riskScore organization project", populate: { path: "project", select: "key name organization" } });
    return cycle ? res.json({ cycle }) : res.status(404).json({ message: "Cycle not found" });
  })
  .delete(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const cycle = await Cycle.findOneAndDelete({ _id: req.params.id, organization: orgId(req) });
    return cycle ? res.status(204).send() : res.status(404).json({ message: "Cycle not found" });
  });

router.route("/sprints/:id")
  .patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(sprintSchema.partial(), req.body, res);
    if (!body) return;
    if (body.project && !(await Project.exists({ _id: body.project, organization: orgId(req) }))) return res.status(404).json({ message: "Project not found" });
    const sprint = await Sprint.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, body, { new: true }).populate("project", "key name organization");
    if (!sprint) return res.status(404).json({ message: "Sprint not found" });
    return res.json({ sprint });
  })
  .delete(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const sprint = await Sprint.findOneAndDelete({ _id: req.params.id, organization: orgId(req) });
    if (!sprint) return res.status(404).json({ message: "Sprint not found" });
    await Ticket.updateMany({ sprint: sprint._id, organization: orgId(req) }, { $unset: { sprint: "" } });
    return res.json({ ok: true });
  });

router.route("/tickets")
  .get(async (req: AuthRequest, res) => {
    const querySchema = listQuerySchema.extend({ status: z.enum(ticketStatuses).optional(), priority: z.enum(priorityLevels).optional(), project: z.string().optional(), sprint: z.string().optional(), assignee: z.string().optional(), label: z.string().optional() });
    const query = parseOr400(querySchema, req.query, res);
    if (!query) return;
    const searchPattern = query.search
      ? new RegExp(escapeRegExp(query.search), "i")
      : undefined;
    const labelPattern = query.label
      ? new RegExp(`^${escapeRegExp(query.label)}$`, "i")
      : undefined;
    const accessibleProjectIds = req.user!.role === "admin"
      ? null
      : (await Project.find({ organization: orgId(req), members: userId(req) }).select("_id")).map((project) => project._id);
    const filter = {
      ...orgFilter(req),
      ...(accessibleProjectIds ? { project: { $in: accessibleProjectIds } } : {}),
      ...(query.status && { status: query.status }),
      ...(query.priority && { priority: query.priority }),
      ...(query.project && { project: accessibleProjectIds ? { $in: accessibleProjectIds.filter((id) => String(id) === query.project) } : query.project }),
      ...(query.sprint && { sprint: query.sprint }),
      ...(query.assignee && { assignee: query.assignee }),
      ...(labelPattern && { labels: labelPattern }),
      ...(searchPattern && {
        $or: [
          { title: searchPattern },
          { ticketId: searchPattern },
          { labels: searchPattern },
        ],
      }),
    };
    const [tickets, total] = await Promise.all([Ticket.find(filter).sort(query.sort).skip((query.page - 1) * query.limit).limit(query.limit).populate(ticketPopulation), Ticket.countDocuments(filter)]);
    return res.json({ tickets, meta: pageMeta(query.page, query.limit, total) });
  })
  .post(requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
    const body = parseOr400(ticketSchema, req.body, res);
    if (!body) return;
    const [assignee, project, sprint, organization] = await measureAsync("tickets.create.validate", () => Promise.all([
      OrganizationMembership.exists({ user: body.assignee, organization: orgId(req), status: "active" }),
      Project.findOne({ _id: body.project, organization: orgId(req) }),
      Sprint.exists({ _id: body.sprint, organization: orgId(req) }),
      Organization.findById(orgId(req)),
    ]));
    if (!assignee || !project || !sprint) return res.status(404).json({ message: "Assignee, project, or sprint not found" });
    if (req.user!.role !== "admin" && !project.members.map(String).includes(userId(req))) return res.status(403).json({ message: "You do not have access to this project" });
    const now = new Date();
    const ticketId = await measureAsync("tickets.create.allocate_id", () => nextTicketId(req, { _id: String(project._id), key: project.key }));
    const ticket = await measureAsync("tickets.create.insert", () => Ticket.create({ ...body, ...slaFieldsForTicket(body.priority, now, organization?.settings?.slaPolicy), slaStatus: "healthy", organization: orgId(req), reporter: userId(req), ticketId, history: [{ event: "Created", createdAt: now }], statusTransitions: [statusTransition(undefined, body.status, now, userId(req))] }));
    await applyWorkspaceRules(orgId(req)!, "ticket.created", ticket);
    const populatedTicket = await measureAsync("tickets.create.populate", () => ticket.populate(ticketPopulation));
    return res.status(201).json({ ticket: populatedTicket });
  });

router.get("/tickets/:ticketId", async (req: AuthRequest, res) => {
  const ticket = await Ticket.findOne({ ticketId: req.params.ticketId, organization: orgId(req) }).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  if (!(await canAccessTicket(req, ticket))) return res.status(403).json({ message: "You do not have access to this project" });
  return res.json({ ticket });
});

router.patch("/tickets/:id", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(ticketSchema.partial(), req.body, res);
  if (!body) return;
  const existing = await Ticket.findOne({ _id: req.params.id, organization: orgId(req) });
  if (!existing) return res.status(404).json({ message: "Ticket not found" });
  if (!(await canAccessTicket(req, existing))) return res.status(403).json({ message: "You do not have access to this project" });
  if (!req.user!.permissions?.includes("tickets.manage")) {
    if (![existing.reporter, existing.assignee].filter(Boolean).map(String).includes(userId(req))) return res.status(403).json({ message: "Only the reporter or assignee may edit this ticket" });
    const contributorFields = new Set(["title", "description", "acceptanceCriteria", "acceptanceCriteriaDone", "storyPoints", "epic", "labels", "dueDate"]);
    if (Object.keys(body).some((field) => !contributorFields.has(field))) return res.status(403).json({ message: "Contributors cannot edit ticket governance fields" });
  }
  const checks = await Promise.all([
    body.assignee ? OrganizationMembership.exists({ user: body.assignee, organization: orgId(req), status: "active" }) : true,
    body.project ? Project.exists({ _id: body.project, organization: orgId(req) }) : true,
    body.sprint ? Sprint.exists({ _id: body.sprint, organization: orgId(req), ...(body.project ? { project: body.project } : {}) }) : true,
  ]);
  if (checks.some((value) => !value)) return res.status(400).json({ message: "Assignee, project, or sprint is invalid for this organization" });
  const update: Record<string, unknown> = { ...body };
  if (body.priority) {
    const organization = await Organization.findById(orgId(req));
    Object.assign(update, slaFieldsForTicket(body.priority, new Date(), organization?.settings?.slaPolicy));
  }
  const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, update, { new: true }).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  await applySlaState(ticket).save();
  return res.json({ ticket });
});

router.patch("/tickets/:id/status", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ status: z.enum(ticketStatuses) }), req.body, res);
  if (!body) return;
  const existing = await Ticket.findOne({ _id: req.params.id, organization: orgId(req) });
  if (!existing) return res.status(404).json({ message: "Ticket not found" });
  if (!(await canAccessTicket(req, existing))) return res.status(403).json({ message: "You do not have access to this project" });
  const workflows = await Resources.find({ organization: orgId(req), kind: "workflow", status: "active" }).sort("order");
  const workflow = workflows.find((item: any) => !item.project || String(item.project) === String(existing.project));
  const transitions = String(workflow?.config?.transitions || "")
    .split(",")
    .map((transition: string) => transition.trim().toLowerCase().replace(/\s*>\s*/g, ">"))
    .filter(Boolean);
  const requestedTransition = `${existing.status}>${body.status}`.toLowerCase();
  if (transitions.length && existing.status !== body.status && !transitions.includes(requestedTransition)) {
    return res.status(409).json({ message: `${existing.status} cannot transition to ${body.status} in ${workflow.name}` });
  }
  const now = new Date();
  const fromStatus = existing.status;
  existing.status = body.status;
  existing.history.push({ event: `Moved to ${body.status}`, createdAt: now });
  existing.statusTransitions.push(statusTransition(fromStatus, body.status, now, userId(req)));
  if (body.status === "Done" && !existing.resolvedAt) existing.resolvedAt = now;
  applySlaState(existing, now);
  await existing.save();
  await applyWorkspaceRules(orgId(req)!, "ticket.status.changed", existing);
  const ticket = await existing.populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.json({ ticket });
});

router.post("/tickets/:id/comments", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ body: z.string().min(1) }), req.body, res);
  if (!body) return;
  const user = await User.findById(userId(req));
  const ticket = await Ticket.findOne({ _id: req.params.id, organization: orgId(req) });
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  const now = new Date();
  ticket.comments.push({ author: user?.name ?? req.user!.email, authorId: userId(req), body: body.body, createdAt: now });
  if (!ticket.firstRespondedAt) ticket.firstRespondedAt = now;
  applySlaState(ticket, now);
  await ticket.save();
  return res.status(201).json({ ticket: await ticket.populate(ticketPopulation) });
});

router.get("/sla", async (req: AuthRequest, res) => {
  const organization = await Organization.findById(orgId(req));
  const tickets = await Ticket.find({ organization: orgId(req), archivedAt: { $exists: false } }).populate(ticketPopulation);
  const now = new Date();
  await Promise.all(tickets.map(async (ticket) => {
    const nextStatus = applySlaState(ticket, now).slaStatus;
    return ticket.isModified("slaStatus") || ticket.slaStatus !== nextStatus ? ticket.save() : undefined;
  }));
  const summary = {
    breached: tickets.filter((ticket) => ticket.slaStatus === "breached").length,
    dueSoon: tickets.filter((ticket) => ticket.slaStatus === "due_soon").length,
    healthy: tickets.filter((ticket) => ticket.slaStatus === "healthy").length,
    resolved: tickets.filter((ticket) => ticket.slaStatus === "resolved").length,
  };
  return res.json({
    policy: normalizeSlaPolicy(organization?.settings?.slaPolicy),
    summary,
    tickets: tickets.sort((a, b) => (a.resolutionDueAt?.getTime() ?? 0) - (b.resolutionDueAt?.getTime() ?? 0)),
  });
});

router.patch("/sla/policy", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const body = parseOr400(settingsSchema.shape.slaPolicy.unwrap(), req.body, res);
  if (!body) return;
  const policy = normalizeSlaPolicy(body);
  const organization = await Organization.findByIdAndUpdate(orgId(req), { "settings.slaPolicy": policy }, { new: true });
  const openTickets = await Ticket.find({ organization: orgId(req), status: { $ne: "Done" } });
  await Promise.all(openTickets.map(async (ticket) => {
    Object.assign(ticket, slaFieldsForTicket(ticket.priority, ticket.createdAt ?? new Date(), policy));
    applySlaState(ticket);
    await ticket.save();
  }));
  return res.json({ policy: normalizeSlaPolicy(organization?.settings?.slaPolicy) });
});

router.post("/tickets/:id/work-logs", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ hours: z.number().min(0.25).max(24), note: z.string().min(1) }), req.body, res);
  if (!body) return;
  const user = await User.findById(userId(req));
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: orgId(req) },
    { $push: { workLogs: { author: user?.name ?? req.user!.email, authorId: userId(req), hours: body.hours, note: body.note, createdAt: new Date() } } },
    { new: true },
  ).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.status(201).json({ ticket });
});

router.patch("/tickets/:id/dependencies", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ dependencies: z.array(z.string()) }), req.body, res);
  if (!body) return;
  const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, { dependencies: body.dependencies, blocked: body.dependencies.length > 0 }, { new: true }).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.json({ ticket });
});

router.route("/team")
  .get(async (req: AuthRequest, res) => { const memberships = await OrganizationMembership.find({ organization: orgId(req), status: "active" }).populate("user", "name email avatarColor notificationPreferences"); const privileged = Boolean(req.user!.permissions?.includes("team.view")); return res.json({ users: memberships.map((membership: any) => privileged ? ({ ...(membership.user?.toObject?.() || {}), role: membership.role, inviteStatus: membership.status, skills: membership.skills, availability: membership.availability, capacity: membership.capacity }) : ({ _id: membership.user?._id, id: membership.user?.id, name: membership.user?.name, avatarColor: membership.user?.avatarColor, role: membership.role })) }); })
  .post(requireRole(["admin"]), async (req: AuthRequest, res) => {
    const body = parseOr400(teamSchema, req.body, res);
    if (!body) return;
    if (!(await WorkspaceRole.exists({ organization: orgId(req), slug: body.role }))) return res.status(400).json({ message: "Role does not exist in this workspace" });
    const email = body.email.toLowerCase();
    let user = await User.findOne({ email });
    if (user && await OrganizationMembership.exists({ user: user._id, organization: orgId(req) })) {
      return res.status(409).json({ message: "This user already belongs to the workspace" });
    }
    if (!user) {
      const passwordHash = "invited-user-no-password-yet";
      user = await User.create({ name: body.name, email, avatarColor: body.avatarColor, passwordHash });
    }
    const membership = await OrganizationMembership.create({ user: user._id, organization: orgId(req), role: body.role, status: "disabled", skills: body.skills, availability: body.availability, capacity: body.capacity });
    return res.status(201).json({ user: { ...user.toObject(), passwordHash: undefined, role: membership.role, inviteStatus: "invited", skills: membership.skills, availability: membership.availability, capacity: membership.capacity } });
  });

router.route("/settings")
  .get(async (req: AuthRequest, res) => {
    const organization = await Organization.findById(orgId(req));
    return res.json({ settings: organization?.settings });
  })
  .patch(requireRole(["admin"]), async (req: AuthRequest, res) => {
    const body = parseOr400(settingsSchema, req.body, res);
    if (!body) return;
    const nextSettings = { ...body, slaPolicy: normalizeSlaPolicy(body.slaPolicy) };
    const organization = await Organization.findByIdAndUpdate(orgId(req), { settings: nextSettings }, { new: true });
    return res.json({ settings: organization?.settings });
  });

router.get("/reports", async (req: AuthRequest, res) => {
  const projectId = typeof req.query.projectId === "string" ? req.query.projectId : "";
  const memberId = typeof req.query.memberId === "string" ? req.query.memberId : "";
  const startDate = typeof req.query.startDate === "string" ? new Date(req.query.startDate) : null;
  const ticketRows = await Ticket.find(orgFilter(req));
  const sprintRows = await Sprint.find(orgFilter(req));
  const { tickets, sprints } = filterReportRows(ticketRows, sprintRows, { projectId, memberId, startDate: startDate && !Number.isNaN(startDate.getTime()) ? startDate : null });
  const done = tickets.filter((ticket) => ticket.status === "Done").length;
  const cycleMetrics = cycleMetricsForTickets(tickets);
  const burnoutTrend = sprints.slice(-5).map((sprint) => sprint.capacity ? Math.round(Math.min(100, (sprint.plannedPoints / sprint.capacity) * 100)) : 0);
  const now = new Date();
  const blockedDuration = tickets.filter((ticket) => ticket.blocked).reduce((days, ticket) => {
    const started = ticket.updatedAt || ticket.createdAt || now;
    return days + Math.max(0, (now.getTime() - started.getTime()) / 86400000);
  }, 0);
  return res.json({
    reports: {
      velocity: sprints.flatMap((sprint) => sprint.velocityHistory).slice(-5),
      completion: tickets.length ? Math.round((done / tickets.length) * 100) : 0,
      burnoutTrend,
      riskTrend: sprints.length ? sprints.map((sprint) => sprint.riskScore).slice(-5) : [0],
      cycleTime: cycleMetrics.cycleTime,
      leadTime: cycleMetrics.leadTime,
      measuredTickets: cycleMetrics.measuredTickets,
      blockedDuration: Math.round(blockedDuration * 10) / 10,
    },
  });
});

router.get("/reports/cycle-time", async (req: AuthRequest, res) => {
  const tickets = await Ticket.find(orgFilter(req)).populate(ticketPopulation);
  return res.json({ cycleTime: cycleMetricsForTickets(tickets), tickets });
});

export default router;
