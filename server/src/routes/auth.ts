import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { Router } from "express";
import { z } from "zod";
import { env } from "../config/env.js";
import { effectiveWorkspaceMembership, requireAuth, type AuthRequest } from "../middleware/auth.js";
import { clearSessionCookies, REFRESH_COOKIE, readCookie, setSessionCookies } from "../lib/authCookies.js";
import { ActionToken, Session } from "../models/Operational.js";
import { User } from "../models/User.js";
import { OrganizationMembership } from "../models/WorkspaceAccess.js";
import { sendLoginEmail, sendOtpEmail, sendPasswordResetEmail, sendRegistrationEmail } from "../services/mail.js";
import { hashToken, issueTokens, membershipsFor, pendingInvitationsFor, publicCompany, publicOrganization, publicUser, sessionResponse } from "../services/sessionAuth.js";

const router = Router();
const credentials = z.object({ email: z.string().email(), password: z.string().min(8) });
const registerSchema = credentials.extend({ name: z.string().min(2) });
const otpSchema = z.object({ email: z.string().email(), otp: z.string().regex(/^\d{6}$/), purpose: z.enum(["registration", "login"]) });
const notificationPreferencesSchema = z.object({ ticketAssignments: z.boolean(), mentionsAndComments: z.boolean(), sprintRiskAlerts: z.boolean(), weeklySummary: z.boolean() });
const googleProfileSchema = z.object({
  sub: z.string(),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().min(1),
});

const OTP_TTL_MS = 10 * 60_000;
function createOtp() { return crypto.randomInt(100000, 1000000).toString(); }
function developmentOtp(otp: string) { return env.nodeEnv === "production" ? {} : { verificationCode: otp }; }

async function issueUserOtp(user: any, purpose: "registration" | "login", organizationId?: string) {
  const otp = createOtp();
  await ActionToken.deleteMany({ user: user._id, kind: `${purpose}-otp`, usedAt: { $exists: false } });
  await ActionToken.create({ user: user._id, ...(organizationId ? { organization: organizationId } : {}), kind: `${purpose}-otp`, tokenHash: hashToken(otp), expiresAt: new Date(Date.now() + OTP_TTL_MS) });
  await sendOtpEmail({ name: user.name, email: user.email }, { purpose, otp });
  return otp;
}

async function preferredMembership(user: any, organizationId?: unknown) {
  if (organizationId) {
    const selected = await effectiveWorkspaceMembership(user._id, String(organizationId));
    if (selected) return selected;
  }
  if (user.lastActiveOrganization) {
    const recent = await effectiveWorkspaceMembership(user._id, String(user.lastActiveOrganization));
    if (recent) return recent;
  }
  const first = await OrganizationMembership.findOne({ user: user._id, status: "active" }).sort("createdAt");
  if (first) return first;
  const inherited = (await membershipsFor(user._id))[0];
  if (inherited) return { id: inherited.id, organization: inherited.organization.id, role: inherited.role, status: inherited.status };
  if (!user.organization) return null;
  return OrganizationMembership.findOneAndUpdate(
    { user: user._id, organization: user.organization },
    { $setOnInsert: { role: user.role || "engineer", status: user.inviteStatus === "disabled" ? "disabled" : "active", skills: user.skills || [], availability: user.availability ?? 1, capacity: user.capacity ?? 32 } },
    { upsert: true, new: true },
  );
}

router.post("/register", async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Name, valid email, and password are required", issues: parsed.error.issues });
  const email = parsed.data.email.toLowerCase();
  if (await User.exists({ email })) return res.status(409).json({ message: "An account with this email already exists" });
  const user = await User.create({ name: parsed.data.name, email, passwordHash: await bcrypt.hash(parsed.data.password, 10), emailVerified: false, avatarColor: "#00AEEF" });
  void sendRegistrationEmail({ name: user.name, email: user.email });
  const otp = await issueUserOtp(user, "registration");
  return res.status(202).json({ requiresOtp: true, purpose: "registration", email: user.email, ...developmentOtp(otp) });
});

router.post("/login", async (req, res) => {
  const parsed = credentials.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email and password are required" });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) return res.status(401).json({ message: "Invalid credentials" });
  if (!user.emailVerified) return res.status(403).json({ message: "Verify your email before signing in", code: "EMAIL_VERIFICATION_REQUIRED" });
  const membership = await preferredMembership(user, req.body?.organizationId);
  const organizationId = membership?.organization ? String(membership.organization?._id || membership.organization) : undefined;
  const otp = await issueUserOtp(user, "login", organizationId);
  return res.status(202).json({ requiresOtp: true, purpose: "login", email: user.email, organizationId, ...developmentOtp(otp) });
});

