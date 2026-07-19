import { Router } from "express";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { withTransaction } from "../db/pgModel.js";
import { postgres } from "../config/postgres.js";
import { env } from "../config/env.js";
import { isPermission } from "../constants/permissions.js";
import { encryptSecret, hashSha256, randomBase64UrlToken } from "../lib/crypto.js";
import { parseOr400 } from "../lib/http.js";
import { currentUserId, organizationId } from "../lib/routeContext.js";
import { invalidateWorkspaceMembership, requireAuth, requireRole, requireWorkspace, type AuthRequest } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { recordAuditEvent } from "../services/audit.js";
import { Organization } from "../models/Organization.js";
import { Counter } from "../models/Counter.js";
import { Cycle } from "../models/Cycle.js";
import { AuditEvent, Integration, Notification, Session } from "../models/Operational.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { Invitation, OrganizationMembership } from "../models/WorkspaceAccess.js";
import { WorkspaceGroupAccess } from "../models/Company.js";
import { WorkspaceRole } from "../models/Role.js";
import { resourceKinds, WorkspaceResource } from "../models/WorkspaceResource.js";
import { applySlaState, statusTransition } from "../services/sla.js";
import { applyWorkspaceRules } from "../services/rules.js";
import { attachmentStorage } from "../services/attachmentStorage.js";
import { ensureWorkspaceRoles, publicRole, roleSlug, uniquePermissions } from "../services/roles.js";
import { refreshWorkspaceProgress } from "../services/progressRollups.js";
import { accessibleProjectIds, canAccessProject, canAccessTicket, canManageProject, requireTicketAccess } from "../services/resourceAccess.js";
import { testIntegration } from "../services/outbox.js";

const router = Router();
router.use(requireAuth);
router.use(requireWorkspace);
router.use(enforceApiAccess);
const oid = organizationId;
const uid = currentUserId;
const hash = hashSha256;
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Dynamic resource/config documents intentionally cross Mongoose's static inferred union boundary.
const Resources = WorkspaceResource as any;
const Integrations = Integration as any;
const audit = recordAuditEvent;

function slugifyWorkspaceName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48) || "workspace";
}

async function uniqueWorkspaceSlug(name: string, organizationId: string) {
  const base = slugifyWorkspaceName(name);
  let slug = base;
  let index = 2;
  while (await Organization.exists({ slug, _id: { $ne: organizationId } })) {
    const suffix = `-${index++}`;
    slug = `${base.slice(0, 48 - suffix.length)}${suffix}`;
  }
  return slug;
}

function ownedBy(entry: any, req: AuthRequest, user?: any) {
  return String(entry?.authorId ?? entry?.uploadedBy ?? "") === uid(req)
    || (!entry?.authorId && (entry?.author === user?.name || entry?.author === req.user!.email));
}
async function canAccessResource(req: AuthRequest, resource: any) {
  if (!resource?.project) return true;
  return canAccessProject(req, await Project.findOne({ _id: resource.project, organization: oid(req) }));
}

const userPatch = z.object({ name: z.string().min(2).optional(), role: z.string().min(1).optional(), skills: z.array(z.string()).optional(), availability: z.number().min(0).max(1).optional(), capacity: z.number().min(0).optional(), avatarColor: z.string().optional() });
const rolePatch = z.object({ name: z.string().min(2).optional(), description: z.string().max(240).optional(), permissions: z.array(z.string()).optional(), rank: z.number().min(1).max(99).optional() });

function requireAdmin(req: AuthRequest, res: any) {
  if (req.user!.role !== "admin") {
    res.status(403).json({ message: "Only the workspace administrator can manage roles" });
    return false;
  }
  return true;
}

router.get("/roles", async (req: AuthRequest, res) => {
  const roles = await ensureWorkspaceRoles(oid(req)!);
  const users = await OrganizationMembership.find({ organization: oid(req), status: "active" });
  const assigned = new Map<string, number>();
  for (const user of users as any[]) assigned.set(String(user.role), (assigned.get(String(user.role)) || 0) + 1);
  return res.json({ roles: roles.map((role: any) => ({ ...publicRole(role), assignedUsers: assigned.get(role.slug) || 0 })) });
});

router.post("/roles", async (req: AuthRequest, res) => {
  if (!requireAdmin(req, res)) return;
  const body = parseOr400(rolePatch.extend({ name: z.string().min(2), permissions: z.array(z.string()).default([]) }), req.body, res);
  if (!body) return;
  if (body.permissions.some((permission) => !isPermission(permission))) return res.status(400).json({ message: "Role contains an unknown permission" });
  const slug = roleSlug(body.name);
  if (await WorkspaceRole.exists({ organization: oid(req), slug })) return res.status(409).json({ message: "A role with this name already exists" });
  const role = await WorkspaceRole.create({ organization: oid(req), name: body.name.trim(), slug, description: body.description || "", permissions: uniquePermissions(body.permissions), rank: body.rank ?? 20, isSystem: false });
  return res.status(201).json({ role: publicRole(role) });
});

router.patch("/roles/:id", async (req: AuthRequest, res) => {
  if (!requireAdmin(req, res)) return;
  const body = parseOr400(rolePatch, req.body, res);
  if (!body) return;
  if (body.permissions?.some((permission) => !isPermission(permission))) return res.status(400).json({ message: "Role contains an unknown permission" });
  const role: any = await WorkspaceRole.findOne({ _id: req.params.id, organization: oid(req) });
  if (!role) return res.status(404).json({ message: "Role not found" });
  if (role.slug === "admin") return res.status(400).json({ message: "The Administrator role always retains full permissions" });
  const nextName = body.name?.trim() || role.name;
  const nextSlug = role.isSystem ? role.slug : roleSlug(nextName);
  const collision = await WorkspaceRole.findOne({ organization: oid(req), slug: nextSlug });
  if (collision && String(collision._id) !== String(role._id)) return res.status(409).json({ message: "A role with this name already exists" });
  const update: any = { ...body, name: nextName, slug: nextSlug };
  if (body.permissions) update.permissions = uniquePermissions(body.permissions);
  const updated: any = await WorkspaceRole.findOneAndUpdate({ _id: role._id, organization: oid(req) }, update, { new: true });
  if (nextSlug !== role.slug) {
    await Promise.all([
      OrganizationMembership.updateMany({ organization: oid(req), role: role.slug }, { role: nextSlug }),
      Invitation.updateMany({ organization: oid(req), role: role.slug }, { role: nextSlug }),
      WorkspaceGroupAccess.updateMany({ workspace: oid(req), role: role.slug }, { role: nextSlug }),
    ]);
  }
  return res.json({ role: publicRole(updated) });
});

router.delete("/roles/:id", async (req: AuthRequest, res) => {
  if (!requireAdmin(req, res)) return;
  const role: any = await WorkspaceRole.findOne({ _id: req.params.id, organization: oid(req) });
  if (!role) return res.status(404).json({ message: "Role not found" });
  if (role.isSystem) return res.status(400).json({ message: "Built-in roles cannot be deleted" });
  const [members, invitations, groupGrants] = await Promise.all([
    OrganizationMembership.countDocuments({ organization: oid(req), role: role.slug }),
    Invitation.countDocuments({ organization: oid(req), role: role.slug, status: "pending" }),
    WorkspaceGroupAccess.countDocuments({ workspace: oid(req), role: role.slug }),
  ]);
  if (members || invitations || groupGrants) return res.status(409).json({ message: "Reassign users, invitations, and group access before deleting this role" });
  await WorkspaceRole.findOneAndDelete({ _id: role._id, organization: oid(req) });
  return res.status(204).send();
});

