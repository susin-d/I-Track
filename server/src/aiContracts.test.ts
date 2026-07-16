import assert from "node:assert/strict";
import test from "node:test";
import { aiEndpointsForRole } from "./aiAccess.js";
import { mutationContractFor, ticketCreateAiGuidance } from "./aiContracts.js";

test("ticket creation guidance includes every required request field", () => {
  for (const field of ["title", "description", "storyPoints", "project", "sprint", "assignee", "dueDate"]) {
    assert.match(ticketCreateAiGuidance, new RegExp(`\\b${field}\\b`));
  }
  assert.match(ticketCreateAiGuidance, /GET \/dashboard/);
  assert.match(ticketCreateAiGuidance, /never invent ids/i);
});

test("every AI-callable mutation has an explicit request contract", () => {
  const mutations = aiEndpointsForRole("admin").filter((endpoint) => endpoint.method !== "GET");
  assert.equal(mutations.length, 72);
  for (const endpoint of mutations) {
    const contract = mutationContractFor(endpoint.method, endpoint.path);
    assert.ok(contract, `missing AI request contract for ${endpoint.method} ${endpoint.path}`);
    assert.ok(contract.body.length > 0);
  }
});

test("mutation contracts resolve concrete paths and special destructive bodies", () => {
  assert.equal(mutationContractFor("PATCH", "/tickets/123/status")?.endpoint, "PATCH /tickets/:id/status");
  assert.match(mutationContractFor("DELETE", "/organization")?.body ?? "", /confirmationName/);
  assert.match(mutationContractFor("POST", "/projects")?.body ?? "", /planning\|active\|paused\|done/);
  assert.match(mutationContractFor("POST", "/resources/label")?.body ?? "", /automation-rule/);
  assert.equal(mutationContractFor("GET", "/tickets"), null);
});
