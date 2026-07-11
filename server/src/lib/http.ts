import type { Response } from "express";
import { z } from "zod";

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  search: z.string().trim().max(100).optional(),
  sort: z.string().trim().max(50).default("-createdAt"),
});

export function parseOr400<T extends z.ZodTypeAny>(schema: T, value: unknown, res: Response) {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", issues: parsed.error.issues } });
    return null;
  }
  return parsed.data as z.infer<T>;
}

export function pageMeta(page: number, limit: number, total: number) {
  return { page, limit, total, pages: Math.ceil(total / limit) };
}
