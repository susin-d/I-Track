import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../models/User.js";

export type AuthUser = { userId: string; organizationId: string; role: UserRole; email: string };
export type AuthRequest = Request & { user?: AuthUser };

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ message: "Missing bearer token" });
  }
  try {
    req.user = jwt.verify(token, env.jwtSecret) as AuthRequest["user"];
    return next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ message: "Missing authenticated user" });
    if (!roles.includes(req.user.role)) return res.status(403).json({ message: "You do not have permission to perform this action" });
    return next();
  };
}
