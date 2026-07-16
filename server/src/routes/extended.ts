import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { env } from "../config/env.js";
import { userRoles } from "../constants/workflow.js";
import { hashSha256, randomBase64UrlToken } from "../lib/crypto.js";
import { parseOr400 } from "../lib/http.js";
import { currentUserId, organizationId } from "../lib/routeContext.js";
import { requireAuth, requireRole, type AuthRequest } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { recordAuditEvent } from "../services/audit.js";
import { Organization } from "../models/Organization.js";
import { Counter } from "../models/Counter.js";
import { Cycle } from "../models/Cycle.js";
import { ActionToken, AuditEvent, Integration, Notification, Session } from "../models/Operational.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { resourceKinds, WorkspaceResource } from "../models/WorkspaceResource.js";
import { applySlaState, statusTransition } from "../services/sla.js";

const router = Router();
router.use(requireAuth);
router.use(enforceApiAccess);
const INVITE_TOKEN_TTL_MS = 7 * 86400_000;
const oid = organizationId;
const uid = currentUserId;
const hash = hashSha256;
// Dynamic resource/config documents intentionally cross Mongoose's static inferred union boundary.
const Resources = WorkspaceResource as any;
const Integrations = Integration as any;
const audit = recordAuditEvent;

const userPatch = z.object({ name: z.string().min(2).optional(), role: z.enum(userRoles).optional(), skills: z.array(z.string()).optional(), availability: z.number().min(0).max(1).optional(), capacity: z.number().min(0).optional(), avatarColor: z.string().optional() });
router.get("/users", async (req: AuthRequest, res) => res.json({ users: await User.find({ organization: oid(req) }).select("-passwordHash") }));
router.get("/users/:id", async (req: AuthRequest, res) => {
  const user = await User.findOne({ _id: req.params.id, organization: oid(req) }).select("-passwordHash");
  return user ? res.json({ user }) : res.status(404).json({ message: "User not found" });
});
router.patch("/users/:id", async (req: AuthRequest, res) => {
  const body = parseOr400(userPatch, req.body, res); if (!body) return;
  const isAdmin = req.user!.role === "admin";
  const isSelf = req.params.id === uid(req);
  if (!isAdmin && !isSelf) return res.status(403).json({ message: "You do not have permission to update this user" });
  if (!isAdmin && body.role !== undefined) return res.status(403).json({ message: "Only admins can change user roles" });
  const user = await User.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, body, { new: true }).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" }); await audit(req, "user.updated", "user", user._id); return res.json({ user });
});
router.post("/users/:id/deactivate", requireRole(["admin"]), async (req: AuthRequest, res) => {
  if (req.params.id === uid(req)) return res.status(400).json({ message: "You cannot deactivate yourself" });
  const user = await User.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { inviteStatus: "disabled" }, { new: true }).select("-passwordHash");
  if (!user) return res.status(404).json({ message: "User not found" }); await Session.updateMany({ user: user._id }, { revokedAt: new Date() }); return res.json({ user });
});
router.post("/users/:id/reactivate", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const user = await User.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { inviteStatus: "active" }, { new: true }).select("-passwordHash"); return user ? res.json({ user }) : res.status(404).json({ message: "User not found" });
});
router.delete("/users/:id", requireRole(["admin"]), async (req: AuthRequest, res) => {
  if (req.params.id === uid(req)) return res.status(400).json({ message: "You cannot delete yourself" });
  const user = await User.findOneAndDelete({ _id: req.params.id, organization: oid(req) }); if (!user) return res.status(404).json({ message: "User not found" }); return res.status(204).send();
});
router.post("/invitations", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(userRoles).default("engineer"), capacity: z.number().min(0).optional() }), req.body, res); if (!body) return;
  if (await User.exists({ email: body.email.toLowerCase() })) return res.status(409).json({ message: "Email already exists" });
  const user = await User.create({ ...body, email: body.email.toLowerCase(), organization: oid(req), passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 10), inviteStatus: "invited" });
  const token = randomBase64UrlToken(); await ActionToken.create({ user: user._id, organization: oid(req), kind: "invite", tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) });
  return res.status(201).json({ user: { ...user.toObject(), passwordHash: undefined }, ...(env.nodeEnv !== "production" ? { inviteToken: token } : {}) });
});
router.post("/invitations/:userId/resend", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const user = await User.findOne({ _id: req.params.userId, organization: oid(req), inviteStatus: "invited" }); if (!user) return res.status(404).json({ message: "Invitation not found" });
  await ActionToken.deleteMany({ user: user._id, kind: "invite", usedAt: { $exists: false } }); const token = randomBase64UrlToken(); await ActionToken.create({ user: user._id, organization: oid(req), kind: "invite", tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_TOKEN_TTL_MS) }); return res.json({ ok: true, ...(env.nodeEnv !== "production" ? { inviteToken: token } : {}) });
});
router.delete("/invitations/:userId", requireRole(["admin"]), async (req: AuthRequest, res) => { const user = await User.findOneAndDelete({ _id: req.params.userId, organization: oid(req), inviteStatus: "invited" }); if (!user) return res.status(404).json({ message: "Invitation not found" }); await ActionToken.deleteMany({ user: user._id }); return res.status(204).send(); });

