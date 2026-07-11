import { Router } from "express";
import { z } from "zod";
import { priorityLevels, ticketPopulation, ticketStatuses } from "../constants/workflow.js";
import { listQuerySchema, pageMeta, parseOr400 } from "../lib/http.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { Organization } from "../models/Organization.js";
import { Counter } from "../models/Counter.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { projectSchema, settingsSchema, sprintSchema, teamSchema, ticketSchema } from "../schemas/workspace.js";

const router = Router();
router.use(requireAuth);
router.use(enforceApiAccess);

const orgId = (req: AuthRequest) => req.user!.organizationId;
const userId = (req: AuthRequest) => req.user!.userId;
const orgFilter = (req: AuthRequest) => ({ organization: orgId(req) });

async function nextTicketId(req: AuthRequest, projectId: string) {
  const project = await Project.findOne({ _id: projectId, organization: orgId(req) });
  if (!project) throw new Error("Project not found");
  const counter = await Counter.findOneAndUpdate(
    { organization: orgId(req), scope: `ticket:${project._id}` },
    { $inc: { value: 1 } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return `${project.key}-${String(counter.value).padStart(3, "0")}`;
}

router.get("/me", async (req: AuthRequest, res) => {
  const [user, organization] = await Promise.all([
    User.findById(userId(req)).select("-passwordHash"),
    Organization.findById(orgId(req)),
  ]);
  return res.json({ user, organization });
});

router.get("/dashboard", async (req: AuthRequest, res) => {
  const [projects, sprints, tickets, users] = await Promise.all([
    Project.find(orgFilter(req)).populate("members", "name role avatarColor organization"),
    Sprint.find(orgFilter(req)).populate("project", "key name organization"),
    Ticket.find(orgFilter(req)).populate(ticketPopulation),
    User.find(orgFilter(req)).select("-passwordHash"),
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
    tickets,
    users,
    trends: {
      risk: [
        { name: "Mon", value: 58 },
        { name: "Tue", value: 64 },
        { name: "Wed", value: 69 },
        { name: "Thu", value: activeSprint?.riskScore ?? 0 },
        { name: "Fri", value: Math.max((activeSprint?.riskScore ?? 0) - 2, 0) },
      ],
      velocity: [
        { name: "S20", value: 92 },
        { name: "S21", value: 104 },
        { name: "S22", value: 97 },
        { name: "S23", value: 111 },
        { name: "S24", value: activeSprint?.completedPoints ?? 0 },
      ],
    },
    recommendation: {
      title: blockedTickets.length ? "Resolve blockers before scope grows" : "Keep capacity inside the sprint plan",
      body: blockedTickets.length ? "Blocked work is increasing deterministic sprint risk. Reassign or defer dependency-heavy tickets first." : "Current workspace data is healthy; keep planned points aligned with available capacity.",
      confidence: blockedTickets.length ? 82 : 74,
    },
  });
});

router.route("/projects")
  .get(async (req: AuthRequest, res) => {
    const query = parseOr400(listQuerySchema, req.query, res);
    if (!query) return;
    const filter = { ...orgFilter(req), ...(query.search ? { $or: [{ name: { $regex: query.search, $options: "i" } }, { key: { $regex: query.search, $options: "i" } }] } : {}) };
    const [projects, total] = await Promise.all([
      Project.find(filter).sort(query.sort).skip((query.page - 1) * query.limit).limit(query.limit).populate("members", "name role avatarColor organization"),
      Project.countDocuments(filter),
    ]);
    return res.json({ projects, meta: pageMeta(query.page, query.limit, total) });
  })
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(projectSchema, req.body, res);
    if (!body) return;
    const project = await Project.create({ ...body, organization: orgId(req) });
    return res.status(201).json({ project: await project.populate("members", "name role avatarColor organization") });
  });

router.route("/projects/:id")
  .patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(projectSchema.partial(), req.body, res);
    if (!body) return;
    if (body.members) {
      const memberCount = await User.countDocuments({ _id: { $in: body.members }, organization: orgId(req) });
      if (memberCount !== new Set(body.members).size) return res.status(400).json({ message: "One or more project members are invalid" });
    }
    const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, body, { new: true }).populate("members", "name role avatarColor organization");
    if (!project) return res.status(404).json({ message: "Project not found" });
    return res.json({ project });
  })
  .delete(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
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
    const project = await Project.exists({ _id: body.project, organization: orgId(req) });
    if (!project) return res.status(404).json({ message: "Project not found" });
    const sprint = await Sprint.create({ ...body, organization: orgId(req) });
    return res.status(201).json({ sprint: await sprint.populate("project", "key name organization") });
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
    const querySchema = listQuerySchema.extend({ status: z.enum(ticketStatuses).optional(), priority: z.enum(priorityLevels).optional(), project: z.string().optional(), sprint: z.string().optional(), assignee: z.string().optional() });
    const query = parseOr400(querySchema, req.query, res);
    if (!query) return;
    const filter = { ...orgFilter(req), ...(query.status && { status: query.status }), ...(query.priority && { priority: query.priority }), ...(query.project && { project: query.project }), ...(query.sprint && { sprint: query.sprint }), ...(query.assignee && { assignee: query.assignee }), ...(query.search ? { $or: [{ title: { $regex: query.search, $options: "i" } }, { ticketId: { $regex: query.search, $options: "i" } }] } : {}) };
    const [tickets, total] = await Promise.all([Ticket.find(filter).sort(query.sort).skip((query.page - 1) * query.limit).limit(query.limit).populate(ticketPopulation), Ticket.countDocuments(filter)]);
    return res.json({ tickets, meta: pageMeta(query.page, query.limit, total) });
  })
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(ticketSchema, req.body, res);
    if (!body) return;
    const [assignee, project, sprint] = await Promise.all([
      User.exists({ _id: body.assignee, organization: orgId(req) }),
      Project.exists({ _id: body.project, organization: orgId(req) }),
      Sprint.exists({ _id: body.sprint, organization: orgId(req) }),
    ]);
    if (!assignee || !project || !sprint) return res.status(404).json({ message: "Assignee, project, or sprint not found" });
    const ticket = await Ticket.create({ ...body, organization: orgId(req), reporter: userId(req), ticketId: await nextTicketId(req, body.project), history: [{ event: "Created", createdAt: new Date() }] });
    return res.status(201).json({ ticket: await ticket.populate(ticketPopulation) });
  });

