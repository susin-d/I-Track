import test from "node:test";
import assert from "node:assert/strict";
import { capacityPercent, filterReportRows } from "./reporting.js";

test("report filters apply project, member, and start date together", () => {
  const result = filterReportRows(
    [
      { project: "p1", assignee: "u1", createdAt: "2026-07-10T00:00:00Z" },
      { project: "p2", assignee: "u1", createdAt: "2026-07-12T00:00:00Z" },
      { project: "p1", assignee: "u2", createdAt: "2026-07-12T00:00:00Z" },
    ],
    [
      { project: "p1", startDate: "2026-07-11T00:00:00Z" },
      { project: "p2", startDate: "2026-07-12T00:00:00Z" },
    ],
    { projectId: "p1", memberId: "u1", startDate: new Date("2026-07-11T00:00:00Z") },
  );
  assert.equal(result.tickets.length, 0);
  assert.equal(result.sprints.length, 1);
});

test("capacity percent uses the configured weekly capacity", () => {
  assert.equal(capacityPercent(32, 40), 80);
  assert.equal(capacityPercent(32, 32), 100);
});
