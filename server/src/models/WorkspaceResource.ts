import { createPgModel } from "../db/pgModel.js";
import { Project } from "./Project.js";

export const resourceKinds = ["epic", "label", "component", "release", "issue-type", "priority", "workflow", "custom-field", "template", "board", "milestone", "automation-rule", "notification-rule", "permission-scheme", "saved-filter"] as const;
export type ResourceKind = typeof resourceKinds[number];
export const WorkspaceResource = createPgModel({ table: "workspace_resources", columns: ["organization", "project", "kind", "name", "key", "description", "status", "order", "config", "archivedAt"], columnMap: { order: "ordering" }, json: ["config"], defaults: { description: "", status: "active", order: 0, config: {} }, relations: { project: { model: () => Project } } });
