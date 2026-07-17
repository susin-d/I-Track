import {
  Activity,
  ArrowDownToLine,
  Bell,
  BellRing,
  Building2,
  ChartNoAxesCombined,
  CircleUserRound,
  Columns3,
  FolderKanban,
  GitBranch,
  KeyRound,
  LayoutDashboard,
  ListFilter,
  ListTodo,
  Map,
  Repeat2,
  Rocket,
  ScrollText,
  Settings,
  Shapes,
  ShieldCheck,
  Sparkles,
  Timer,
  Users,
  Webhook,
  Zap,
  type LucideIcon,
} from "lucide-react";

export type NavItem = [string, LucideIcon, string];
export type NavGroup = { group: string; admin?: boolean; items: NavItem[] };
export const nav: NavGroup[] = [
  {
    group: "Overview",
    items: [
      ["/dashboard", LayoutDashboard, "Dashboard"],
      ["/my-work", CircleUserRound, "My work"],
      ["/notifications", Bell, "Notifications"],
    ],
  },
  {
    group: "Plan",
    items: [
      ["/projects", FolderKanban, "Projects"],
      ["/resources/epic", Map, "Roadmap"],
      ["/backlog", ListTodo, "Backlog"],
    ],
  },
  {
    group: "Deliver",
    items: [
      ["/board", Columns3, "Board"],
      ["/sprints", Timer, "Sprints"],
      ["/cycles", Repeat2, "Cycles"],
      ["/resources/release", Rocket, "Releases"],
    ],
  },
  {
    group: "Insights",
    items: [
      ["/sprint-risk", Activity, "Sprint risk"],
      ["/reports", ChartNoAxesCombined, "Reports"],
      ["/sla", ShieldCheck, "SLA"],
      ["/ai", Sparkles, "AI assistant"],
    ],
  },
  {
    group: "People and assets",
    items: [
      ["/team", Users, "Team"],
      ["/resources", Shapes, "Resources"],
    ],
  },
  {
    group: "Administration",
    admin: true,
    items: [
      ["/organization", Building2, "Organization"],
      ["/resources/workflow", GitBranch, "Workflow editor"],
      ["/resources/permission-scheme", KeyRound, "Permission schemes"],
      ["/resources/automation-rule", Zap, "Automation rules"],
      ["/resources/notification-rule", BellRing, "Notification rules"],
      ["/resources/saved-filter", ListFilter, "Saved filters"],
      ["/integrations", Webhook, "Integrations"],
      ["/import", ArrowDownToLine, "Import / Export"],
      ["/audit-logs", ScrollText, "Audit logs"],
      ["/settings", Settings, "Settings"],
    ],
  },
];
