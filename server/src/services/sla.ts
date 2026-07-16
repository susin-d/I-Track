import type { IOrganization } from "../models/Organization.js";
import type { ITicket, TicketPriority, TicketSlaStatus, TicketStatus } from "../models/Ticket.js";

export const defaultSlaPolicy: IOrganization["settings"]["slaPolicy"] = {
  critical: { firstResponseHours: 1, resolutionHours: 8 },
  high: { firstResponseHours: 4, resolutionHours: 24 },
  medium: { firstResponseHours: 8, resolutionHours: 72 },
  low: { firstResponseHours: 24, resolutionHours: 120 },
};

export type SlaPolicy = typeof defaultSlaPolicy;

export function normalizeSlaPolicy(policy?: Partial<SlaPolicy>): SlaPolicy {
  return {
    critical: { ...defaultSlaPolicy.critical, ...(policy?.critical ?? {}) },
    high: { ...defaultSlaPolicy.high, ...(policy?.high ?? {}) },
    medium: { ...defaultSlaPolicy.medium, ...(policy?.medium ?? {}) },
    low: { ...defaultSlaPolicy.low, ...(policy?.low ?? {}) },
  };
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

export function slaFieldsForTicket(priority: TicketPriority, createdAt: Date, policy?: Partial<SlaPolicy>) {
  const normalized = normalizeSlaPolicy(policy);
  const priorityPolicy = normalized[priority];
  return {
    slaPolicy: priorityPolicy,
    firstResponseDueAt: addHours(createdAt, priorityPolicy.firstResponseHours),
    resolutionDueAt: addHours(createdAt, priorityPolicy.resolutionHours),
  };
}

export function getTicketSlaStatus(ticket: Pick<ITicket, "status" | "firstRespondedAt" | "firstResponseDueAt" | "resolvedAt" | "resolutionDueAt">, now = new Date()): TicketSlaStatus {
  if (ticket.status === "Done" || ticket.resolvedAt) return "resolved";
  if ((!ticket.firstRespondedAt && ticket.firstResponseDueAt && ticket.firstResponseDueAt.getTime() < now.getTime()) || (ticket.resolutionDueAt && ticket.resolutionDueAt.getTime() < now.getTime())) return "breached";
  const dueSoonWindowMs = 4 * 60 * 60 * 1000;
  if ((!ticket.firstRespondedAt && ticket.firstResponseDueAt && ticket.firstResponseDueAt.getTime() - now.getTime() <= dueSoonWindowMs) || (ticket.resolutionDueAt && ticket.resolutionDueAt.getTime() - now.getTime() <= dueSoonWindowMs)) return "due_soon";
  return "healthy";
}

export function statusTransition(from: TicketStatus | undefined, to: TicketStatus, at = new Date(), actor?: string) {
  return { ...(from ? { from } : {}), to, at, ...(actor ? { actor } : {}) };
}

export function applySlaState(ticket: any, now = new Date()) {
  ticket.slaStatus = getTicketSlaStatus(ticket, now);
  return ticket;
}

export function cycleMetricsForTickets(tickets: Array<any>) {
  const leadTimes: number[] = [];
  const cycleTimes: number[] = [];
  const dayMs = 24 * 60 * 60 * 1000;

  for (const ticket of tickets) {
    const resolvedAt = ticket.resolvedAt;
    const createdAt = ticket.createdAt;
    if (resolvedAt && createdAt) leadTimes.push((resolvedAt.getTime() - createdAt.getTime()) / dayMs);
    const firstInProgress = (ticket.statusTransitions || []).find((transition: any) => transition.to === "In Progress")?.at;
    if (resolvedAt && firstInProgress) cycleTimes.push((resolvedAt.getTime() - firstInProgress.getTime()) / dayMs);
  }

  const average = (values: number[]) => values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1)) : 0;
  return {
    cycleTime: average(cycleTimes),
    leadTime: average(leadTimes),
    measuredTickets: Math.max(cycleTimes.length, leadTimes.length),
  };
}