router.post("/verify-otp", async (req, res) => {
  const parsed = otpSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Email, purpose, and a 6-digit verification code are required" });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user) return res.status(400).json({ message: "Invalid or expired verification code" });
  const action = await ActionToken.findOne({ user: user._id, kind: `${parsed.data.purpose}-otp`, tokenHash: hashToken(parsed.data.otp), usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!action) return res.status(400).json({ message: "Invalid or expired verification code" });
  action.usedAt = new Date(); await action.save();
  if (parsed.data.purpose === "registration") { user.emailVerified = true; await user.save(); }
  if (parsed.data.purpose === "login") void sendLoginEmail({ name: user.name, email: user.email }, { ipAddress: req.ip, userAgent: req.get("user-agent") });
  const membership = await preferredMembership(user, parsed.data.purpose === "login" ? action.organization : undefined);
  return res.json(await sessionResponse(user, membership, req.get("user-agent"), res));
});

router.post("/resend-otp", async (req, res) => {
  const parsed = z.object({ email: z.string().email(), purpose: z.enum(["registration", "login"]) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Email and OTP purpose are required" });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  if (!user || (parsed.data.purpose === "registration" && user.emailVerified) || (parsed.data.purpose === "login" && !user.emailVerified)) {
    return res.status(202).json({ message: "If the account is eligible, a new verification code has been sent" });
  }
  const otp = await issueUserOtp(user, parsed.data.purpose);
  return res.status(202).json({ requiresOtp: true, purpose: parsed.data.purpose, email: user.email, ...developmentOtp(otp) });
});

router.get("/google", (_req, res) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    return res.status(503).json({ message: "Google sign-in is not configured" });
  }
  const state = jwt.sign({ purpose: "google-oauth" }, env.jwtSecret, { expiresIn: "10m" });
  const query = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  return res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
});

router.get("/google/callback", async (req, res) => {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const errorUrl = (message: string) => `${env.appUrl.replace(/\/+$/, "")}/login?error=${encodeURIComponent(message)}`;
  if (!env.googleClientId || !env.googleClientSecret || !code || !state) {
    return res.redirect(errorUrl("Google sign-in could not be completed"));
  }
  try {
    const claims = jwt.verify(state, env.jwtSecret) as { purpose?: string };
    if (claims.purpose !== "google-oauth") throw new Error("Invalid OAuth state");
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.googleClientId,
        client_secret: env.googleClientSecret,
        redirect_uri: env.googleRedirectUri,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenResponse.ok) throw new Error("Google token exchange failed");
    const googleTokens = await tokenResponse.json() as { access_token?: string };
    if (!googleTokens.access_token) throw new Error("Google access token is missing");
    const profileResponse = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${googleTokens.access_token}` },
    });
    const profile = googleProfileSchema.parse(await profileResponse.json());
    if (!profileResponse.ok || !profile.email_verified) throw new Error("Google email is not verified");

    const email = profile.email.toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      user = await User.create({
        name: profile.name,
        email,
        passwordHash: await bcrypt.hash(crypto.randomBytes(32).toString("base64url"), 10),
        emailVerified: true,
        avatarColor: "#4285F4",
      });
      void sendRegistrationEmail({ name: user.name, email: user.email });
    }
    const membership = await preferredMembership(user);
    const session = await sessionResponse(user, membership, req.get("user-agent"), res);
    const fragment = new URLSearchParams({
      token: session.token,
      refreshToken: session.refreshToken,
      next: session.next,
    });
    return res.redirect(`${env.appUrl.replace(/\/+$/, "")}/auth/google/callback#${fragment}`);
  } catch (error) {
    console.error("Google OAuth callback failed", error);
    return res.redirect(errorUrl("Google sign-in failed. Please try again."));
  }
});

router.post("/refresh", async (req, res) => {
  const refreshToken = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : readCookie(req.headers.cookie, REFRESH_COOKIE);
  const parsed = z.object({ refreshToken: z.string().min(20) }).safeParse({ refreshToken });
  if (!parsed.success) return res.status(400).json({ message: "Refresh token is required" });
  const session = await Session.findOneAndUpdate({ tokenHash: hashToken(parsed.data.refreshToken), revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } }, { revokedAt: new Date() }, { new: true });
  if (!session) return res.status(401).json({ message: "Invalid or expired refresh token" });
  const user = await User.findById(session.user);
  if (!user) return res.status(401).json({ message: "Account is unavailable" });
  const membership = session.organization ? await preferredMembership(user, session.organization) : undefined;
  if (session.organization && !membership) return res.status(401).json({ message: "Workspace membership is unavailable" });
  const tokens = await issueTokens(user, membership, req.get("user-agent"));
  setSessionCookies(res, tokens.token, tokens.refreshToken);
  return res.json(tokens);
});

