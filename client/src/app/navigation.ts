export type NavItem = [string, string, string];
export type NavGroup = { group: string; admin?: boolean; items: NavItem[] };
export const nav: NavGroup[] = [
  {
    group: "Overview",
    items: [
      ["/dashboard", "LayoutDashboard", "Dashboard"],
      ["/my-work", "CircleUserRound", "My work"],
      ["/notifications", "Bell", "Notifications"],
    ],
  },
  {
    group: "Planning",
    items: [
      ["/projects", "FolderKanban", "Projects"],
      ["/backlog", "ListTodo", "Backlog"],
      ["/board", "Columns3", "Board"],
      ["/cycles", "Repeat2", "Cycles"],
      ["/sprints", "Timer", "Sprints"],
      ["/sla", "ShieldCheck", "SLA"],
    ],
  },
  {
    group: "Intelligence",
    items: [
      ["/sprint-risk", "Activity", "Sprint risk"],
      ["/reports", "ChartNoAxesCombined", "Reports"],
      ["/ai", "Sparkles", "AI assistant"],
    ],
  },
  {
    group: "Workspace",
    items: [
      ["/team", "Users", "Team"],
      ["/resources", "Shapes", "Resources"],
    ],
  },
  {
    group: "Administration",
    admin: true,
    items: [
      ["/organization", "Building2", "Organization"],
      ["/integrations", "Webhook", "Integrations"],
      ["/audit-logs", "ScrollText", "Audit logs"],
      ["/import", "ArrowDownToLine", "Import / Export"],
      ["/settings", "Settings", "Settings"],
    ],
  },
];