router.get("/users", async (req: AuthRequest, res) => { const memberships = await OrganizationMembership.find({ organization: oid(req) }).populate("user", "name email avatarColor notificationPreferences"); return res.json({ users: memberships.map((m: any) => ({ ...(m.user?.toObject?.() || {}), role: m.role, inviteStatus: m.status, skills: m.skills, availability: m.availability, capacity: m.capacity })) }); });
router.get("/users/:id", async (req: AuthRequest, res) => {
  const membership: any = await OrganizationMembership.findOne({ user: req.params.id, organization: oid(req) }).populate("user", "name email avatarColor notificationPreferences");
  return membership ? res.json({ user: { ...(membership.user?.toObject?.() || {}), role: membership.role, inviteStatus: membership.status, skills: membership.skills, availability: membership.availability, capacity: membership.capacity } }) : res.status(404).json({ message: "User not found" });
});
router.patch("/users/:id", async (req: AuthRequest, res) => {
  const body = parseOr400(userPatch, req.body, res); if (!body) return;
  const isAdmin = req.user!.role === "admin";
  const isSelf = req.params.id === uid(req);
  if (!isAdmin && !isSelf) return res.status(403).json({ message: "You do not have permission to update this user" });
  if (!isAdmin && body.role !== undefined) return res.status(403).json({ message: "Only admins can change user roles" });
  if (body.role && !(await WorkspaceRole.exists({ organization: oid(req), slug: body.role }))) return res.status(400).json({ message: "Role does not exist in this workspace" });
  const membershipFields = Object.fromEntries(Object.entries(body).filter(([key]) => ["role", "skills", "availability", "capacity"].includes(key)));
  const profileFields = Object.fromEntries(Object.entries(body).filter(([key]) => ["name", "avatarColor"].includes(key)));
  const membership: any = await OrganizationMembership.findOneAndUpdate({ user: req.params.id, organization: oid(req) }, membershipFields, { new: true }).populate("user", "name email avatarColor notificationPreferences");
  if (!membership) return res.status(404).json({ message: "User not found" });
  invalidateWorkspaceMembership(String(req.params.id), String(oid(req)));
  if (Object.keys(profileFields).length) await User.updateOne({ _id: req.params.id }, profileFields);
  await membership.populate("user", "name email avatarColor notificationPreferences"); await audit(req, "user.updated", "user", req.params.id); return res.json({ user: { ...(membership.user?.toObject?.() || {}), role: membership.role, inviteStatus: membership.status, skills: membership.skills, availability: membership.availability, capacity: membership.capacity } });
});
router.post("/users/:id/deactivate", requireRole(["admin"]), async (req: AuthRequest, res) => {
  if (req.params.id === uid(req)) return res.status(400).json({ message: "You cannot deactivate yourself" });
  const membership = await OrganizationMembership.findOneAndUpdate({ user: req.params.id, organization: oid(req) }, { status: "disabled" }, { new: true });
  if (!membership) return res.status(404).json({ message: "User not found" }); invalidateWorkspaceMembership(String(req.params.id), String(oid(req))); await Session.updateMany({ user: req.params.id, organization: oid(req) }, { revokedAt: new Date() }); return res.json({ membership });
});
router.post("/users/:id/reactivate", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const membership = await OrganizationMembership.findOneAndUpdate({ user: req.params.id, organization: oid(req) }, { status: "active" }, { new: true }); if (membership) invalidateWorkspaceMembership(String(req.params.id), String(oid(req))); return membership ? res.json({ membership }) : res.status(404).json({ message: "User not found" });
});
router.delete("/users/:id", requireRole(["admin"]), async (req: AuthRequest, res) => {
  if (req.params.id === uid(req)) return res.status(400).json({ message: "You cannot delete yourself" });
  const membership = await OrganizationMembership.findOneAndDelete({ user: req.params.id, organization: oid(req) }); if (!membership) return res.status(404).json({ message: "User not found" }); invalidateWorkspaceMembership(String(req.params.id), String(oid(req))); await Session.updateMany({ user: req.params.id, organization: oid(req) }, { revokedAt: new Date() }); return res.status(204).send();
});

router.get("/projects/:id", async (req: AuthRequest, res) => { const project = await Project.findOne({ _id: req.params.id, organization: oid(req) }); if (!project) return res.status(404).json({ message: "Project not found" }); if (!canAccessProject(req, project)) return res.status(403).json({ message: "You do not have access to this project" }); return res.json({ project: await project.populate("members", "name email role") }); });
router.put("/projects/:id/members", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ userIds: z.array(z.string()) }), req.body, res); if (!body) return; const existing = await Project.findOne({ _id: req.params.id, organization: oid(req) }); if (!existing) return res.status(404).json({ message: "Project not found" }); if (!canManageProject(req, existing)) return res.status(403).json({ message: "Only an assigned manager can manage this project" }); const count = await OrganizationMembership.countDocuments({ user: { $in: body.userIds }, organization: oid(req), status: "active" }); if (count !== new Set(body.userIds).size) return res.status(400).json({ message: "Invalid member" }); const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { members: body.userIds }, { new: true }).populate("members", "name email"); return res.json({ project }); });
router.post("/projects/:id/archive", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const existing = await Project.findOne({ _id: req.params.id, organization: oid(req) }); if (!existing) return res.status(404).json({ message: "Project not found" }); if (!canManageProject(req, existing)) return res.status(403).json({ message: "You do not have access to this project" }); const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "done" }, { new: true }); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });
router.post("/projects/:id/restore", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const existing = await Project.findOne({ _id: req.params.id, organization: oid(req) }); if (!existing) return res.status(404).json({ message: "Project not found" }); if (!canManageProject(req, existing)) return res.status(403).json({ message: "You do not have access to this project" }); const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "active" }, { new: true }); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });

router.get("/backlog", async (req: AuthRequest, res) => { const visibleProjectIds = await accessibleProjectIds(req); const search = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : ""; const label = typeof req.query.label === "string" ? req.query.label.trim().slice(0, 100) : ""; const tickets = await Ticket.find({ organization: oid(req), status: "Backlog", ...(visibleProjectIds ? { project: { $in: visibleProjectIds } } : {}), ...(req.query.project ? { project: visibleProjectIds ? { $in: visibleProjectIds.filter((id) => String(id) === String(req.query.project)) } : String(req.query.project) } : {}), ...(search ? { $or: [{ title: new RegExp(escapeRegExp(search), "i") }, { ticketId: new RegExp(escapeRegExp(search), "i") }] } : {}), ...(label ? { labels: new RegExp(`^${escapeRegExp(label)}$`, "i") } : {}) }).sort("createdAt").limit(100); return res.json({ tickets, items: tickets, nextCursor: null, total: tickets.length }); });
router.post("/sprints/:id/start", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const sprint = await Sprint.findOne({ _id: req.params.id, organization: oid(req) }); if (!sprint) return res.status(404).json({ message: "Sprint not found" }); const project = await Project.findOne({ _id: sprint.project, organization: oid(req) }); if (!canManageProject(req, project)) return res.status(403).json({ message: "You do not have access to this sprint" }); await Sprint.updateMany({ organization: oid(req), project: sprint.project, status: "active" }, { status: "planned" }); sprint.status = "active"; await sprint.save(); await refreshWorkspaceProgress(oid(req)!); return res.json({ sprint }); });
router.post("/sprints/:id/complete", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ moveIncompleteToSprint: z.string().nullable().optional() }), req.body ?? {}, res); if (!body) return; const existing = await Sprint.findOne({ _id: req.params.id, organization: oid(req) }); if (!existing) return res.status(404).json({ message: "Sprint not found" }); const project = await Project.findOne({ _id: existing.project, organization: oid(req) }); if (!canManageProject(req, project)) return res.status(403).json({ message: "You do not have access to this sprint" }); if (body.moveIncompleteToSprint && !(await Sprint.exists({ _id: body.moveIncompleteToSprint, organization: oid(req), project: existing.project }))) return res.status(400).json({ message: "Target sprint is invalid" }); const sprint = await Sprint.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "completed" }, { new: true }); if (body.moveIncompleteToSprint) await Ticket.updateMany({ organization: oid(req), project: existing.project, sprint: existing._id, status: { $ne: "Done" } }, { sprint: body.moveIncompleteToSprint }); await refreshWorkspaceProgress(oid(req)!); return res.json({ sprint }); });
router.post("/sprints/:id/reopen", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const existing = await Sprint.findOne({ _id: req.params.id, organization: oid(req) }); if (!existing) return res.status(404).json({ message: "Sprint not found" }); const project = await Project.findOne({ _id: existing.project, organization: oid(req) }); if (!canManageProject(req, project)) return res.status(403).json({ message: "You do not have access to this sprint" }); const sprint = await Sprint.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "active" }, { new: true }); if (sprint) await refreshWorkspaceProgress(oid(req)!); return sprint ? res.json({ sprint }) : res.status(404).json({ message: "Sprint not found" }); });