router.get("/projects/:id", async (req: AuthRequest, res) => { const project = await Project.findOne({ _id: req.params.id, organization: oid(req) }).populate("members", "name email role"); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });
router.put("/projects/:id/members", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ userIds: z.array(z.string()) }), req.body, res); if (!body) return; const count = await User.countDocuments({ _id: { $in: body.userIds }, organization: oid(req) }); if (count !== new Set(body.userIds).size) return res.status(400).json({ message: "Invalid member" }); const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { members: body.userIds }, { new: true }).populate("members", "name email role"); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });
router.post("/projects/:id/archive", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "done" }, { new: true }); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });
router.post("/projects/:id/restore", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const project = await Project.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "active" }, { new: true }); return project ? res.json({ project }) : res.status(404).json({ message: "Project not found" }); });

router.get("/backlog", async (req: AuthRequest, res) => res.json({ tickets: await Ticket.find({ organization: oid(req), status: "Backlog", ...(req.query.project ? { project: String(req.query.project) } : {}) }).sort("createdAt") }));
router.post("/sprints/:id/start", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const sprint = await Sprint.findOne({ _id: req.params.id, organization: oid(req) }); if (!sprint) return res.status(404).json({ message: "Sprint not found" }); await Sprint.updateMany({ organization: oid(req), project: sprint.project, status: "active" }, { status: "planned" }); sprint.status = "active"; await sprint.save(); return res.json({ sprint }); });
router.post("/sprints/:id/complete", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ moveIncompleteToSprint: z.string().optional() }), req.body ?? {}, res); if (!body) return; const sprint = await Sprint.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "completed" }, { new: true }); if (!sprint) return res.status(404).json({ message: "Sprint not found" }); if (body.moveIncompleteToSprint) await Ticket.updateMany({ organization: oid(req), sprint: sprint._id, status: { $ne: "Done" } }, { sprint: body.moveIncompleteToSprint }); return res.json({ sprint }); });
router.post("/sprints/:id/reopen", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const sprint = await Sprint.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { status: "active" }, { new: true }); return sprint ? res.json({ sprint }) : res.status(404).json({ message: "Sprint not found" }); });