router.get("/tickets/:ticketId", async (req: AuthRequest, res) => {
  const ticket = await Ticket.findOne({ ticketId: req.params.ticketId, organization: orgId(req) }).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.json({ ticket });
});

router.patch("/tickets/:id", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const body = parseOr400(ticketSchema.partial(), req.body, res);
  if (!body) return;
  const checks = await Promise.all([
    body.assignee ? User.exists({ _id: body.assignee, organization: orgId(req) }) : true,
    body.project ? Project.exists({ _id: body.project, organization: orgId(req) }) : true,
    body.sprint ? Sprint.exists({ _id: body.sprint, organization: orgId(req), ...(body.project ? { project: body.project } : {}) }) : true,
  ]);
  if (checks.some((value) => !value)) return res.status(400).json({ message: "Assignee, project, or sprint is invalid for this organization" });
  const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: orgId(req) }, body, { new: true }).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.json({ ticket });
});

router.patch("/tickets/:id/status", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ status: z.enum(ticketStatuses) }), req.body, res);
  if (!body) return;
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: orgId(req) },
    { status: body.status, $push: { history: { event: `Moved to ${body.status}`, createdAt: new Date() } } },
    { new: true },
  ).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.json({ ticket });
});

router.post("/tickets/:id/comments", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ body: z.string().min(1) }), req.body, res);
  if (!body) return;
  const user = await User.findById(userId(req));
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: orgId(req) },
    { $push: { comments: { author: user?.name ?? req.user!.email, body: body.body, createdAt: new Date() } } },
    { new: true },
  ).populate(ticketPopulation);
  if (!ticket) return res.status(404).json({ message: "Ticket not found" });
  return res.status(201).json({ ticket });
});

router.post("/tickets/:id/work-logs", requireRole(["admin", "manager", "engineer", "designer"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ hours: z.number().min(0.25).max(24), note: z.string().min(1) }), req.body, res);
  if (!body) return;
  const user = await User.findById(userId(req));
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: orgId(req) },
    { $push: { workLogs: { author: user?.name ?? req.user!.email, hours: body.hours, note: body.note, createdAt: new Date() } } },
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
  .get(async (req: AuthRequest, res) => res.json({ users: await User.find(orgFilter(req)).select("-passwordHash") }))
  .post(requireRole(["admin"]), async (req: AuthRequest, res) => {
    const body = parseOr400(teamSchema, req.body, res);
    if (!body) return;
    const passwordHash = "invited-user-no-password-yet";
    const user = await User.create({ ...body, organization: orgId(req), passwordHash, inviteStatus: "invited" });
    return res.status(201).json({ user: { ...user.toObject(), passwordHash: undefined } });
  });

router.route("/settings")
  .get(async (req: AuthRequest, res) => {
    const organization = await Organization.findById(orgId(req));
    return res.json({ settings: organization?.settings });
  })
  .patch(requireRole(["admin"]), async (req: AuthRequest, res) => {
    const body = parseOr400(settingsSchema, req.body, res);
    if (!body) return;
    const organization = await Organization.findByIdAndUpdate(orgId(req), { settings: body }, { new: true });
    return res.json({ settings: organization?.settings });
  });

router.get("/reports", async (req: AuthRequest, res) => {
  const [tickets, sprints] = await Promise.all([Ticket.find(orgFilter(req)), Sprint.find(orgFilter(req))]);
  const done = tickets.filter((ticket) => ticket.status === "Done").length;
  return res.json({
    reports: {
      velocity: sprints.flatMap((sprint) => sprint.velocityHistory).slice(-5),
      completion: tickets.length ? Math.round((done / tickets.length) * 100) : 0,
      burnoutTrend: [41, 48, 55, 62, 66],
      riskTrend: sprints.length ? sprints.map((sprint) => sprint.riskScore).slice(-5) : [0],
      cycleTime: 4.8,
      leadTime: 7.2,
      blockedDuration: tickets.filter((ticket) => ticket.blocked).length * 3,
    },
  });
});

export default router;
