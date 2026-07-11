import assert from "node:assert/strict";
import test from "node:test";
import { rolesForEndpoint } from "./middleware/access.js";
import { openApiDocument } from "./openapi.js";

test("RBAC protects administrative and planning endpoints", () => {
  assert.deepEqual(rolesForEndpoint("GET", "/audit-logs"), ["admin"]);
  assert.deepEqual(rolesForEndpoint("POST", "/invitations"), ["admin"]);
  assert.deepEqual(rolesForEndpoint("DELETE", "/organization"), ["admin"]);
  assert.deepEqual(rolesForEndpoint("POST", "/projects"), ["admin", "manager"]);
  assert.deepEqual(rolesForEndpoint("POST", "/sprints/123/start"), ["admin", "manager"]);
  assert.deepEqual(rolesForEndpoint("PATCH", "/tickets/123"), ["admin", "manager"]);
});

test("RBAC permits contributor ticket collaboration and authenticated reads", () => {
  const everyone = ["admin", "manager", "engineer", "designer"];
  assert.deepEqual(rolesForEndpoint("PATCH", "/tickets/123/status"), everyone);
  assert.deepEqual(rolesForEndpoint("POST", "/tickets/123/comments"), everyone);
  assert.deepEqual(rolesForEndpoint("GET", "/projects"), everyone);
});

test("OpenAPI document covers the catalog and declares bearer security and roles", () => {
  assert.equal(openApiDocument.openapi, "3.1.0");
  assert.ok(Object.keys(openApiDocument.paths).length >= 50);
  const operation = openApiDocument.paths["/projects"]?.post as { security?: unknown; "x-allowed-roles"?: string[] };
  assert.ok(operation.security);
  assert.deepEqual(operation["x-allowed-roles"], ["admin", "manager"]);
  const login = openApiDocument.paths["/auth/login"]?.post as { security?: unknown[] };
  assert.deepEqual(login.security, []);
});
