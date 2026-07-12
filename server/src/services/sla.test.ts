import assert from "node:assert/strict";
import test from "node:test";
import { cycleMetricsForTickets, getTicketSlaStatus, slaFieldsForTicket } from "./sla.js";

test("SLA deadline calculation uses priority policy", () => {
  const createdAt = new Date("2026-07-01T00:00:00.000Z");
  const fields = slaFieldsForTicket("critical", createdAt, {
    critical: { firstResponseHours: 2, resolutionHours: 10 },
  });
  assert.equal(fields.firstResponseDueAt.toISOString(), "2026-07-01T02:00:00.000Z");
  assert.equal(fields.resolutionDueAt.toISOString(), "2026-07-01T10:00:00.000Z");
});

test("SLA status moves from due soon to breached to resolved", () => {
  const now = new Date("2026-07-01T10:00:00.000Z");
  assert.equal(getTicketSlaStatus({
    status: "In Progress",
    firstResponseDueAt: new Date("2026-07-01T12:00:00.000Z"),
    resolutionDueAt: new Date("2026-07-01T13:00:00.000Z"),
  }, now), "due_soon");
  assert.equal(getTicketSlaStatus({
    status: "In Progress",
    firstResponseDueAt: new Date("2026-07-01T09:00:00.000Z"),
    resolutionDueAt: new Date("2026-07-01T13:00:00.000Z"),
  }, now), "breached");
  assert.equal(getTicketSlaStatus({
    status: "Done",
    resolvedAt: now,
    firstResponseDueAt: new Date("2026-07-01T09:00:00.000Z"),
    resolutionDueAt: new Date("2026-07-01T09:00:00.000Z"),
  }, now), "resolved");
});

test("cycle metrics ignore tickets missing required transitions", () => {
  const metrics = cycleMetricsForTickets([
    {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      resolvedAt: new Date("2026-07-05T00:00:00.000Z"),
      statusTransitions: [{ to: "In Progress", at: new Date("2026-07-03T00:00:00.000Z") }],
    },
    {
      createdAt: new Date("2026-07-01T00:00:00.000Z"),
      statusTransitions: [],
    },
  ]);
  assert.equal(metrics.leadTime, 4);
  assert.equal(metrics.cycleTime, 2);
  assert.equal(metrics.measuredTickets, 1);
});
