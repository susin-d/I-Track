import mongoose, { Schema } from "mongoose";

const counterSchema = new Schema({
  organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  scope: { type: String, required: true },
  value: { type: Number, default: 100 },
});
counterSchema.index({ organization: 1, scope: 1 }, { unique: true });
export const Counter = mongoose.model("Counter", counterSchema);
