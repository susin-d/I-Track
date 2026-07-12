import assert from "node:assert/strict";
import test from "node:test";
import { apiCatalog } from "./apiCatalog.js";

test("API catalog has unique, valid endpoint declarations", () => {
  const endpoints = Object.values(apiCatalog.groups).flat();
  assert.ok(endpoints.length >= 70, `expected at least 70 endpoints, got ${endpoints.length}`);
  assert.equal(new Set(endpoints).size, endpoints.length, "endpoint declarations must be unique");
  for (const endpoint of endpoints) assert.match(endpoint, /^(GET|POST|PUT|PATCH|DELETE) \/[a-z0-9:/-]+$/i);
});

test("API catalog includes every primary product area", () => {
  for (const group of ["auth", "users", "projects", "planning", "tickets", "resources", "operations", "intelligence"]) {
    assert.ok(group in apiCatalog.groups);
  }
});

test("API catalog includes AI-callable app feature actions", () => {
  const endpoints = new Set(Object.values(apiCatalog.groups).flat());
  for (const endpoint of [
    "POST /tickets",
    "PATCH /tickets/:id/status",
    "POST /tickets/:id/comments",
    "POST /projects",
    "PUT /projects/:id/members",
    "POST /sprints/:id/start",
    "POST /cycles",
    "GET /sla",
    "PATCH /sla/policy",
    "GET /reports/cycle-time",
    "POST /invitations",
    "PATCH /settings",
    "GET /reports",
    "POST /import/resources",
    "POST /ai/chat",
  ]) {
    assert.ok(endpoints.has(endpoint), `${endpoint} must be present in apiCatalog`);
  }
});