router.post("/tickets/bulk", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ ids: z.array(z.string()).min(1), update: z.object({ status: z.enum(["Backlog", "To Do", "In Progress", "In Review", "Done"]).optional(), priority: z.enum(["low", "medium", "high", "critical"]).optional(), assignee: z.string().optional(), sprint: z.string().optional(), blocked: z.boolean().optional() }) }), req.body, res); if (!body) return; if (body.update.status) { const items = await Ticket.find({ _id: { $in: body.ids }, organization: oid(req) }); await Promise.all(items.map(async (ticket) => { const fromStatus = ticket.status; Object.assign(ticket, body.update); ticket.history.push({ event: `Moved to ${body.update.status}`, createdAt: new Date() }); ticket.statusTransitions.push(statusTransition(fromStatus, body.update.status!, new Date(), uid(req))); if (body.update.status === "Done" && !ticket.resolvedAt) ticket.resolvedAt = new Date(); applySlaState(ticket); await ticket.save(); })); return res.json({ matched: items.length, modified: items.length }); } const result = await Ticket.updateMany({ _id: { $in: body.ids }, organization: oid(req) }, body.update); return res.json({ matched: result.matchedCount, modified: result.modifiedCount }); });
router.post("/tickets/:id/assign", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ assignee: z.string().nullable() }), req.body, res); if (!body) return; if (body.assignee && !(await User.exists({ _id: body.assignee, organization: oid(req) }))) return res.status(404).json({ message: "Assignee not found" }); const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, body.assignee ? { assignee: body.assignee } : { $unset: { assignee: 1 } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.post("/tickets/:id/archive", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { archivedAt: new Date() }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.post("/tickets/:id/restore", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $unset: { archivedAt: 1 } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.patch("/tickets/:id/rank", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ rank: z.number(), sprint: z.string().nullable().optional(), status: z.enum(["Backlog", "To Do", "In Progress", "In Review", "Done"]).optional() }), req.body, res); if (!body) return; const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }); if (!ticket) return res.status(404).json({ message: "Ticket not found" }); const fromStatus = ticket.status; ticket.rank = body.rank; if (body.status) { ticket.status = body.status; ticket.history.push({ event: `Moved to ${body.status}`, createdAt: new Date() }); ticket.statusTransitions.push(statusTransition(fromStatus, body.status, new Date(), uid(req))); if (body.status === "Done" && !ticket.resolvedAt) ticket.resolvedAt = new Date(); } if (body.sprint === null) ticket.sprint = undefined as never; else if (body.sprint) ticket.sprint = new mongoose.Types.ObjectId(body.sprint); applySlaState(ticket); await ticket.save(); return res.json({ ticket }); });
router.post("/tickets/:id/watch", async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $addToSet: { watchers: uid(req) } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.delete("/tickets/:id/watch", async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $pull: { watchers: uid(req) } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.get("/tickets/:id/history", async (req: AuthRequest, res) => { const ticket = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }).select("history"); return ticket ? res.json({ history: ticket.history }) : res.status(404).json({ message: "Ticket not found" }); });
router.patch("/tickets/:id/comments/:commentId", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ body: z.string().min(1) }), req.body, res); if (!body) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req), "comments._id": req.params.commentId }, { $set: { "comments.$.body": body.body } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Comment not found" }); });
router.delete("/tickets/:id/comments/:commentId", async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $pull: { comments: { _id: req.params.commentId } } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.patch("/tickets/:id/work-logs/:logId", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ hours: z.number().min(.25).max(24).optional(), note: z.string().min(1).optional() }), req.body, res); if (!body) return; const set = Object.fromEntries(Object.entries(body).map(([key, value]) => [`workLogs.$.${key}`, value])); const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req), "workLogs._id": req.params.logId }, { $set: set }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Work log not found" }); });
router.delete("/tickets/:id/work-logs/:logId", async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $pull: { workLogs: { _id: req.params.logId } } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.post("/tickets/:id/attachments", async (req: AuthRequest, res) => { const body = parseOr400(z.object({ name: z.string().min(1), url: z.string().url(), mimeType: z.string().optional(), size: z.number().int().min(0).optional() }), req.body, res); if (!body) return; const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $push: { attachments: { ...body, uploadedBy: uid(req), createdAt: new Date() } } }, { new: true }); return ticket ? res.status(201).json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.delete("/tickets/:id/attachments/:attachmentId", async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndUpdate({ _id: req.params.id, organization: oid(req) }, { $pull: { attachments: { _id: req.params.attachmentId } } }, { new: true }); return ticket ? res.json({ ticket }) : res.status(404).json({ message: "Ticket not found" }); });
router.delete("/tickets/:id", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const ticket = await Ticket.findOneAndDelete({ _id: req.params.id, organization: oid(req) }); return ticket ? res.status(204).send() : res.status(404).json({ message: "Ticket not found" }); });
router.post("/tickets/:id/clone", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const source = await Ticket.findOne({ _id: req.params.id, organization: oid(req) }).lean(); if (!source) return res.status(404).json({ message: "Ticket not found" }); const project = await Project.findById(source.project); const counter = await Counter.findOneAndUpdate({ organization: oid(req), scope: `ticket:${source.project}` }, { $inc: { value: 1 } }, { upsert: true, new: true, setDefaultsOnInsert: true }); const { _id, createdAt, updatedAt, ...copy } = source as typeof source & { createdAt?: Date; updatedAt?: Date }; const ticket = await Ticket.create({ ...copy, title: `${source.title} (copy)`, ticketId: `${project?.key}-${counter.value}`, history: [{ event: "Cloned", createdAt: new Date() }] }); return res.status(201).json({ ticket }); });

