import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { Organization } from "../models/Organization.js";
import { Session } from "../models/Operational.js";
import type { IUser } from "../models/User.js";
import { Invitation, OrganizationMembership } from "../models/WorkspaceAccess.js";

export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function publicUser(user: any) {
  if (!user) return null;
  return { id: user.id, _id: user.id, name: user.name, email: user.email, avatarColor: user.avatarColor, notificationPreferences: user.notificationPreferences };
}

export function publicOrganization(org: any) {
  if (!org) return null;
  return { id: org.id, _id: org.id, name: org.name, slug: org.slug, plan: org.plan, settings: org.settings, owner: org.owner, onboardingCompletedAt: org.onboardingCompletedAt };
}

export async function membershipsFor(userId: string) {
  const memberships = await OrganizationMembership.find({ user: userId, status: "active" }).populate("organization");
  return memberships.map((m: any) => ({ id: m.id, organization: publicOrganization(m.organization), role: m.role, status: m.status, skills: m.skills, availability: m.availability, capacity: m.capacity }));
}

export async function pendingInvitationsFor(email: string) {
  const invitations = await Invitation.find({ email: email.toLowerCase(), status: "pending", expiresAt: { $gt: new Date() } }).populate("organization", "name slug plan").populate("invitedBy", "name email");
  return invitations.map((i: any) => ({ id: i.id, organization: publicOrganization(i.organization), invitedBy: publicUser(i.invitedBy), email: i.email, name: i.name, role: i.role, capacity: i.capacity, expiresAt: i.expiresAt }));
}

export async function issueTokens(user: any, membership?: any, userAgent?: string) {
  const organizationId = membership ? String(membership.organization?._id || membership.organization) : undefined;
  const claims = { userId: user.id, email: user.email, ...(organizationId ? { organizationId, membershipId: membership.id, role: membership.role } : {}) };
  const token = jwt.sign(claims, env.jwtSecret, { expiresIn: "8h" });
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  await Session.create({ user: user.id, ...(organizationId ? { organization: organizationId } : {}), tokenHash: hashToken(refreshToken), expiresAt: new Date(Date.now() + 30 * 86400_000), userAgent });
  return { token, refreshToken };
}

export async function sessionResponse(user: any, membership?: any, userAgent?: string) {
  const [tokens, memberships, pendingInvitations] = await Promise.all([issueTokens(user, membership, userAgent), membershipsFor(user.id), pendingInvitationsFor(user.email)]);
  const organization = membership ? await Organization.findById(membership.organization) : null;
  return { ...tokens, user: publicUser(user), organization: publicOrganization(organization), activeMembership: membership ? { id: membership.id, role: membership.role, status: membership.status } : null, memberships, pendingInvitations, next: membership ? (membership.role !== "admin" || organization?.onboardingCompletedAt ? "/dashboard" : "/onboarding/project") : "/onboarding/workspace" };
}
