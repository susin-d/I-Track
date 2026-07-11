import type { NextFunction, Response } from "express";
import type { AuthRequest } from "./auth.js";
import type { UserRole } from "../models/User.js";

export const allRoles: UserRole[] = ["admin", "manager", "engineer", "designer"];
const leaders: UserRole[] = ["admin", "manager"];
const admins: UserRole[] = ["admin"];

type AccessRule = { methods: string[]; pattern: RegExp; roles: UserRole[] };

export const accessRules: AccessRule[] = [
  { methods: ["GET"], pattern: /^\/(audit-logs|organization\/usage|integrations)(\/|$)/, roles: admins },
  { methods: ["PATCH", "DELETE"], pattern: /^\/organization(\/|$)/, roles: admins },
  { methods: ["POST", "PATCH", "DELETE"], pattern: /^\/(users|invitations)(\/|$)/, roles: admins },
  { methods: ["POST", "DELETE"], pattern: /^\/integrations(\/|$)/, roles: admins },
  { methods: ["GET", "POST"], pattern: /^\/(export|import)(\/|$)/, roles: admins },
  { methods: ["PATCH"], pattern: /^\/settings$/, roles: admins },
  { methods: ["POST", "PATCH", "DELETE", "PUT"], pattern: /^\/(projects|sprints|resources)(\/|$)/, roles: leaders },
  { methods: ["POST"], pattern: /^\/ai\/confirm-ticket-plan$/, roles: leaders },
  { methods: ["POST", "PATCH", "DELETE"], pattern: /^\/tickets\/bulk$/, roles: leaders },
  { methods: ["POST", "DELETE"], pattern: /^\/tickets\/[^/]+\/(archive|restore|clone)$/, roles: leaders },
  { methods: ["PATCH"], pattern: /^\/tickets\/[^/]+\/dependencies$/, roles: leaders },
  { methods: ["POST", "PATCH", "DELETE"], pattern: /^\/tickets\/[^/]+\/(status|rank|assign|watch|comments|work-logs|attachments)(\/|$)/, roles: allRoles },
  { methods: ["PATCH"], pattern: /^\/tickets\/[^/]+$/, roles: leaders },
  { methods: ["POST", "DELETE"], pattern: /^\/tickets(\/|$)/, roles: leaders },
  { methods: ["PATCH", "POST"], pattern: /^\/notifications(\/|$)/, roles: allRoles },
];

export function rolesForEndpoint(method: string, path: string): UserRole[] {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const concrete = normalized.replace(/:[^/]+/g, "example");
  return accessRules.find((rule) => rule.methods.includes(method.toUpperCase()) && rule.pattern.test(concrete))?.roles ?? allRoles;
}

export function enforceApiAccess(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Authentication is required" } });
  const roles = rolesForEndpoint(req.method, req.path);
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: "Your role cannot access this endpoint", allowedRoles: roles } });
  }
  return next();
}
