import type { AuthRequest } from "../middleware/auth.js";
import { AuditEvent } from "../models/Operational.js";
import { currentUserId, organizationId } from "../lib/routeContext.js";

export function recordAuditEvent(
  req: AuthRequest,
  action: string,
  entityType?: string,
  entityId?: unknown,
  metadata: object = {},
) {
  return AuditEvent.create({
    organization: organizationId(req),
    actor: currentUserId(req),
    action,
    entityType,
    entityId: entityId ? String(entityId) : undefined,
    metadata,
  });
}
