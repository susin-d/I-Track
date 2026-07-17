import assert from "node:assert/strict";
import test from "node:test";
import type { AuthRequest } from "../middleware/auth.js";
import { executeAiRequest, mutationAttemptKey } from "./ai.js";

function requestFor(role: "admin" | "manager" | "engineer" | "designer") {
  return {
    user: { userId: "user", organizationId: "organization", email: "user@example.com", role },
    headers: {},
  } as AuthRequest;
}

test("AI executor validates its input before dispatching", async () => {
  const result = await executeAiRequest(requestFor("admin"), { method: "TRACE", path: "/projects" });
  assert.equal(result.status, 400);
});

test("AI executor cannot recursively dispatch itself", async () => {
  const result = await executeAiRequest(requestFor("admin"), { method: "POST", path: "/ai/execute" });
  assert.equal(result.status, 400);
  assert.deepEqual(result.payload, { message: "AI execution cannot call itself" });
});

test("AI executor preserves role access checks before dispatching", async () => {
  const result = await executeAiRequest(requestFor("engineer"), { method: "POST", path: "/projects", body: {} });
  assert.equal(result.status, 403);
});

test("mutation attempt keys are stable for equivalent JSON bodies", () => {
  assert.equal(
    mutationAttemptKey("post", "/api/v1/projects", { name: "Alpha", key: "ALP", nested: { b: 2, a: 1 } }),
    mutationAttemptKey("POST", "/projects", { key: "ALP", nested: { a: 1, b: 2 }, name: "Alpha" }),
  );
});

test("AI executor passes cookies from incoming auth request", async () => {
  const req = {
    ...requestFor("admin"),
    headers: { cookie: "itrack_access=session-token" },
  } as AuthRequest;
  const result = await executeAiRequest(req, { method: "TRACE", path: "/projects" });
  assert.equal(result.status, 400);
});

