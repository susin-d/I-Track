import type express from "express";

export function notFoundHandler(_req: express.Request, res: express.Response) {
  return res.status(404).json({ error: { code: "NOT_FOUND", message: "Endpoint not found" } });
}

export function errorHandler(
  error: unknown,
  _req: express.Request,
  res: express.Response,
  _next: express.NextFunction,
) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message } });
}
