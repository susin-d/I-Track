import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { ACCESS_COOKIE, readCookie } from "../lib/authCookies.js";
import { invalidateWorkspaceMembership, requireAuth, requireWorkspace, type AuthRequest } from "../middleware/auth.js";
import { Organization } from "../models/Organization.js";
import { Project } from "../models/Project.js";
import { Session } from "../models/Operational.js";
import { User } from "../models/User.js";
import { Invitation, OrganizationMembership } from "../models/WorkspaceAccess.js";
import { hashToken, membershipsFor, pendingInvitationsFor, publicOrganization, publicUser, sessionResponse } from "../services/sessionAuth.js";

const router = Router();
const INVITE_TTL_MS = 7 * 86400_000;
const roles = ["admin", "manager", "engineer", "designer"] as const;
const invitationBody = z.object({ name: z.string().min(2), email: z.string().email(), role: z.enum(roles).default("engineer"), capacity: z.number().min(0).default(32) });

function slugify(value: string) { return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace"; }
async function uniqueSlug(name: string) { const base = slugify(name); let slug = base; let index = 2; while (await Organization.exists({ slug })) slug = `${base}-${index++}`; return slug; }
function rawToken() { return crypto.randomBytes(32).toString("base64url"); }
function inviteUrl(req: any, token: string) { const origin = req.get("origin") || `${req.protocol}://${req.get("host")}`; return `${origin}/accept-invite?token=${encodeURIComponent(token)}`; }

function optionalAuth(req: AuthRequest) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : readCookie(req.headers.cookie, ACCESS_COOKIE);
  if (!token) return;
  try { req.user = jwt.verify(token, env.jwtSecret) as AuthRequest["user"]; } catch { /* public new-user invite flow */ }
}

router.get("/workspaces", requireAuth, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  return res.json({ memberships: await membershipsFor(user.id), pendingInvitations: await pendingInvitationsFor(user.email), activeOrganizationId: req.user!.organizationId || null });
});

router.post("/workspaces", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ name: z.string().min(2) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Workspace name is required" });
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  const organization = await Organization.create({ name: parsed.data.name, slug: await uniqueSlug(parsed.data.name), plan: "starter", owner: user._id });
  const membership = await OrganizationMembership.create({ user: user._id, organization: organization._id, role: "admin", status: "active", skills: ["Planning"], availability: 1, capacity: 32 });
  invalidateWorkspaceMembership(String(user._id), String(organization._id));
  user.lastActiveOrganization = organization._id; await user.save();
  return res.status(201).json(await sessionResponse(user, membership, req.get("user-agent"), res));
});

router.post("/workspaces/:id/switch", requireAuth, async (req: AuthRequest, res) => {
  const [user, membership] = await Promise.all([User.findById(req.user!.userId), OrganizationMembership.findOne({ user: req.user!.userId, organization: req.params.id, status: "active" })]);
  if (!user || !membership) return res.status(404).json({ message: "Workspace membership not found" });
  if (typeof req.body?.refreshToken === "string") await Session.updateOne({ tokenHash: hashToken(req.body.refreshToken), user: user._id }, { revokedAt: new Date() });
  user.lastActiveOrganization = membership.organization; await user.save();
  return res.json(await sessionResponse(user, membership, req.get("user-agent"), res));
});

router.post("/workspaces/:id/onboarding/complete", requireAuth, requireWorkspace, async (req: AuthRequest, res) => {
  if (req.user!.organizationId !== req.params.id || req.user!.role !== "admin") return res.status(403).json({ message: "Only the workspace admin can complete onboarding" });
  if (!(await Project.exists({ organization: req.params.id }))) return res.status(409).json({ message: "Create the first project before completing onboarding" });
  const organization = await Organization.findByIdAndUpdate(req.params.id, { onboardingCompletedAt: new Date() }, { new: true });
  return res.json({ organization: publicOrganization(organization), next: "/dashboard" });
});

router.get("/invitations/preview", async (req, res) => {
  const token = String(req.query.token || "");
  const invitation = await Invitation.findOne({ tokenHash: hashToken(token), status: "pending", expiresAt: { $gt: new Date() } }).populate("organization", "name slug plan").populate("invitedBy", "name email");
  if (!invitation) return res.status(404).json({ message: "Invitation is invalid or expired" });
  const existing = await User.exists({ email: invitation.email });
  return res.json({ invitation: { id: invitation.id, organization: publicOrganization(invitation.organization), invitedBy: publicUser(invitation.invitedBy), email: invitation.email, name: invitation.name, role: invitation.role, capacity: invitation.capacity, expiresAt: invitation.expiresAt }, accountExists: Boolean(existing) });
});

