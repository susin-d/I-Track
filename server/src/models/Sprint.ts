import { createPgModel } from "../db/pgModel.js";
import { Project } from "./Project.js";

export interface ISprint { organization: string; name: string; project: string; status: "planned" | "active" | "completed"; startDate: Date; endDate: Date; capacity: number; plannedPoints: number; completedPoints: number; velocityHistory: number[]; riskScore: number }
export const Sprint = createPgModel({ table: "sprints", columns: ["organization", "name", "project", "status", "startDate", "endDate", "capacity", "plannedPoints", "completedPoints", "velocityHistory", "riskScore"], json: ["velocityHistory"], defaults: { capacity: 0, plannedPoints: 0, completedPoints: 0, velocityHistory: [], riskScore: 0 }, relations: { project: { model: () => Project } } });
