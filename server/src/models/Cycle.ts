import mongoose, { Schema } from "mongoose";

export interface ICycle {
  organization: mongoose.Types.ObjectId;
  name: string;
  goal: string;
  status: "planned" | "active" | "completed";
  startDate: Date;
  endDate: Date;
  sprints: mongoose.Types.ObjectId[];
  createdAt?: Date;
  updatedAt?: Date;
}

const cycleSchema = new Schema<ICycle>(
  {
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    goal: { type: String, default: "" },
    status: { type: String, required: true, default: "planned" },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    sprints: [{ type: Schema.Types.ObjectId, ref: "Sprint" }],
  },
  { timestamps: true },
);

cycleSchema.index({ organization: 1, name: 1 }, { unique: true });

export const Cycle = mongoose.model<ICycle>("Cycle", cycleSchema);
