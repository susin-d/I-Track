export type Role = "admin" | "manager" | "engineer" | "designer";
export type TicketStatus = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";
export type Priority = "low" | "medium" | "high" | "critical";

export type NotificationPreferences = {
  ticketAssignments: boolean;
  mentionsAndComments: boolean;
  sprintRiskAlerts: boolean;
  weeklySummary: boolean;
  slaAlerts: boolean;
};

export type Ticket = {
  id: string;
  key: string;
  ticketId?: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  points: number;
  assignee: string;
  assigneeId?: string;
  project: string;
  labels: string[];
  epic?: string;
  dependencies?: string[];
  slaStatus?: "healthy" | "due_soon" | "breached" | "resolved";
  firstResponseDueAt?: string;
  resolutionDueAt?: string;
  firstRespondedAt?: string;
  resolvedAt?: string;
  sprintId?: string;
  sprintName?: string;
  blocked?: boolean;
  watched?: boolean;
  rank?: number;
};

export type Toast = { id: number; message: string };
