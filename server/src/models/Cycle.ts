import { createPgModel } from "../db/pgModel.js";
import { Sprint } from "./Sprint.js";

export interface ICycle { organization: string; name: string; goal: string; status: "planned" | "active" | "completed"; startDate: Date; endDate: Date; sprints: string[]; createdAt?: Date; updatedAt?: Date }
export const Cycle = createPgModel({ table: "cycles", columns: ["organization", "name", "goal", "status", "startDate", "endDate", "sprints"], json: ["sprints"], defaults: { goal: "", status: "planned", sprints: [] }, relations: { sprints: { model: () => Sprint, many: true } } });