router.post("/tickets/bulk", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ ids: z.array(z.string()).min(1), update: z.object({ status: z.enum(["Backlog", "To Do", "In Progress", "In Review", "Done"]).optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(), assignee: z.string().nullable().optional(), sprint: z.string().nullable().optional(), blocked: z.boolean().optional() }) }), req.body, res);
  if (!body) return;
  const items = await Ticket.find({ _id: { $in: body.ids }, organization: oid(req) });
  if (items.length !== new Set(body.ids).size) return res.status(404).json({ message: "One or more tickets were not found" });
  for (const ticket of items) if (!await canAccessTicket(req, ticket)) return res.status(403).json({ message: "You do not have access to one or more tickets" });
  if (body.update.assignee && !(await OrganizationMembership.exists({ user: body.update.assignee, organization: oid(req), status: "active" }))) return res.status(400).json({ message: "Assignee is invalid" });
  if (body.update.sprint && !(await Sprint.exists({ _id: body.update.sprint, organization: oid(req) }))) return res.status(400).json({ message: "Sprint is invalid" });
  if (body.update.status) {
    await Promise.all(items.map(async (ticket) => { const fromStatus = ticket.status; Object.assign(ticket, body.update); ticket.history.push({ event: `Moved to ${body.update.status}`, createdAt: new Date() }); ticket.statusTransitions.push(statusTransition(fromStatus, body.update.status!, new Date(), uid(req))); if (body.update.status === "Done" && !ticket.resolvedAt) ticket.resolvedAt = new Date(); applySlaState(ticket); await ticket.save(); await applyWorkspaceRules(oid(req)!, "ticket.status.changed", ticket); }));
    await refreshWorkspaceProgress(oid(req)!);
    return res.json({ matched: items.length, modified: items.length });
  }
  await Promise.all(items.map(async (ticket) => { const wasAssigned = String(ticket.assignee || ""); Object.assign(ticket, body.update); await ticket.save(); if (body.update.assignee !== undefined && String(ticket.assignee || "") !== wasAssigned) await applyWorkspaceRules(oid(req)!, "ticket.assigned", ticket); }));
  await refreshWorkspaceProgress(oid(req)!);
  return res.json({ matched: items.length, modified: items.length });
});
router.post("/tickets/:id/assign", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ assignee: z.string().nullable() }), req.body, res); if (!body) return; const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, existing))) return; if (!req.user!.permissions?.includes("tickets.manage") && body.assignee !== uid(req)) return res.status(403).json({ message: "Contributors may only assign tickets to themselves" }); if (body.assignee && !(await OrganizationMembership.exists({ user: body.assignee, organization: oid(req), status: "active" }))) return res.status(404).json({ message: "Assignee not found" }); const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, body.assignee ? { assignee: body.assignee } : { $unset: { assignee: 1 } }, { new: true }); if (ticket) await applyWorkspaceRules(oid(req)!, "ticket.assigned", ticket); return res.json({ ticket }); });
router.post("/tickets/:id/archive", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, existing)) || !existing) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { archivedAt: new Date() }, { new: true }); if (ticket) await refreshWorkspaceProgress(oid(req)!); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.post("/tickets/:id/restore", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, existing)) || !existing) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $unset: { archivedAt: 1 } }, { new: true }); if (ticket) await refreshWorkspaceProgress(oid(req)!); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.patch("/tickets/:id/rank", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ rank: z.coerce.number().finite(), sprint: z.string().nullable().optional(), status: z.enum(["Backlog", "To Do", "In Progress", "In Review", "Done"]).optional() }), req.body, res); if (!body) return; const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; if (!req.user!.permissions?.includes("tickets.manage") && String(ticket.assignee || "") !== uid(req)) return res.status(403).json({ message: "Only ticket managers or assignees may rank this ticket" }); if (body.sprint && !(await Sprint.exists({ _id: body.sprint, organization: oid(req), project: ticket.project }))) return res.status(400).json({ message: "Sprint is invalid for this ticket project" }); const fromStatus = ticket.status; ticket.rank = body.rank; if (body.status) { ticket.status = body.status; ticket.history.push({ event: `Moved to ${body.status}`, createdAt: new Date() }); ticket.statusTransitions.push(statusTransition(fromStatus, body.status, new Date(), uid(req))); if (body.status === "Done" && !ticket.resolvedAt) ticket.resolvedAt = new Date(); } if (body.sprint === null) ticket.sprint = null; else if (body.sprint) ticket.sprint = body.sprint; applySlaState(ticket); await ticket.save(); if (body.status && body.status !== fromStatus) await applyWorkspaceRules(oid(req)!, "ticket.status.changed", ticket); await refreshWorkspaceProgress(oid(req)!); return res.json({ ticket }); });
router.post("/tickets/:id/links", async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ type: z.enum(["blocks", "is-blocked-by", "relates-to", "duplicates"]), ticket: z.string().min(1) }), req.body, res);
  if (!body) return;
  const [source, target] = await Promise.all([
    Ticket.findOne({ _id: req.params.id, organization: oid(req) }),
    Ticket.findOne({ _id: body.ticket, organization: oid(req) }),
  ]);
  if (!(await requireTicketAccess(req, res, source)) || !source) return;
  if (!(await requireTicketAccess(req, res, target)) || !target) return;
  if (String(source._id) === String(target._id)) return res.status(400).json({ message: "A ticket cannot link to itself" });
  if (source.issueLinks.some((link: any) => link.type === body.type && String(link.ticket) === String(target._id))) {
    return res.status(409).json({ message: "This ticket link already exists" });
  }
  source.issueLinks.push({ id: randomUUID(), ...body, createdAt: new Date(), createdBy: uid(req) });
  await source.save();
  await audit(req, "ticket.linked", "ticket", source._id, { type: body.type, ticket: target.ticketId });
  return res.status(201).json({ ticket: source });
});
router.post("/tickets/:id/watch", async (req: AuthRequest, res) => { const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, existing)) || !existing) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $addToSet: { watchers: uid(req) } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.delete("/tickets/:id/watch", async (req: AuthRequest, res) => { const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, existing)) || !existing) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $pull: { watchers: uid(req) } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.get("/tickets/:id/history", async (req: AuthRequest, res) => { const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }).select("history"); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; return res.json({ history: ticket.history }); });
router.patch("/tickets/:id/comments/:commentId", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ body: z.string().min(1) }), req.body, res); if (!body) return; const [ticket, user] = await Promise.all([Ticket.findOne({ _id: req.params.id, organization: oid(req) }), User.findById(uid(req))]); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; const comment = ticket.comments.find((item: any) => String(item._id ?? item.id) === req.params.commentId); if (!comment) return res.status(404).json({ message: "Comment not found" }); if (!req.user!.permissions?.includes("tickets.manage") && !ownedBy(comment, req, user)) return res.status(403).json({ message: "You may only edit your own comments" }); comment.body = body.body; await ticket.save(); return res.json({ ticket }); });
router.delete("/tickets/:id/comments/:commentId", async (req: AuthRequest, res) => { const [ticket, user] = await Promise.all([Ticket.findOne({ _id: req.params.id, organization: oid(req) }), User.findById(uid(req))]); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; const comment = ticket.comments.find((item: any) => String(item._id ?? item.id) === req.params.commentId); if (!comment) return res.status(404).json({ message: "Comment not found" }); if (!req.user!.permissions?.includes("tickets.manage") && !ownedBy(comment, req, user)) return res.status(403).json({ message: "You may only delete your own comments" }); ticket.comments = ticket.comments.filter((item: any) => String(item._id ?? item.id) !== req.params.commentId); await ticket.save(); return res.json({ ticket }); });
router.patch("/tickets/:id/work-logs/:logId", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ hours: z.number().min(.25).max(24).optional(), note: z.string().min(1).optional() }), req.body, res); if (!body) return; const [ticket, user] = await Promise.all([Ticket.findOne({ _id: req.params.id, organization: oid(req) }), User.findById(uid(req))]); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; const log = ticket.workLogs.find((item: any) => String(item._id ?? item.id) === req.params.logId); if (!log) return res.status(404).json({ message: "Work log not found" }); if (!req.user!.permissions?.includes("tickets.manage") && !ownedBy(log, req, user)) return res.status(403).json({ message: "You may only edit your own work logs" }); Object.assign(log, body); await ticket.save(); return res.json({ ticket }); });
router.delete("/tickets/:id/work-logs/:logId", async (req: AuthRequest, res) => { const [ticket, user] = await Promise.all([Ticket.findOne({ _id: req.params.id, organization: oid(req) }), User.findById(uid(req))]); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; const log = ticket.workLogs.find((item: any) => String(item._id ?? item.id) === req.params.logId); if (!log) return res.status(404).json({ message: "Work log not found" }); if (!req.user!.permissions?.includes("tickets.manage") && !ownedBy(log, req, user)) return res.status(403).json({ message: "You may only delete your own work logs" }); ticket.workLogs = ticket.workLogs.filter((item: any) => String(item._id ?? item.id) !== req.params.logId); await ticket.save(); return res.json({ ticket }); });
router.get("/tickets/attachments/:attachmentId/download", async (req: AuthRequest, res) => {
  const result = await postgres.query("SELECT * FROM ticket_attachments WHERE id = $1 AND organization = $2", [req.params.attachmentId, oid(req)]);
  const attachment = result.rows[0];
  if (!attachment) return res.status(404).json({ message: "Attachment not found" });
  const ticket = await Ticket.findOne({ _id: attachment.ticket, organization: oid(req) });
  if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return;
  if (attachment.source_url) return res.redirect(302, attachment.source_url);
  if (env.attachmentStorageProvider === "supabase" && attachmentStorage().createSignedUrl) {
    return res.redirect(302, await attachmentStorage().createSignedUrl!(attachment.storage_key, 300));
  }
  const stored = await attachmentStorage().get(attachment.storage_key);
  if (!stored) return res.status(404).json({ message: "Attachment content not found" });
  res.type(attachment.mime_type || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(attachment.name)}`);
  for await (const chunk of stored.body) res.write(Buffer.from(chunk));
  return res.end();
});

router.post("/tickets/:id/attachments/presign", async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({
    name: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(255),
    size: z.number().int().min(1).max(10_000_000),
  }), req.body, res);
  if (!body) return;
  const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) });
  if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return;
  if (env.attachmentStorageProvider !== "supabase") return res.status(409).json({ message: "Signed attachment uploads require Supabase Storage" });
  const id = randomUUID();
  const storageKey = `${oid(req)}/${ticket._id}/${id}-${body.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const storage = attachmentStorage();
  if (!storage.createSignedUploadUrl) return res.status(503).json({ message: "Attachment storage is unavailable" });
  let upload;
  try {
    upload = await storage.createSignedUploadUrl(storageKey);
  } catch (error) {
    console.error("Unable to create a signed attachment upload URL", {
      bucket: env.attachmentBucket,
      error,
    });
    return res.status(503).json({
      message: "Attachment storage is unavailable. Please try again shortly.",
    });
  }
  await postgres.query("INSERT INTO ticket_attachments (id, organization, ticket, name, storage_key, mime_type, size, uploaded_by, upload_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'pending')", [id, oid(req), ticket._id, body.name, storageKey, body.mimeType, body.size, uid(req)]);
  return res.status(201).json({ attachment: { id, name: body.name, mimeType: body.mimeType, size: body.size, uploadStatus: "pending" }, upload });
});

router.post("/tickets/:id/attachments/:attachmentId/complete", async (req: AuthRequest, res) => {
  const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) });
  if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return;
  const result = await postgres.query("SELECT * FROM ticket_attachments WHERE id = $1 AND ticket = $2 AND organization = $3", [req.params.attachmentId, ticket._id, oid(req)]);
  const attachment = result.rows[0];
  if (!attachment) return res.status(404).json({ message: "Attachment not found" });
  if (attachment.upload_status === "completed") return res.json({ ticket, attachment });
  const stored = await attachmentStorage().get(attachment.storage_key);
  if (!stored) return res.status(409).json({ message: "Attachment upload has not completed" });
  await postgres.query("UPDATE ticket_attachments SET upload_status = 'completed', uploaded_at = now(), updated_at = now() WHERE id = $1 AND organization = $2", [attachment.id, oid(req)]);
  try {
    ticket.attachments.push({ id: attachment.id, name: attachment.name, url: `/api/v1/tickets/attachments/${attachment.id}/download`, mimeType: attachment.mime_type, size: attachment.size, storage: "supabase", uploadedBy: uid(req), createdAt: new Date() });
    await ticket.save();
  } catch (error) {
    await postgres.query("UPDATE ticket_attachments SET upload_status = 'pending', uploaded_at = NULL, updated_at = now() WHERE id = $1 AND organization = $2", [attachment.id, oid(req)]).catch(() => undefined);
    throw error;
  }
  await audit(req, "ticket.attachment.added", "ticket", ticket._id, { name: attachment.name, size: attachment.size, storage: "supabase" });
  return res.status(201).json({ ticket, attachment: { ...attachment, upload_status: "completed" } });
});

