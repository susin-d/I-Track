import { createPgModel } from "../db/pgModel.js";
import { User } from "./User.js";

export type RiskLevel = "low" | "medium" | "high" | "critical";
export interface IProject { organization: string; key: string; name: string; description: string; status: "planning" | "active" | "paused" | "done"; progress: number; riskLevel: RiskLevel; activeSprint: string; members: string[] }
export const Project = createPgModel({ table: "projects", columns: ["organization", "key", "name", "description", "status", "progress", "riskLevel", "activeSprint", "members"], json: ["members"], defaults: { description: "", progress: 0, riskLevel: "low", members: [] }, relations: { members: { model: () => User, many: true } } });
