import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { Organization } from "../models/Organization.js";
import { ActionToken, Session } from "../models/Operational.js";
import { User } from "../models/User.js";

const router = Router();
const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
const registerSchema = credentials.extend({ name: z.string().min(2), organizationName: z.string().min(2) });

function slugify(value: string) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "workspace";
}

async function uniqueSlug(name: string) {
  const base = slugify(name);
  let slug = base;
  let index = 2;
  while (await Organization.exists({ slug })) {
    slug = `${base}-${index}`;
    index += 1;
  }
  return slug;
}

function publicUser(user: Awaited<ReturnType<typeof User.findOne>>) {
  if (!user) return null;
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    organization: user.organization,
    role: user.role,
    inviteStatus: user.inviteStatus,
    skills: user.skills,
    availability: user.availability,
    capacity: user.capacity,
    avatarColor: user.avatarColor,
  };
}

function publicOrganization(org: Awaited<ReturnType<typeof Organization.findOne>>) {
  if (!org) return null;
  return { id: org.id, _id: org.id, name: org.name, slug: org.slug, plan: org.plan, settings: org.settings };
}

function signToken(user: { id: string; email: string; role: string; organization: unknown }) {
  return jwt.sign({ userId: user.id, organizationId: String(user.organization), email: user.email, role: user.role }, env.jwtSecret, { expiresIn: "8h" });
}

const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");
async function issueTokens(user: { id: string; email: string; role: string; organization: unknown }, userAgent?: string) {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await Session.create({ user: user.id, organization: String(user.organization), tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400_000), userAgent });
  return { token: signToken(user), refreshToken };
}

router.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email and password are required" });

  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(401).json({ message: "Invalid credentials" });
  }
  const organization = await Organization.findById(user.organization);
  const tokens = await issueTokens(user, req.get("user-agent"));
  return res.json({ ...tokens, user: publicUser(user), organization: publicOrganization(organization) });
});

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Organization, name, valid email, and password are required", issues: parsed.error.issues });
  const existing = await User.exists({ email: parsed.data.email.toLowerCase() });
  if (existing) return res.status(409).json({ message: "An account with this email already exists" });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const organization = await Organization.create({
    name: parsed.data.organizationName,
    slug: await uniqueSlug(parsed.data.organizationName),
    plan: "starter",
  });
  const user = await User.create({
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    passwordHash,
    organization: organization._id,
    role: "admin",
    inviteStatus: "active",
    skills: ["Planning"],
    availability: 1,
    capacity: 30,
    avatarColor: "#00AEEF",
  });
  organization.owner = user._id;
  await organization.save();
  const tokens = await issueTokens(user, req.get("user-agent"));
  return res.status(201).json({ ...tokens, user: publicUser(user), organization: publicOrganization(organization) });
});

router.post("/refresh", async (req, res) => {
  const parsed = z.object({ refreshToken: z.string().min(20) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Refresh token is required" });
  const session = await Session.findOne({ tokenHash: hashToken(parsed.data.refreshToken), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!session) return res.status(401).json({ message: "Invalid or expired refresh token" });
  const user = await User.findOne({ _id: session.user, inviteStatus: "active" });
  if (!user) return res.status(401).json({ message: "Account is unavailable" });
  session.revokedAt = new Date(); await session.save();
  return res.json(await issueTokens(user, req.get("user-agent")));
});

router.post("/logout", async (req, res) => {
  const token = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : "";
  if (token) await Session.updateOne({ tokenHash: hashToken(token) }, { revokedAt: new Date() });
  return res.status(204).send();
});

router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email is required" });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  let resetToken: string | undefined;
  if (user) {
    resetToken = crypto.randomBytes(32).toString("base64url");
    await ActionToken.create({ user: user._id, organization: user.organization, kind: "password-reset", tokenHash: hashToken(resetToken), expiresAt: new Date(Date.now() + 3600_000) });
  }
  return res.json({ message: "If the account exists, a reset token was created", ...(env.nodeEnv !== "production" && resetToken ? { resetToken } : {}) });
});

router.post("/reset-password", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20), password: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Token and a valid password are required" });
  const action = await ActionToken.findOne({ tokenHash: hashToken(parsed.data.token), kind: "password-reset", usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!action) return res.status(400).json({ message: "Invalid or expired reset token" });
  await User.updateOne({ _id: action.user }, { passwordHash: await bcrypt.hash(parsed.data.password, 10), inviteStatus: "active" });
  action.usedAt = new Date(); await action.save();
  await Session.updateMany({ user: action.user, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  return res.json({ ok: true });
});

router.post("/accept-invite", async (req, res) => {
  const parsed = z.object({ token: z.string().min(20), password: z.string().min(8), name: z.string().min(2).optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invite token and password are required" });
  const action = await ActionToken.findOne({ tokenHash: hashToken(parsed.data.token), kind: "invite", usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!action) return res.status(400).json({ message: "Invalid or expired invitation" });
  const user = await User.findByIdAndUpdate(action.user, { passwordHash: await bcrypt.hash(parsed.data.password, 10), inviteStatus: "active", ...(parsed.data.name && { name: parsed.data.name }) }, { new: true });
  if (!user) return res.status(404).json({ message: "Invited user not found" });
  action.usedAt = new Date(); await action.save();
  return res.json({ ...(await issueTokens(user, req.get("user-agent"))), user: publicUser(user) });
});

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const [user, organization] = await Promise.all([User.findById(req.user?.userId), Organization.findById(req.user?.organizationId)]);
  return res.json({ user: publicUser(user), organization: publicOrganization(organization) });
});

router.post("/change-password", requireAuth, async (req: AuthRequest, res) => {
  const parsed = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Current and new passwords are required" });
  const user = await User.findById(req.user!.userId);
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(401).json({ message: "Current password is incorrect" });
  user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10); await user.save();
  await Session.updateMany({ user: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() });
  return res.json({ ok: true });
});

router.get("/sessions", requireAuth, async (req: AuthRequest, res) => res.json({ sessions: await Session.find({ user: req.user!.userId, revokedAt: { $exists: false } }).select("-tokenHash") }));
router.delete("/sessions/:id", requireAuth, async (req: AuthRequest, res) => {
  const result = await Session.updateOne({ _id: req.params.id, user: req.user!.userId }, { revokedAt: new Date() });
  return result.matchedCount ? res.status(204).send() : res.status(404).json({ message: "Session not found" });
});

export default router;
