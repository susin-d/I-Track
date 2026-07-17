import { createPgModel } from "../db/pgModel.js";
import { Organization } from "./Organization.js";
import { User, type UserRole } from "./User.js";

export type MembershipStatus = "active" | "disabled";
export interface IOrganizationMembership { user: string; organization: string; role: UserRole; status: MembershipStatus; skills: string[]; availability: number; capacity: number }
export interface IInvitation { organization: string; email: string; name: string; role: UserRole; capacity: number; invitedBy: string; tokenHash: string; status: "pending" | "accepted" | "cancelled"; expiresAt: Date; acceptedBy?: string; acceptedAt?: Date }
export const OrganizationMembership = createPgModel({ table: "organization_memberships", columns: ["user", "organization", "role", "status", "skills", "availability", "capacity"], columnMap: { user: "user_id" }, json: ["skills"], defaults: { status: "active", skills: [], availability: 1, capacity: 32 }, relations: { user: { model: () => User }, organization: { model: () => Organization } } });
export const Invitation = createPgModel({ table: "invitations", columns: ["organization", "email", "name", "role", "capacity", "invitedBy", "tokenHash", "otpHash", "otpExpiresAt", "otpUsedAt", "status", "expiresAt", "acceptedBy", "acceptedAt"], defaults: { capacity: 32, status: "pending" }, relations: { organization: { model: () => Organization }, invitedBy: { model: () => User }, acceptedBy: { model: () => User } } });
