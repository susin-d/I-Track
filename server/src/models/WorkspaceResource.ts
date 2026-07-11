import mongoose, { Schema } from "mongoose";

export const resourceKinds = ["epic", "label", "component", "release", "issue-type", "priority", "workflow", "custom-field", "template", "board", "milestone"] as const;
export type ResourceKind = typeof resourceKinds[number];

const workspaceResourceSchema = new Schema(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project" },
    kind: { type: String, enum: resourceKinds, required: true },
    name: { type: String, required: true },
    key: { type: String },
    description: { type: String, default: "" },
    status: { type: String, default: "active" },
    order: { type: Number, default: 0 },
    config: { type: Schema.Types.Mixed, default: {} },
    archivedAt: { type: Date },
  },
  { timestamps: true },
);
workspaceResourceSchema.index({ organization: 1, kind: 1, project: 1, name: 1 }, { unique: true });
export const WorkspaceResource = mongoose.model("WorkspaceResource", workspaceResourceSchema);
