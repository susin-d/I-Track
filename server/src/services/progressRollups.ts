import { Cycle } from "../models/Cycle.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { WorkspaceResource } from "../models/WorkspaceResource.js";

type RollupTicket = { status?: string; storyPoints?: number; project?: unknown; sprint?: unknown; epic?: string; archivedAt?: unknown; deletedAt?: unknown };
const id = (value: unknown) => String((value as { _id?: unknown })?._id ?? value ?? "");
const includedTickets = (tickets: RollupTicket[]) => tickets.filter((ticket) => !ticket.archivedAt && !ticket.deletedAt);
const percentage = (done: number, total: number) => total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

export function ticketPointRollup(tickets: RollupTicket[]) {
  const included = includedTickets(tickets);
  const plannedPoints = included.reduce((sum, ticket) => sum + (Number(ticket.storyPoints) || 0), 0);
  const completedPoints = included.filter((ticket) => ticket.status === "Done").reduce((sum, ticket) => sum + (Number(ticket.storyPoints) || 0), 0);
  return { plannedPoints, completedPoints, progress: percentage(completedPoints, plannedPoints) };
}

export function statusForCycle(sprints: Array<{ status?: string }>) {
  if (sprints.length && sprints.every((sprint) => sprint.status === "completed")) return "completed";
  if (sprints.some((sprint) => sprint.status === "active")) return "active";
  return "planned";
}

export async function refreshWorkspaceProgress(organization: string) {
  const [tickets, sprints, cycles, projects, epics] = await Promise.all([
    Ticket.find({ organization }), Sprint.find({ organization }), Cycle.find({ organization }),
    Project.find({ organization }), WorkspaceResource.find({ organization, kind: "epic" }),
  ]);
  const included = includedTickets(tickets as RollupTicket[]);

  for (const sprint of sprints) {
    const rollup = ticketPointRollup(included.filter((ticket) => id(ticket.sprint) === id(sprint._id)));
    sprint.plannedPoints = rollup.plannedPoints;
    sprint.completedPoints = rollup.completedPoints;
    await sprint.save();
  }
  for (const project of projects) {
    project.progress = ticketPointRollup(included.filter((ticket) => id(ticket.project) === id(project._id))).progress;
    await project.save();
  }
  for (const epic of epics) {
    const name = String(epic.name || "").trim().toLocaleLowerCase();
    const project = id(epic.project);
    const rollup = ticketPointRollup(included.filter((ticket) =>
      String(ticket.epic || "").trim().toLocaleLowerCase() === name && (!project || id(ticket.project) === project),
    ));
    epic.config = { ...(epic.config || {}), progress: rollup.progress, plannedPoints: rollup.plannedPoints, completedPoints: rollup.completedPoints };
    await epic.save();
  }
  for (const cycle of cycles) {
    const sprintIds = new Set((cycle.sprints || []).map(id));
    cycle.status = statusForCycle(sprints.filter((sprint) => sprintIds.has(id(sprint._id))) as Array<{ status?: string }>);
    await cycle.save();
  }
}
