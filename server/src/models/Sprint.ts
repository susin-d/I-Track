import mongoose, { Schema } from "mongoose";

export interface ISprint {
  organization: mongoose.Types.ObjectId;
  name: string;
  project: mongoose.Types.ObjectId;
  status: "planned" | "active" | "completed";
  startDate: Date;
  endDate: Date;
  capacity: number;
  plannedPoints: number;
  completedPoints: number;
  velocityHistory: number[];
  riskScore: number;
}

const sprintSchema = new Schema<ISprint>(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true },
    status: { type: String, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    capacity: { type: Number, required: true },
    plannedPoints: { type: Number, required: true },
    completedPoints: { type: Number, required: true },
    velocityHistory: [{ type: Number }],
    riskScore: { type: Number, required: true },
  },
  { timestamps: true },
);

 sprintSchema.index({ organization: 1, project: 1, name: 1 }, { unique: true });

export const Sprint = mongoose.model<ISprint>("Sprint", sprintSchema);
