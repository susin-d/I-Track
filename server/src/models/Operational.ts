import { createPgModel } from "../db/pgModel.js";
import { Organization } from "./Organization.js";
import { User } from "./User.js";

export const Session = createPgModel({ table: "sessions", columns: ["user", "organization", "tokenHash", "expiresAt", "revokedAt", "userAgent"], columnMap: { user: "user_id" }, relations: { user: { model: () => User }, organization: { model: () => Organization } } });
export const ActionToken = createPgModel({ table: "action_tokens", columns: ["user", "organization", "kind", "tokenHash", "expiresAt", "usedAt"], columnMap: { user: "user_id" }, relations: { user: { model: () => User }, organization: { model: () => Organization } } });
export const Notification = createPgModel({ table: "notifications", columns: ["organization", "user", "type", "title", "body", "entityType", "entityId", "readAt"], columnMap: { user: "user_id" }, relations: { user: { model: () => User } } });
export const AuditEvent = createPgModel({ table: "audit_events", columns: ["organization", "actor", "action", "entityType", "entityId", "metadata"], json: ["metadata"], defaults: { metadata: {} }, relations: { actor: { model: () => User } } });
export const Integration = createPgModel({ table: "integrations", columns: ["organization", "kind", "name", "secretHash", "url", "events", "active", "lastUsedAt"], json: ["events"], defaults: { events: [], active: true } });
