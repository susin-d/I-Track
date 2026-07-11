export const ticketStatuses = ["Backlog", "To Do", "In Progress", "In Review", "Done"] as const;
export const priorityLevels = ["low", "medium", "high", "critical"] as const;
export const projectStatuses = ["planning", "active", "paused", "done"] as const;
export const sprintStatuses = ["planned", "active", "completed"] as const;
export const userRoles = ["admin", "manager", "engineer", "designer"] as const;

export const ticketPopulation = [
  { path: "assignee", select: "name email role skills availability capacity avatarColor inviteStatus organization" },
  { path: "reporter", select: "name email role avatarColor organization" },
  { path: "project", select: "key name organization" },
  { path: "sprint", select: "name status startDate endDate organization" },
];