router.route("/resources/:kind").get(async (req: AuthRequest, res) => { const kind = String(req.params.kind); if (!resourceKinds.includes(kind as never)) return res.status(404).json({ message: "Resource kind not found" }); return res.json({ resources: await Resources.find({ organization: oid(req), kind, ...(req.query.project ? { project: String(req.query.project) } : {}) }).sort("order name") }); }).post(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const kind = String(req.params.kind); if (!resourceKinds.includes(kind as never)) return res.status(404).json({ message: "Resource kind not found" }); const body = parseOr400(z.object({ name: z.string().min(1), project: z.string().optional(), key: z.string().optional(), description: z.string().default(""), status: z.string().default("active"), order: z.number().default(0), config: z.record(z.string(), z.unknown()).default({}) }), req.body, res); if (!body) return; if (body.project && !(await Project.exists({ _id: body.project, organization: oid(req) }))) return res.status(404).json({ message: "Project not found" }); const resource = await Resources.create({ ...body, kind, organization: oid(req) }); return res.status(201).json({ resource }); });
router.route("/resources/:kind/:id").get(async (req: AuthRequest, res) => { const resource = await Resources.findOne({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }); return resource ? res.json({ resource }) : res.status(404).json({ message: "Resource not found" }); }).patch(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const resource = await Resources.findOneAndUpdate({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }, req.body, { new: true, runValidators: true }); return resource ? res.json({ resource }) : res.status(404).json({ message: "Resource not found" }); }).delete(requireRole(["admin", "manager"]), async (req: AuthRequest, res) => { const resource = await Resources.findOneAndDelete({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }); return resource ? res.status(204).send() : res.status(404).json({ message: "Resource not found" }); });

router.get("/notifications", async (req: AuthRequest, res) => res.json({ notifications: await Notification.find({ organization: oid(req), user: uid(req) }).sort("-createdAt").limit(100), unread: await Notification.countDocuments({ organization: oid(req), user: uid(req), readAt: { $exists: false } }) }));
router.patch("/notifications/:id/read", async (req: AuthRequest, res) => { const notification = await Notification.findOneAndUpdate({ _id: req.params.id, organization: oid(req), user: uid(req) }, { readAt: new Date() }, { new: true }); return notification ? res.json({ notification }) : res.status(404).json({ message: "Notification not found" }); });
router.post("/notifications/read-all", async (req: AuthRequest, res) => { await Notification.updateMany({ organization: oid(req), user: uid(req), readAt: { $exists: false } }, { readAt: new Date() }); return res.json({ ok: true }); });
router.get("/audit-logs", requireRole(["admin"]), async (req: AuthRequest, res) => res.json({ events: await AuditEvent.find({ organization: oid(req) }).sort("-createdAt").limit(200).populate("actor", "name email") }));

