export type Role = "admin" | "manager" | "engineer" | "designer";
export type TicketStatus = "Backlog" | "To Do" | "In Progress" | "In Review" | "Done";
export type Priority = "low" | "medium" | "high" | "critical";

export type Ticket = {
  id: string;
  key: string;
  title: string;
  status: TicketStatus;
  priority: Priority;
  points: number;
  assignee: string;
  project: string;
  labels: string[];
  blocked?: boolean;
  watched?: boolean;
};

export type Toast = { id: number; message: string };