router.get("/invitations/pending", requireAuth, async (req: AuthRequest, res) => { const user = await User.findById(req.user!.userId); return user ? res.json({ invitations: await pendingInvitationsFor(user.email) }) : res.status(404).json({ message: "User not found" }); });

router.post("/invitations", requireAuth, requireWorkspace, async (req: AuthRequest, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ message: "Only admins can invite teammates" });
  const parsed = invitationBody.safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Name, valid email, role, and capacity are required" });
  const email = parsed.data.email.toLowerCase();
  const existingUser = await User.findOne({ email });
  if (existingUser && await OrganizationMembership.exists({ user: existingUser._id, organization: req.user!.organizationId })) return res.status(409).json({ message: "This user already belongs to the workspace" });
  if (await Invitation.exists({ email, organization: req.user!.organizationId, status: "pending", expiresAt: { $gt: new Date() } })) return res.status(409).json({ message: "A pending invitation already exists for this email" });
  const token = rawToken();
  const invitation = await Invitation.create({ ...parsed.data, email, organization: req.user!.organizationId, invitedBy: req.user!.userId, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  return res.status(201).json({ invitation: { id: invitation.id, ...parsed.data, email, status: invitation.status, expiresAt: invitation.expiresAt }, inviteUrl: inviteUrl(req, token) });
});

router.post("/invitations/:id/resend", requireAuth, requireWorkspace, async (req: AuthRequest, res) => {
  if (req.user!.role !== "admin") return res.status(403).json({ message: "Only admins can resend invitations" });
  const token = rawToken(); const invitation = await Invitation.findOneAndUpdate({ _id: req.params.id, organization: req.user!.organizationId, status: "pending" }, { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) }, { new: true });
  return invitation ? res.json({ ok: true, inviteUrl: inviteUrl(req, token) }) : res.status(404).json({ message: "Invitation not found" });
});

router.delete("/invitations/:id", requireAuth, requireWorkspace, async (req: AuthRequest, res) => { if (req.user!.role !== "admin") return res.status(403).json({ message: "Only admins can cancel invitations" }); const invitation = await Invitation.findOneAndUpdate({ _id: req.params.id, organization: req.user!.organizationId, status: "pending" }, { status: "cancelled" }); return invitation ? res.status(204).send() : res.status(404).json({ message: "Invitation not found" }); });

router.post("/auth/accept-invite", async (req: AuthRequest, res) => {
  optionalAuth(req);
  const parsed = z.object({ token: z.string().min(20).optional(), invitationId: z.string().optional(), name: z.string().min(2).optional(), password: z.string().min(8).optional() }).refine((body) => body.token || body.invitationId).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "A valid invitation is required" });
  const invitation = await Invitation.findOne({ ...(parsed.data.token ? { tokenHash: hashToken(parsed.data.token) } : { _id: parsed.data.invitationId }), status: "pending", expiresAt: { $gt: new Date() } });
  if (!invitation) return res.status(400).json({ message: "Invitation is invalid or expired" });
  let user = await User.findOne({ email: invitation.email });
  if (user) {
    if (!req.user) return res.status(401).json({ message: "Sign in to accept this invitation", code: "SIGN_IN_REQUIRED" });
    if (req.user.userId !== user.id || req.user.email.toLowerCase() !== invitation.email) return res.status(403).json({ message: "This invitation belongs to another email address" });
  } else {
    if (!parsed.data.token) return res.status(401).json({ message: "Open the invitation link to create your account" });
    if (!parsed.data.name || !parsed.data.password) return res.status(400).json({ message: "Name and password are required to create your account" });
    user = await User.create({ name: parsed.data.name, email: invitation.email, passwordHash: await bcrypt.hash(parsed.data.password, 10), avatarColor: "#00AEEF" });
  }
  let membership = await OrganizationMembership.findOne({ user: user._id, organization: invitation.organization });
  if (!membership) membership = await OrganizationMembership.create({ user: user._id, organization: invitation.organization, role: invitation.role, status: "active", capacity: invitation.capacity, availability: 1, skills: [] });
  else if (membership.status !== "active") { membership.status = "active"; membership.role = invitation.role; await membership.save(); }
  invalidateWorkspaceMembership(String(user._id), String(invitation.organization));
  invitation.status = "accepted"; invitation.acceptedBy = user._id; invitation.acceptedAt = new Date(); await invitation.save();
  user.lastActiveOrganization = invitation.organization; await user.save();
  return res.json(await sessionResponse(user, membership, req.get("user-agent"), res));
});

export default router;
