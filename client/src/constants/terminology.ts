export const TICKET_TYPES = ["Story", "Task", "Bug", "Sub-task"] as const;

export const TERMINOLOGY = {
  ticket: "Ticket",
  ticketPlural: "Tickets",
  ticketType: "Ticket type",
  epic: "Epic",
  sprint: "Sprint",
  cycle: "Cycle",
  backlog: "Backlog",
} as const;

export function isEpicTicketType(value: unknown) {
  return String(value || "").trim().toLowerCase() === "epic";
}

export function resourceDisplayName(kind: string) {
  if (kind === "issue-type") return TERMINOLOGY.ticketType;
  return kind
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
