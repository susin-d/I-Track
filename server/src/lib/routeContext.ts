import type { AuthRequest } from "../middleware/auth.js";

export const organizationId = (req: AuthRequest) => req.user!.organizationId;
export const currentUserId = (req: AuthRequest) => req.user!.userId;
export const organizationFilter = (req: AuthRequest) => ({ organization: organizationId(req) });
