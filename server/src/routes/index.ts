import type express from "express";
import { openApiDocument } from "../openapi.js";
import { swaggerPageHtml } from "../docs/swaggerPage.js";
import aiRoutes from "./ai.js";
import analysisRoutes from "./analysis.js";
import authRoutes from "./auth.js";
import dataRoutes from "./data.js";
import extendedRoutes from "./extended.js";

function registerVersionedRoutes(app: express.Express) {
  app.get("/api/v1/health", (_req, res) => res.json({ ok: true, service: "itrack-api", version: "v1" }));
  app.get("/api/v1/openapi.json", (_req, res) => res.json(openApiDocument));
  app.get("/api/v1/openapi", (_req, res) => res.redirect(308, "/api/v1/openapi.json"));
  app.get("/api/docs", (_req, res) => res.type("html").send(swaggerPageHtml()));

  app.use("/api/v1/auth", authRoutes);
  app.use("/api/v1/analysis", analysisRoutes);
  app.use("/api/v1/ai", aiRoutes);
  app.use("/api/v1", dataRoutes);
  app.use("/api/v1", extendedRoutes);
}

function registerLegacyRoutes(app: express.Express) {
  app.use("/api/auth", authRoutes);
  app.use("/api", dataRoutes);
  app.use("/api/analysis", analysisRoutes);
  app.use("/api/ai", aiRoutes);
  app.use("/api", extendedRoutes);
}

export function registerRoutes(app: express.Express) {
  app.get("/api/health", (_req, res) => res.json({ ok: true, service: "itrack-api" }));
  registerVersionedRoutes(app);
  registerLegacyRoutes(app);
}
