import assert from "node:assert/strict";
import test from "node:test";
import { ticketSchema } from "./workspace.js";

const validTicket = {
  title: "Normalize ticket terminology",
  description: "Keep product language consistent.",
  storyPoints: 3,
  project: "project-id",
  dueDate: "2026-07-31",
};

test("ticket schema accepts canonical and custom ticket types", () => {
  for (const issueType of ["Story", "Task", "Bug", "Sub-task", "Customer request"]) {
    assert.equal(ticketSchema.safeParse({ ...validTicket, issueType }).success, true);
  }
});

test("ticket schema rejects Epic as a ticket type regardless of casing", () => {
  for (const issueType of ["Epic", " epic ", "EPIC"]) {
    const parsed = ticketSchema.safeParse({ ...validTicket, issueType });
    assert.equal(parsed.success, false);
    if (!parsed.success) assert.match(parsed.error.issues[0]?.message || "", /ticket grouping/);
  }
});

test("Epic grouping is optional but validates non-empty names", () => {
  assert.equal(ticketSchema.safeParse({ ...validTicket, epic: "" }).success, true);
  assert.equal(ticketSchema.safeParse({ ...validTicket, epic: "Checkout" }).success, true);
  assert.equal(ticketSchema.safeParse({ ...validTicket, epic: "x" }).success, false);
});
