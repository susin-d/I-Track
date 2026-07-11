import mongoose, { Schema } from "mongoose";

export type UserRole = "admin" | "manager" | "engineer" | "designer";
export type InviteStatus = "active" | "invited" | "disabled";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  organization: mongoose.Types.ObjectId;
  role: UserRole;
  inviteStatus: InviteStatus;
  skills: string[];
  availability: number;
  capacity: number;
  avatarColor: string;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    passwordHash: { type: String, required: true },
    organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    role: { type: String, required: true },
    inviteStatus: { type: String, default: "active" },
    skills: [{ type: String }],
    availability: { type: Number, default: 1 },
    capacity: { type: Number, default: 32 },
    avatarColor: { type: String, default: "#00AEEF" },
  },
  { timestamps: true },
);

userSchema.index({ organization: 1, email: 1 }, { unique: true });

export const User = mongoose.model<IUser>("User", userSchema);
