import assert from "node:assert/strict";
import test from "node:test";
import { statusForCycle, ticketPointRollup } from "./progressRollups.js";

test("ticket progress follows Done and excludes inactive work", () => {
  assert.deepEqual(ticketPointRollup([
    { status: "Done", storyPoints: 5 }, { status: "In Progress", storyPoints: 3 },
    { status: "Done", storyPoints: 8, archivedAt: new Date() }, { status: "Done", storyPoints: 13, deletedAt: new Date() },
  ]), { plannedPoints: 8, completedPoints: 5, progress: 63 });
});

test("cycle status follows its linked sprints", () => {
  assert.equal(statusForCycle([{ status: "completed" }, { status: "completed" }]), "completed");
  assert.equal(statusForCycle([{ status: "completed" }, { status: "active" }]), "active");
  assert.equal(statusForCycle([{ status: "completed" }, { status: "planned" }]), "planned");
  assert.equal(statusForCycle([]), "planned");
});