router.route("/integrations/:kind").get(requireRole(["admin"]), async (req: AuthRequest, res) => res.json({ integrations: await Integrations.find({ organization: oid(req), kind: String(req.params.kind) }).select("-secretHash") })).post(requireRole(["admin"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ name: z.string().min(1), url: z.string().url().optional(), events: z.array(z.string()).default([]) }), req.body, res); if (!body) return; const kind = String(req.params.kind); if (!["api-token", "webhook"].includes(kind)) return res.status(404).json({ message: "Integration kind not found" }); const secret = randomBase64UrlToken(); const integration = await Integrations.create({ ...body, organization: oid(req), kind, ...(kind === "api-token" ? { secretHash: hash(secret) } : {}) }); return res.status(201).json({ integration: { ...integration.toObject(), secretHash: undefined }, ...(kind === "api-token" ? { token: secret } : {}) }); });
router.delete("/integrations/:kind/:id", requireRole(["admin"]), async (req: AuthRequest, res) => { const item = await Integrations.findOneAndDelete({ _id: String(req.params.id), organization: oid(req), kind: String(req.params.kind) }); return item ? res.status(204).send() : res.status(404).json({ message: "Integration not found" }); });

router.patch("/organization", requireRole(["admin"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ name: z.string().min(2).optional(), plan: z.enum(["starter", "scale", "enterprise"]).optional() }), req.body, res); if (!body) return; const organization = await Organization.findByIdAndUpdate(oid(req), body, { new: true }); return res.json({ organization }); });
router.delete("/organization", requireRole(["admin"]), async (req: AuthRequest, res) => {
  const body = parseOr400(z.object({ confirmationName: z.string().min(1) }), req.body, res); if (!body) return;
  const organization = await Organization.findById(oid(req));
  if (!organization) return res.status(404).json({ message: "Organization not found" });
  if (body.confirmationName !== organization.name) return res.status(409).json({ message: "Organization name does not match" });
  const session = await mongoose.startSession();
  const filter = { organization: organization._id };
  try {
    await session.withTransaction(async () => {
      const options = { session };
      await Session.deleteMany(filter, options); await ActionToken.deleteMany(filter, options); await Notification.deleteMany(filter, options);
      await AuditEvent.deleteMany(filter, options); await Integration.deleteMany(filter, options); await Counter.deleteMany(filter, options);
      await WorkspaceResource.deleteMany(filter, options); await Ticket.deleteMany(filter, options); await Cycle.deleteMany(filter, options); await Sprint.deleteMany(filter, options);
      await Project.deleteMany(filter, options); await User.deleteMany(filter, options);
      const result = await Organization.deleteOne({ _id: organization._id }, options);
      if (result.deletedCount !== 1) throw new Error("Organization deletion failed");
    });
    return res.status(204).send();
  } finally { await session.endSession(); }
});
router.get("/organization/usage", requireRole(["admin"]), async (req: AuthRequest, res) => { const [users, projects, tickets, storage] = await Promise.all([User.countDocuments({ organization: oid(req) }), Project.countDocuments({ organization: oid(req) }), Ticket.countDocuments({ organization: oid(req) }), Resources.countDocuments({ organization: oid(req) })]); return res.json({ usage: { users, projects, tickets, resources: storage } }); });
router.get("/export", requireRole(["admin"]), async (req: AuthRequest, res) => { const [organization, users, projects, sprints, cycles, tickets, resources] = await Promise.all([Organization.findById(oid(req)), User.find({ organization: oid(req) }).select("-passwordHash"), Project.find({ organization: oid(req) }), Sprint.find({ organization: oid(req) }), Cycle.find({ organization: oid(req) }), Ticket.find({ organization: oid(req) }), Resources.find({ organization: oid(req) })]); return res.json({ exportedAt: new Date(), organization, users, projects, sprints, cycles, tickets, resources }); });
router.post("/import/resources", requireRole(["admin"]), async (req: AuthRequest, res) => { const body = parseOr400(z.object({ resources: z.array(z.object({ kind: z.enum(resourceKinds), name: z.string().min(1), project: z.string().optional(), key: z.string().optional(), description: z.string().default(""), status: z.string().default("active"), order: z.number().default(0), config: z.record(z.string(), z.unknown()).default({}) })).max(1000) }), req.body, res); if (!body) return; const result = await Resources.insertMany(body.resources.map((resource: object) => ({ ...resource, organization: oid(req) })), { ordered: false }); await audit(req, "resources.imported", "workspace-resource", undefined, { count: result.length }); return res.status(201).json({ imported: result.length }); });

export default router;
