import mongoose, { Schema } from "mongoose";

export interface IOrganization {
  name: string;
  slug: string;
  plan: "starter" | "scale" | "enterprise";
  owner: mongoose.Types.ObjectId;
  settings: {
    riskThreshold: number;
    sprintLengthDays: number;
    timezone: string;
    aiEnabled: boolean;
  };
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    plan: { type: String, default: "starter" },
    owner: { type: Schema.Types.ObjectId, ref: "User" },
    settings: {
      riskThreshold: { type: Number, default: 65 },
      sprintLengthDays: { type: Number, default: 14 },
      timezone: { type: String, default: "Asia/Calcutta" },
      aiEnabled: { type: Boolean, default: true },
    },
  },
  { timestamps: true },
);

export const Organization = mongoose.model<IOrganization>("Organization", organizationSchema);
