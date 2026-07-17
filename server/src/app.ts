import cors from "cors";
import express from "express";
import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import helmetModule from "helmet";
import morgan from "morgan";
import { env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errors.js";
import { registerRoutes } from "./routes/index.js";

const helmet = helmetModule as unknown as () => RequestHandler;

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.clientOrigin, credentials: true }));
  app.use(express.json({ limit: "1mb" }));
  app.use(morgan("dev"));
  app.use(rateLimit({ windowMs: 60_000, limit: 1000 }));

  registerRoutes(app);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
