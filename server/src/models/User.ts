import { createPgModel } from "../db/pgModel.js";
import { Organization } from "./Organization.js";

export type UserRole = "admin" | "manager" | "engineer" | "designer";
export type InviteStatus = "active" | "invited" | "disabled";
export type NotificationPreferences = { ticketAssignments: boolean; mentionsAndComments: boolean; sprintRiskAlerts: boolean; weeklySummary: boolean };
export interface IUser { id?: string; _id?: string; name: string; email: string; passwordHash: string; lastActiveOrganization?: string; avatarColor: string; notificationPreferences: NotificationPreferences }
const notificationPreferences = { ticketAssignments: true, mentionsAndComments: true, sprintRiskAlerts: true, weeklySummary: false };
export const User = createPgModel({ table: "users", columns: ["name", "email", "passwordHash", "lastActiveOrganization", "avatarColor", "notificationPreferences"], json: ["notificationPreferences"], defaults: { avatarColor: "#00AEEF", notificationPreferences }, relations: { lastActiveOrganization: { model: () => Organization } } });
