import { createPgModel } from "../db/pgModel.js";
import { Organization } from "./Organization.js";

export type UserRole = string;
export type InviteStatus = "active" | "invited" | "disabled";
export type NotificationPreferences = { ticketAssignments: boolean; mentionsAndComments: boolean; sprintRiskAlerts: boolean; weeklySummary: boolean };
export interface IUser { id?: string; _id?: string; name: string; email: string; passwordHash: string; emailVerified: boolean; lastActiveOrganization?: string; avatarColor: string; notificationPreferences: NotificationPreferences }
const notificationPreferences = { ticketAssignments: true, mentionsAndComments: true, sprintRiskAlerts: true, weeklySummary: false };
export const User = createPgModel({ table: "users", columns: ["name", "email", "passwordHash", "emailVerified", "lastActiveOrganization", "avatarColor", "notificationPreferences"], json: ["notificationPreferences"], defaults: { emailVerified: true, avatarColor: "#00AEEF", notificationPreferences }, relations: { lastActiveOrganization: { model: () => Organization } } });
