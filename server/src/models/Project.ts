import mongoose, { Schema } from "mongoose";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface IProject {
  organization: mongoose.Types.ObjectId;
  key: string;
  name: string;
  description: string;
  status: "planning" | "active" | "paused" | "done";
  progress: number;
  riskLevel: RiskLevel;
  activeSprint: string;
  members: mongoose.Types.ObjectId[];
}

const projectSchema = new Schema<IProject>(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    key: { type: String, required: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    status: { type: String, required: true },
    progress: { type: Number, required: true },
    riskLevel: { type: String, required: true },
    activeSprint: { type: String, required: true },
    members: [{ type: Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true },
);

projectSchema.index({ organization: 1, key: 1 }, { unique: true });

export const Project = mongoose.model<IProject>("Project", projectSchema);