router.post("/logout", async (req, res) => { const token = typeof req.body?.refreshToken === "string" ? req.body.refreshToken : readCookie(req.headers.cookie, REFRESH_COOKIE) || ""; if (token) await Session.updateOne({ tokenHash: hashToken(token), revokedAt: { $exists: false } }, { revokedAt: new Date() }); clearSessionCookies(res); return res.status(204).send(); });

router.get("/me", requireAuth, async (req: AuthRequest, res) => {
  const user = await User.findById(req.user!.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  const membership = req.user!.organizationId ? await preferredMembership(user, req.user!.organizationId) : undefined;
  const organization = membership ? await (await import("../models/Organization.js")).Organization.findById(membership.organization) : null;
  const company = organization ? await (await import("../models/Company.js")).Company.findById(organization.company) : null;
  return res.json({ user: { ...publicUser(user), role: membership?.role }, company: publicCompany(company), organization: publicOrganization(organization), workspace: publicOrganization(organization), activeMembership: membership ? { id: membership.id, role: membership.role, status: "status" in membership ? membership.status : "active" } : null, memberships: await membershipsFor(user.id, company?.id), pendingInvitations: await pendingInvitationsFor(user.email, company?.id), next: membership ? (membership.role !== "admin" || organization?.onboardingCompletedAt ? "/dashboard" : "/onboarding/project") : "/onboarding/workspace" });
});

router.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Valid email is required" });
  const user = await User.findOne({ email: parsed.data.email.toLowerCase() });
  let resetToken: string | undefined;
  if (user) {
    resetToken = crypto.randomBytes(32).toString("base64url");
    await ActionToken.deleteMany({ user: user._id, kind: "password-reset", usedAt: { $exists: false } });
    await ActionToken.create({ user: user._id, kind: "password-reset", tokenHash: hashToken(resetToken), expiresAt: new Date(Date.now() + 3600_000) });
    const resetUrl = `${env.appUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(resetToken)}`;
    void sendPasswordResetEmail({ name: user.name, email: user.email }, resetUrl);
  }
  return res.json({ message: "If the account exists, reset instructions have been sent", ...(env.nodeEnv !== "production" && resetToken ? { resetToken } : {}) });
});
router.post("/reset-password", async (req, res) => { const parsed = z.object({ token: z.string().min(20), password: z.string().min(8) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Token and a valid password are required" }); const action = await ActionToken.findOne({ tokenHash: hashToken(parsed.data.token), kind: "password-reset", usedAt: { $exists: false }, expiresAt: { $gt: new Date() } }); if (!action) return res.status(400).json({ message: "Invalid or expired reset token" }); await User.updateOne({ _id: action.user }, { passwordHash: await bcrypt.hash(parsed.data.password, 10) }); action.usedAt = new Date(); await action.save(); await Session.updateMany({ user: action.user, revokedAt: { $exists: false } }, { revokedAt: new Date() }); return res.json({ ok: true }); });
router.post("/change-password", requireAuth, async (req: AuthRequest, res) => { const parsed = z.object({ currentPassword: z.string(), newPassword: z.string().min(8) }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Current and new passwords are required" }); const user = await User.findById(req.user!.userId); if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) return res.status(401).json({ message: "Current password is incorrect" }); user.passwordHash = await bcrypt.hash(parsed.data.newPassword, 10); await user.save(); await Session.updateMany({ user: user._id, revokedAt: { $exists: false } }, { revokedAt: new Date() }); return res.json({ ok: true }); });
router.patch("/preferences", requireAuth, async (req: AuthRequest, res) => { const parsed = z.object({ notificationPreferences: notificationPreferencesSchema }).safeParse(req.body); if (!parsed.success) return res.status(400).json({ message: "Notification preferences are invalid" }); const user = await User.findByIdAndUpdate(req.user!.userId, { notificationPreferences: parsed.data.notificationPreferences }, { new: true }); return user ? res.json({ user: publicUser(user) }) : res.status(404).json({ message: "User not found" }); });
router.get("/sessions", requireAuth, async (req: AuthRequest, res) => res.json({ sessions: await Session.find({ user: req.user!.userId, revokedAt: { $exists: false } }).select("-tokenHash") }));
router.delete("/sessions/:id", requireAuth, async (req: AuthRequest, res) => { const result = await Session.updateOne({ _id: req.params.id, user: req.user!.userId }, { revokedAt: new Date() }); return result.matchedCount ? res.status(204).send() : res.status(404).json({ message: "Session not found" }); });

export default router;
