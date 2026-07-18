export type ReportFilters = { projectId?: string; memberId?: string; startDate?: Date | null };

export function filterReportRows(tickets: any[], sprints: any[], filters: ReportFilters) {
  const ticketsResult = tickets.filter((ticket) => {
    if (filters.projectId && String(ticket.project) !== filters.projectId) return false;
    if (filters.memberId && String(ticket.assignee || "") !== filters.memberId) return false;
    if (filters.startDate && ticket.createdAt && new Date(ticket.createdAt) < filters.startDate) return false;
    return true;
  });
  const sprintsResult = sprints.filter((sprint) => {
    if (filters.projectId && String(sprint.project) !== filters.projectId) return false;
    if (filters.startDate && sprint.startDate && new Date(sprint.startDate) < filters.startDate) return false;
    return true;
  });
  return { tickets: ticketsResult, sprints: sprintsResult };
}

export function capacityPercent(capacity: number, weeklyCapacityHours: number) {
  if (!weeklyCapacityHours || capacity <= 0) return 0;
  return Math.min(100, Math.round((capacity / weeklyCapacityHours) * 100));
}
