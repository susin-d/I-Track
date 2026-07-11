import mongoose, { Schema } from "mongoose";

const sessionSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true }, organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true }, revokedAt: Date, userAgent: String }, { timestamps: true });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const Session = mongoose.model("Session", sessionSchema);

const actionTokenSchema = new Schema({ user: { type: Schema.Types.ObjectId, ref: "User", required: true }, organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, kind: { type: String, enum: ["password-reset", "invite"], required: true }, tokenHash: { type: String, required: true, unique: true }, expiresAt: { type: Date, required: true }, usedAt: Date }, { timestamps: true });
actionTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const ActionToken = mongoose.model("ActionToken", actionTokenSchema);

const notificationSchema = new Schema({ organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, user: { type: Schema.Types.ObjectId, ref: "User", required: true }, type: { type: String, required: true }, title: { type: String, required: true }, body: String, entityType: String, entityId: String, readAt: Date }, { timestamps: true });
notificationSchema.index({ organization: 1, user: 1, createdAt: -1 });
export const Notification = mongoose.model("Notification", notificationSchema);

const auditSchema = new Schema({ organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, actor: { type: Schema.Types.ObjectId, ref: "User", required: true }, action: { type: String, required: true }, entityType: String, entityId: String, metadata: { type: Schema.Types.Mixed, default: {} } }, { timestamps: true });
auditSchema.index({ organization: 1, createdAt: -1 });
export const AuditEvent = mongoose.model("AuditEvent", auditSchema);

const integrationSchema = new Schema({ organization: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, kind: { type: String, enum: ["api-token", "webhook"], required: true }, name: { type: String, required: true }, secretHash: String, url: String, events: [String], active: { type: Boolean, default: true }, lastUsedAt: Date }, { timestamps: true });
integrationSchema.index({ organization: 1, kind: 1, name: 1 }, { unique: true });
export const Integration = mongoose.model("Integration", integrationSchema);