router.post("/tickets/:id/attachments", async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({
    name: z.string().min(1).max(255),
    url: z.string().url().optional(),
    dataUrl: z.string().regex(/^data:[^;]+;base64,/).max(14_000_000).optional(),
    mimeType: z.string().max(255).optional(),
    size: z.number().int().min(0).max(10_000_000).optional(),
  }).refine((value) => Boolean(value.url || value.dataUrl), { message: "A file or URL is required" }), req.body, res);
  if (!body) return;
  if (body.dataUrl && env.attachmentStorageProvider === "supabase") return res.status(400).json({ message: "Use the signed attachment upload flow for production files" });
  const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) });
  if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return;
  const id = randomUUID();
  const storageKey = `${oid(req)}/${ticket._id}/${id}-${body.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  if (body.dataUrl) {
    const comma = body.dataUrl.indexOf(",");
    const data = Buffer.from(body.dataUrl.slice(comma + 1), "base64");
    if (data.length > 10_000_000) return res.status(413).json({ message: "Attachment exceeds the 10 MB limit" });
    await attachmentStorage().put(storageKey, data, body.mimeType || "application/octet-stream");
  }
  await postgres.query("INSERT INTO ticket_attachments (id, organization, ticket, name, storage_key, source_url, mime_type, size, uploaded_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)", [id, oid(req), ticket._id, body.name, storageKey, body.url || null, body.mimeType || "application/octet-stream", body.size || 0, uid(req)]);
  ticket.attachments.push({ id, name: body.name, url: body.url || `/api/v1/tickets/attachments/${id}/download`, mimeType: body.mimeType, size: body.size, storage: body.dataUrl ? "object-storage" : "external", uploadedBy: uid(req), createdAt: new Date() });
  await ticket.save();
  await audit(req, "ticket.attachment.added", "ticket", ticket._id, { name: body.name, size: body.size, storage: body.dataUrl ? "database" : "external" });
  return res.status(201).json({ ticket });
});
router.delete("/tickets/:id/attachments/:attachmentId", async (req: AuthRequest, res) => { const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!(await requireTicketAccess(req, res, ticket)) || !ticket) return; const attachment = ticket.attachments.find((item: any) => String(item._id ?? item.id) === req.params.attachmentId); if (!attachment) return res.status(404).json({ message: "Attachment not found" }); if (!req.user!.permissions?.includes("tickets.manage") && !ownedBy(attachment, req)) return res.status(403).json({ message: "You may only delete your own attachments" }); const stored = await postgres.query("SELECT storage_key, source_url FROM ticket_attachments WHERE id = $1 AND organization = $2", [req.params.attachmentId, oid(req)]); if (stored.rows[0]) { if (!stored.rows[0].source_url) await attachmentStorage().remove(stored.rows[0].storage_key); await postgres.query("DELETE FROM ticket_attachments WHERE id = $1 AND organization = $2", [req.params.attachmentId, oid(req)]); } ticket.attachments = ticket.attachments.filter((item: any) => String(item._id ?? item.id) !== req.params.attachmentId); await ticket.save(); return res.json({ ticket }); });
router.delete("/tickets/:id", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const existing = await Ticket.findOne({ _id: req.params.id, organization: oid(req), deletedAt: { $exists: false } });
  if (!(await requireTicketAccess(req, res, existing)) || !existing) return;
  const deletedAt = new Date();
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: oid(req), deletedAt: { $exists: false } },
    { deletedAt, deletedBy: uid(req), purgeAfter: new Date(deletedAt.getTime() + 7 * 24 * 60 * 60_000) },
    { new: true },
  );
  if (ticket) await refreshWorkspaceProgress(oid(req)!);
  return ticket ? res.json({ ticket, undoUntil: new Date(deletedAt.getTime() + 10_000) }) : res.status(404).json({ message: "Ticket not found" });
});
router.post("/tickets/:id/undelete", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const ticket = await Ticket.findOneAndUpdate(
    { _id: req.params.id, organization: oid(req), deletedAt: { $exists: true } },
    { $unset: { deletedAt: true, deletedBy: true, purgeAfter: true } },
    { new: true },
  );
  if (ticket) await refreshWorkspaceProgress(oid(req)!);
  return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Deleted ticket not found" });
});
router.post("/tickets/:id/clone", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const source = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }).lean(); if (!source) return res.status(404).json({ message: "Ticket not found" }); if (!await canAccessTicket(req, source)) return res.status(403).json({ message: "You do not have access to this project" }); const project = await Project.findOne({ _id: source.project, organization: oid(req) }); if (!project) return res.status(404).json({ message: "Project not found" }); const counter = await Counter.findOneAndUpdate({ organization: oid(req), scope: `ticket:${source.project}` }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }); const { _id, createdAt, updatedAt, ...copy } = source as typeof source & { createdAt?: Date; updatedAt?: Date }; const ticket = await Ticket.create({ ...copy, title: `${source.title} (copy)`, ticketId: `${project.key}-${counter!.value}`, history: [{ event: "Cloned", createdAt: new Date() }] }); await refreshWorkspaceProgress(oid(req)!); return res.status(201).json({ ticket }); });

router.route("/resources/:kind")
  .get(async (req: AuthRequest, res) => {
    const kind = String(req.params.kind);
    if (!resourceKinds.includes(kind as never)) return res.status(404).json({ message: "Resource kind not found" });
    const visibleProjectIds = await accessibleProjectIds(req);
    const requestedProject = req.query.project ? String(req.query.project) : "";
    if (requestedProject && visibleProjectIds && !visibleProjectIds.some((id) => String(id) === requestedProject)) return res.json({ resources: [] });
    const projectVisibility = visibleProjectIds ? { $or: [{ project: { $in: visibleProjectIds } }, { project: null }] } : {};
    return res.json({ resources: await Resources.find({ organization: oid(req), kind, ...projectVisibility, ...(requestedProject ? { project: requestedProject } : {}) }).sort("order name") });
  })
  .post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const kind = String(req.params.kind);
    if (!resourceKinds.includes(kind as never)) return res.status(404).json({ message: "Resource kind not found" });
    const body = parseOr400(z.object({ name: z.string().min(1), project: z.string().optional(), key: z.string().optional(), description: z.string().default(""), status: z.string().default("active"), order: z.number().default(0), config: z.record(z.string(), z.unknown()).default({}) }), req.body, res);
    if (!body) return;
    if (kind === "issue-type" && body.name.trim().toLowerCase() === "epic") return res.status(400).json({ message: "Epic is a ticket grouping and cannot be created as a ticket type" });
    if (body.project && !canAccessProject(req, await Project.findOne({ _id: body.project, organization: oid(req) }))) return res.status(403).json({ message: "You do not have access to this project" });
    const resource = await Resources.create({ ...body, kind, organization: oid(req) });
    if (kind === "epic") await refreshWorkspaceProgress(oid(req)!);
    return res.status(201).json({ resource });
  });

router.route("/resources/:kind/:id")
  .get(async (req: AuthRequest, res) => {
    const resource = await Resources.findOne({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) });
    if (resource && !await canAccessResource(req, resource)) return res.status(403).json({ message: "You do not have access to this resource" });
    return resource ? res.json({ resource }) : res.status(404).json({ message: "Resource not found" });
  })
  .patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const body = parseOr400(z.object({ name: z.string().trim().min(1).max(160).optional(), key: z.string().trim().max(100).optional(), description: z.string().max(5000).optional(), status: z.string().trim().min(1).max(40).optional(), order: z.number().finite().optional(), config: z.record(z.string(), z.unknown()).optional() }), req.body, res);
    if (!body) return;
    const kind = String(req.params.kind);
    if (kind === "issue-type" && body.name?.toLowerCase() === "epic") return res.status(400).json({ message: "Epic is a ticket grouping and cannot be used as a ticket type" });
    const existing = await Resources.findOne({ _id: String(req.params.id), organization: oid(req), kind });
    if (!existing) return res.status(404).json({ message: "Resource not found" });
    if (!await canAccessResource(req, existing)) return res.status(403).json({ message: "You do not have access to this resource" });
    const resource = await Resources.findOneAndUpdate({ _id: String(req.params.id), organization: oid(req), kind }, body, { new: true, runValidators: true });
    if (resource && kind === "epic") await refreshWorkspaceProgress(oid(req)!);
    return resource ? res.json({ resource }) : res.status(404).json({ message: "Resource not found" });
  })
  .delete(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
    const existing = await Resources.findOne({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) });
    if (!existing) return res.status(404).json({ message: "Resource not found" });
    if (!await canAccessResource(req, existing)) return res.status(403).json({ message: "You do not have access to this resource" });
    const resource = await Resources.findOneAndDelete({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) });
    return resource ? res.status(204).send() : res.status(404).json({ message: "Resource not found" });
  });

router.get("/notifications", async (req: AuthRequest, res) => res.json({ notifications: await Notification.find({ organization: oid(req), user: uid(req) }).sort("-createdAt").limit(100), unread: await Notification.countDocuments({ organization: oid(req), user: uid(req), readAt: { $exists: false } }) }));
router.patch("/notifications/:id/read", async (req: AuthRequest, res) => { const notification = await Notification.findOneAndUpdate({ _id: req.params.id, organization: oid(req), user: uid(req) }, { readAt: new Date() }, { new: true }); return notification ? res.json({ notification }) : res.status(404).json({ message: "Notification not found" }); });
router.post("/notifications/read-all", async (req: AuthRequest, res) => { await Notification.updateMany({ organization: oid(req), user: uid(req), readAt: { $exists: false } }, { readAt: new Date() }); return res.json({ ok: true }); });
router.get("/audit-logs", requireRole(["admin"]), async (req: AuthRequest, res) => res.json({ events: await AuditEvent.find({ organization: oid(req) }).sort("-createdAt").limit(200).populate("actor", "name email") }));
router.get("/audit-logs/export", requireRole(["admin"]), async (req: AuthRequest, res) => { const events = await AuditEvent.find({ organization: oid(req) }).sort("createdAt").populate("actor", "name email").lean(); const header = "timestamp,action,entityType,entityId,actor,metadata"; const csv = [header, ...events.map((event: any) => [event.createdAt?.toISOString() || "", event.action, event.entityType || "", event.entityId || "", event.actor?.email || event.actor?.name || "", JSON.stringify(event.metadata || {})].map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))].join("\n"); return res.type("text/csv").set("Content-Disposition", `attachment; filename=audit-log-${new Date().toISOString().slice(0, 10)}.csv`).send(csv); });

router.route("/integrations/:kind").get(requireRole(["admin"]), async (req: AuthRequest, res) => res.json({ integrations: await Integrations.find({ organization: oid(req), kind: String(req.params.kind) }).select("-secretHash -secretCiphertext") })).post(requireRole(["admin"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ name: z.string().trim().min(1).max(120), url: z.string().url().optional(), events: z.array(z.string().min(1)).max(100).default([]) }), req.body, res); if (!body) return; const kind = String(req.params.kind); if (!["api-token", "webhook"].includes(kind)) return res.status(404).json({ message: "Integration kind not found" }); const secret = `itrk_${randomBase64UrlToken()}`; const integration = await Integrations.create({ ...body, organization: oid(req), kind, createdBy: uid(req), ...(kind === "api-token" ? { secretHash: hash(secret) } : { secretCiphertext: encryptSecret(secret), secretHash: hash(secret) }) }); const publicIntegration = integration.toObject(); delete publicIntegration.secretHash; delete publicIntegration.secretCiphertext; return res.status(201).json({ integration: publicIntegration, ...(kind === "api-token" ? { token: secret } : { secret }) }); });
router.post("/integrations/:kind/:id/test", requireRole(["admin"]), async (req: AuthRequest, res) => { const integration = await Integrations.findOne({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }); if (!integration) return res.status(404).json({ message: "Integration not found" }); try { return res.json(await testIntegration(integration)); } catch { await Integrations.findOneAndUpdate({ _id: integration._id }, { failureCount: Number(integration.failureCount || 0) + 1, lastError: "Test delivery failed", lastDeliveryAt: new Date() }); return res.status(502).json({ ok: false, status: "failed", message: "Integration test delivery failed" }); } });
router.delete("/integrations/:kind/:id", requireRole(["admin"]), async (req: AuthRequest, res) => { const item = await Integrations.findOneAndDelete({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }); return item ? res.status(204).send() : res.status(404).json({ message: "Integration not found" }); });

router.patch("/organization", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({
    name: z.string().trim().min(2).optional(),
    plan: z.enum(["starter", "scale", "enterprise"]).optional(),
  }), req.body, res);
  if (!body) return;
  const organizationId = oid(req)!;
  const current = await Organization.findById(organizationId);
  if (!current) return res.status(404).json({ message: "Organization not found" });
  const update = { ...body } as typeof body & { slug?: string };
  if (body.name !== undefined && body.name !== current.name) {
    update.slug = await uniqueWorkspaceSlug(body.name, organizationId);
  }
  const organization = await Organization.findByIdAndUpdate(organizationId, update, { new: true });
  return res.json({ organization });
});
router.delete("/organization", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ confirmationName: z.string().min(1), currentPassword: z.string().min(1) }), req.body, res); if (!body) return;
  const [organization, user] = await Promise.all([Organization.findById(oid(req)), User.findById(uid(req))]);
  if (!organization || !user) return res.status(404).json({ message: "Organization or user not found" });
  if (body.confirmationName !== organization.name) return res.status(409).json({ message: "Organization name does not match" });
  if (!(await bcrypt.compare(body.currentPassword, user.passwordHash))) return res.status(401).json({ message: "Current password is incorrect" });
  await withTransaction(async (client) => {
    await client.query("UPDATE users SET last_active_organization = NULL WHERE last_active_organization = $1", [organization._id]);
    await client.query("UPDATE organizations SET owner = NULL WHERE id = $1", [organization._id]);
    const attachmentKeys = (await postgres.query<{ storage_key: string; source_url: string | null }>("SELECT storage_key, source_url FROM ticket_attachments WHERE organization = $1", [organization._id])).rows;
    const tables = ["sessions", "action_tokens", "notifications", "audit_events", "integrations", "counters", "ticket_attachments", "workspace_resources", "tickets", "cycles", "sprints", "projects", "organization_memberships", "invitations"];
    for (const table of tables) await client.query(`DELETE FROM "${table}" WHERE organization = $1`, [organization._id]);
    const result = await client.query("DELETE FROM organizations WHERE id = $1", [organization._id]);
    if (result.rowCount !== 1) throw new Error("Organization deletion failed");
    const storage = attachmentStorage();
    const deletions = await Promise.allSettled(attachmentKeys.filter((item) => !item.source_url).map((item) => storage.remove(item.storage_key)));
    const failed = deletions.filter((item) => item.status === "rejected");
    if (failed.length) console.error("Some organization attachment objects could not be deleted", { organizationId: organization._id, failed: failed.length });
  });
  return res.status(204).send();
});
router.get("/organization/usage", requireRole(["admin"]), async (req: AuthRequest, res) => { const [users, projects, tickets, storage] = await Promise.all([OrganizationMembership.countDocuments({ organization: oid(req) }), Project.countDocuments({ organization: oid(req) }), Ticket.countDocuments({ organization: oid(req) }), Resources.countDocuments({ organization: oid(req) })]); return res.json({ usage: { users, projects, tickets, resources: storage } }); });
router.get("/export", requireRole(["admin"]), async (req: AuthRequest, res) => { const [organization, memberships, projects, sprints, cycles, tickets, resources, attachments, aiConversations, aiMessages] = await Promise.all([Organization.findById(oid(req)), OrganizationMembership.find({ organization: oid(req) }).populate("user", "name email avatarColor notificationPreferences"), Project.find({ organization: oid(req) }), Sprint.find({ organization: oid(req) }), Cycle.find({ organization: oid(req) }), Ticket.find({ organization: oid(req) }), Resources.find({ organization: oid(req) }), postgres.query("SELECT id, ticket, name, storage_key, source_url, mime_type, size, uploaded_by, upload_status, uploaded_at, created_at FROM ticket_attachments WHERE organization = $1 ORDER BY created_at", [oid(req)]), postgres.query("SELECT * FROM ai_conversations WHERE organization = $1 ORDER BY created_at", [oid(req)]), postgres.query("SELECT messages.* FROM ai_messages messages JOIN ai_conversations conversations ON conversations.id = messages.conversation_id WHERE conversations.organization = $1 ORDER BY messages.created_at", [oid(req)])]); return res.json({ schemaVersion: 1, exportedAt: new Date(), organization, users: memberships.map((m: any) => ({ user: m.user, role: m.role, status: m.status, skills: m.skills, availability: m.availability, capacity: m.capacity })), projects, sprints, cycles, tickets, resources, attachments: attachments.rows, ai: { conversations: aiConversations.rows, messages: aiMessages.rows } }); });
const importItemId = (item: any) => String(item?._id || item?.id || "");
const importDate = (value: unknown, fallback: Date) => {
  const parsed = value ? new Date(String(value)) : fallback;
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
};
const importJson = (value: unknown, fallback: unknown) => JSON.stringify(value ?? fallback);
const normalizeImportedTicketType = (value: unknown) => {
  const ticketType = String(value || "Task").trim();
  const builtInAliases: Record<string, string> = {
    epic: "Task",
    "feature / user story": "Story",
    "engineering task": "Task",
    "software defect / bug": "Bug",
    "child sub-task": "Sub-task",
    subtask: "Sub-task",
  };
  return builtInAliases[ticketType.toLowerCase()] || ticketType;
};
const workspaceImportSchema = z.object({
  schemaVersion: z.number().int().min(1).max(1).default(1),
  organization: z.record(z.string(), z.unknown()).optional(),
  users: z.array(z.object({
    user: z.record(z.string(), z.unknown()),
    role: z.string().min(1),
    status: z.string().default("active"),
    skills: z.array(z.string()).default([]),
    availability: z.number().min(0).max(1).default(1),
    capacity: z.number().min(0).max(168).default(32),
  })).default([]),
  projects: z.array(z.record(z.string(), z.unknown())).default([]),
  sprints: z.array(z.record(z.string(), z.unknown())).default([]),
  cycles: z.array(z.record(z.string(), z.unknown())).default([]),
  tickets: z.array(z.record(z.string(), z.unknown())).default([]),
  resources: z.array(z.record(z.string(), z.unknown())).default([]),
  attachments: z.array(z.record(z.string(), z.unknown())).default([]),
  ai: z.object({ conversations: z.array(z.record(z.string(), z.unknown())).default([]), messages: z.array(z.record(z.string(), z.unknown())).default([]) }).default({ conversations: [], messages: [] }),
});

router.post("/import", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const body = parseOr400(workspaceImportSchema, req.body, res);
  if (!body) return;
  const organizationId = oid(req)!;
  const actorId = uid(req)!;
  const imported = { users: 0, projects: 0, sprints: 0, cycles: 0, tickets: 0, resources: 0, attachments: 0 };
  const skipped: Array<{ kind: string; name: string; reason: string }> = [];
  const projectIds = new Map<string, string>();
  const sprintIds = new Map<string, string>();
  const userIds = new Map<string, string>();
  const client = await postgres.connect();
  try {
    await client.query("BEGIN");
    for (const membership of body.users) {
      const email = String(membership.user.email || "").trim().toLowerCase();
      if (!email) { skipped.push({ kind: "user", name: "unknown", reason: "Missing email" }); continue; }
      const existing = await client.query("SELECT id FROM users WHERE lower(email) = lower($1)", [email]);
      if (!existing.rows[0]) { skipped.push({ kind: "user", name: email, reason: "User does not exist; credentials are never imported" }); continue; }
      const userId = String(existing.rows[0].id);
      userIds.set(importItemId(membership.user), userId);
      const membershipResult = await client.query("SELECT id FROM organization_memberships WHERE user_id = $1 AND organization = $2", [userId, organizationId]);
      if (membershipResult.rows[0]) {
        await client.query("UPDATE organization_memberships SET role = $1, status = $2, skills = $3::jsonb, availability = $4, capacity = $5, updated_at = now() WHERE id = $6", [membership.role, membership.status === "disabled" ? "disabled" : "active", importJson(membership.skills, []), membership.availability, membership.capacity, membershipResult.rows[0].id]);
      } else {
        await client.query("INSERT INTO organization_memberships (user_id, organization, role, status, skills, availability, capacity) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)", [userId, organizationId, membership.role, membership.status === "disabled" ? "disabled" : "active", importJson(membership.skills, []), membership.availability, membership.capacity]);
      }
      imported.users += 1;
    }
    for (const source of body.projects) {
      const key = String(source.key || "").trim().toUpperCase();
      const name = String(source.name || "").trim();
      if (!key || !name) { skipped.push({ kind: "project", name: name || key || "unknown", reason: "Project key and name are required" }); continue; }
      const duplicate = await client.query("SELECT id FROM projects WHERE organization = $1 AND key = $2", [organizationId, key]);
      if (duplicate.rows[0]) { projectIds.set(importItemId(source), String(duplicate.rows[0].id)); skipped.push({ kind: "project", name, reason: "Project key already exists" }); continue; }
      const id = randomUUID();
      await client.query("INSERT INTO projects (id, organization, key, name, description, status, progress, risk_level, active_sprint, members) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)", [id, organizationId, key, name, String(source.description || ""), String(source.status || "planning"), Number(source.progress || 0), String(source.riskLevel || "low"), source.activeSprint || null, importJson((source.members as unknown[]) || [], [])]);
      projectIds.set(importItemId(source), id); imported.projects += 1;
    }
    for (const source of body.sprints) {
      const projectId = projectIds.get(String(source.project || "")) || String(source.project || "");
      const name = String(source.name || "").trim();
      if (!projectId || !name) { skipped.push({ kind: "sprint", name: name || "unknown", reason: "Sprint project and name are required" }); continue; }
      const projectExists = await client.query("SELECT id FROM projects WHERE id = $1 AND organization = $2", [projectId, organizationId]);
      if (!projectExists.rows[0]) { skipped.push({ kind: "sprint", name, reason: "Referenced project does not exist" }); continue; }
      const duplicate = await client.query("SELECT id FROM sprints WHERE organization = $1 AND project = $2 AND name = $3", [organizationId, projectId, name]);
      if (duplicate.rows[0]) { sprintIds.set(importItemId(source), String(duplicate.rows[0].id)); skipped.push({ kind: "sprint", name, reason: "Sprint already exists" }); continue; }
      const id = randomUUID();
      await client.query("INSERT INTO sprints (id, organization, name, project, status, start_date, end_date, capacity, planned_points, completed_points, velocity_history, risk_score) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12)", [id, organizationId, name, projectId, String(source.status || "planned"), importDate(source.startDate, new Date()), importDate(source.endDate, new Date()), Number(source.capacity || 0), Number(source.plannedPoints || 0), Number(source.completedPoints || 0), importJson(source.velocityHistory, []), Number(source.riskScore || 0)]);
      sprintIds.set(importItemId(source), id); imported.sprints += 1;
    }
    for (const source of body.cycles) {
      const name = String(source.name || "").trim();
      if (!name) { skipped.push({ kind: "cycle", name: "unknown", reason: "Cycle name is required" }); continue; }
      const duplicate = await client.query("SELECT id FROM cycles WHERE organization = $1 AND name = $2", [organizationId, name]);
      if (duplicate.rows[0]) { skipped.push({ kind: "cycle", name, reason: "Cycle already exists" }); continue; }
      const sprintRefs = Array.isArray(source.sprints) ? (source.sprints as unknown[]).map((value) => sprintIds.get(String(value)) || String(value)).filter(Boolean) : [];
      await client.query("INSERT INTO cycles (id, organization, name, goal, status, start_date, end_date, sprints) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)", [randomUUID(), organizationId, name, String(source.goal || ""), String(source.status || "planned"), importDate(source.startDate, new Date()), importDate(source.endDate, new Date()), importJson(sprintRefs, [])]);
      imported.cycles += 1;
    }
    for (const source of body.tickets) {
      const ticketId = String(source.ticketId || "").trim();
      const title = String(source.title || "").trim();
      const projectId = projectIds.get(String(source.project || "")) || String(source.project || "");
      if (!ticketId || !title || !projectId) { skipped.push({ kind: "ticket", name: ticketId || title || "unknown", reason: "Ticket key, title, and project are required" }); continue; }
      const projectExists = await client.query("SELECT id FROM projects WHERE id = $1 AND organization = $2", [projectId, organizationId]);
      const duplicate = await client.query("SELECT id FROM tickets WHERE organization = $1 AND ticket_id = $2", [organizationId, ticketId]);
      if (!projectExists.rows[0]) { skipped.push({ kind: "ticket", name: ticketId, reason: "Referenced project does not exist" }); continue; }
      if (duplicate.rows[0]) { skipped.push({ kind: "ticket", name: ticketId, reason: "Ticket key already exists" }); continue; }
      const sprintId = source.sprint ? sprintIds.get(String(source.sprint)) || String(source.sprint) : null;
      await client.query("INSERT INTO tickets (id, organization, ticket_id, title, description, acceptance_criteria, acceptance_criteria_done, status, priority, issue_type, custom_fields, story_points, assignee, reporter, project, sprint, epic, labels, due_date, blocked, dependencies, issue_links, comments, work_logs, history, status_transitions, watchers, attachments, sla_policy, sla_status, rank) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11::jsonb, $12, $13, $14, $15, $16, $17, $18::jsonb, $19, $20, $21::jsonb, $22::jsonb, $23::jsonb, $24::jsonb, $25::jsonb, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb, $30, $31)", [randomUUID(), organizationId, ticketId, title, String(source.description || ""), importJson(source.acceptanceCriteria, []), importJson(source.acceptanceCriteriaDone, []), String(source.status || "Backlog"), String(source.priority || "medium"), normalizeImportedTicketType(source.issueType), importJson(source.customFields, {}), Number(source.storyPoints || 0), source.assignee ? (userIds.get(String(source.assignee)) || null) : null, userIds.get(String(source.reporter)) || actorId, projectId, sprintId, String(source.epic || ""), importJson(source.labels, []), source.dueDate ? importDate(source.dueDate, new Date()) : null, Boolean(source.blocked), importJson(source.dependencies, []), importJson(source.issueLinks, []), importJson(source.comments, []), importJson(source.workLogs, []), importJson(source.history, []), importJson(source.statusTransitions, []), importJson(source.watchers, []), importJson(source.attachments, []), importJson(source.slaPolicy, { firstResponseHours: 8, resolutionHours: 72 }), String(source.slaStatus || "healthy"), Number(source.rank || 0)]);
      imported.tickets += 1;
    }
    for (const source of body.resources) {
      const kind = String(source.kind || "");
      const name = String(source.name || "").trim();
      if (!resourceKinds.includes(kind as never) || !name) { skipped.push({ kind: "resource", name: name || "unknown", reason: "Valid resource kind and name are required" }); continue; }
      if (kind === "issue-type" && name.toLowerCase() === "epic") { skipped.push({ kind, name, reason: "Epic is a ticket grouping, not a ticket type" }); continue; }
      const project = source.project ? (projectIds.get(String(source.project)) || String(source.project)) : null;
      const duplicate = await client.query("SELECT id FROM workspace_resources WHERE organization = $1 AND kind = $2 AND name = $3 AND project IS NOT DISTINCT FROM $4", [organizationId, kind, name, project]);
      if (duplicate.rows[0]) { skipped.push({ kind, name, reason: "Resource already exists" }); continue; }
      await client.query("INSERT INTO workspace_resources (id, organization, project, kind, name, key, description, status, ordering, config) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)", [randomUUID(), organizationId, project, kind, name, source.key || null, String(source.description || ""), String(source.status || "active"), Number(source.order || 0), importJson(source.config, {})]);
      imported.resources += 1;
    }
    for (const source of body.attachments) skipped.push({ kind: "attachment", name: String(source.name || "unknown"), reason: "Attachment metadata was exported; file content must be re-uploaded through signed storage" });
    await client.query("INSERT INTO audit_events (organization, actor, action, entity_type, metadata) VALUES ($1, $2, $3, $4, $5::jsonb)", [organizationId, actorId, "workspace.imported", "workspace", JSON.stringify({ imported, skipped: skipped.length })]);
    await client.query("COMMIT");
    return res.status(201).json({ imported, skipped, warnings: skipped.map((item) => `${item.kind} ${item.name}: ${item.reason}`) });
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally { client.release(); }
});
router.post("/import/resources", requireRole(["admin"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ resources: z.array(z.object({ kind: z.enum(resourceKinds), name: z.string().min(1), project: z.string().optional(), key: z.string().optional(), description: z.string().default(""), status: z.string().default("active"), order: z.number().default(0), config: z.record(z.string(), z.unknown()).default({}) })).max(1000) }), req.body, res); if (!body) return; const allowedResources = body.resources.filter((resource) => resource.kind !== "issue-type" || resource.name.trim().toLowerCase() !== "epic"); const result = await Resources.insertMany(allowedResources.map((resource: object) => ({ ...resource, organization: oid(req) })), { ordered: false }); await audit(req, "resources.imported", "workspace-resource", undefined, { count: result.length }); return res.status(201).json({ imported: result.length, skipped: body.resources.length - allowedResources.length }); });

export default router;
