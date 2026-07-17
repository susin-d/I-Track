import type { Request, Response } from "express";
import { createApp } from "./app.js";
import { connectDb } from "./config/db.js";
import { env } from "./config/env.js";

const app = createApp();
let databaseConnection: Promise<void> | undefined;

function ensureDatabaseConnection() {
  databaseConnection ??= connectDb().catch((error) => {
    databaseConnection = undefined;
    throw error;
  });
  return databaseConnection;
}

export default async function handler(req: Request, res: Response) {
  try {
    await ensureDatabaseConnection();
    app(req, res);
  } catch (error) {
    console.error("Database initialization failed", error);
    if (!res.headersSent) {
      res.status(503).json({ message: "Database service is unavailable" });
    }
  }
}

if (!process.env.VERCEL) {
  await ensureDatabaseConnection();
  app.listen(env.port, () => {
    console.log(`I-TRACK API listening on http://localhost:${env.port}`);
  });
}
