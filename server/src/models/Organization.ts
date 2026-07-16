import { createPgModel } from "../db/pgModel.js";
import { User } from "./User.js";

export interface IOrganization { name: string; slug: string; plan: "starter" | "scale" | "enterprise"; owner: string; onboardingCompletedAt?: Date; settings: { riskThreshold: number; sprintLengthDays: number; weeklyCapacityHours: number; timezone: string; aiEnabled: boolean; slaPolicy: Record<"critical" | "high" | "medium" | "low", { firstResponseHours: number; resolutionHours: number }> } }
const settings = { riskThreshold: 65, sprintLengthDays: 14, weeklyCapacityHours: 40, timezone: "Asia/Calcutta", aiEnabled: true, slaPolicy: { critical: { firstResponseHours: 1, resolutionHours: 8 }, high: { firstResponseHours: 4, resolutionHours: 24 }, medium: { firstResponseHours: 8, resolutionHours: 72 }, low: { firstResponseHours: 24, resolutionHours: 120 } } };
export const Organization = createPgModel({ table: "organizations", columns: ["name", "slug", "plan", "owner", "onboardingCompletedAt", "settings"], json: ["settings"], defaults: { plan: "starter", settings }, relations: { owner: { model: () => User } } });
