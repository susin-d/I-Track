import React, { useState } from "react";
import * as Icons from "lucide-react";
import { WorkflowVisualEditor, WorkflowConfig } from "./WorkflowVisualEditor";
import { ModalOverlay } from "./ui";
import { MiniDatePicker } from "./MiniDatePicker";

export type ResourceKind =
  | "epic"
  | "label"
  | "component"
  | "release"
  | "issue-type"
  | "priority"
  | "workflow"
  | "custom-field"
  | "template"
  | "board"
  | "milestone"
  | "automation-rule"
  | "notification-rule"
  | "permission-scheme"
  | "saved-filter";

export interface ResourceItem {
  _id?: string;
  name: string;
  description?: string;
  key?: string;
  status?: string;
  order?: number;
  config?: Record<string, any>;
  updatedAt?: string;
}

export interface FeatureConfig {
  description: string;
  category: "planning" | "attributes" | "governance" | "automation";
  icon: keyof typeof Icons;
  fields: {
    key: string;
    label: string;
    initial?: string;
    type?: "text" | "textarea" | "select" | "date" | "number" | "color";
    options?: { label: string; value: string }[];
  }[];
  presets: {
    name: string;
    description: string;
    key?: string;
    config: Record<string, string>;
  }[];
}

export const RESOURCE_CATEGORIES = [
  { id: "all", label: "All Resources", count: 15 },
  { id: "planning", label: "Planning & Delivery", kinds: ["epic", "release", "board", "milestone"] },
  { id: "attributes", label: "Ticket Attributes", kinds: ["label", "component", "issue-type", "priority", "custom-field", "template"] },
  { id: "governance", label: "Workflows & Governance", kinds: ["workflow", "permission-scheme"] },
  { id: "automation", label: "Automation & Rules", kinds: ["automation-rule", "notification-rule", "saved-filter"] },
];

export const RESOURCE_ICONS: Record<ResourceKind, React.ComponentType<any>> = {
  epic: Icons.Map,
  label: Icons.Tags,
  component: Icons.Boxes,
  release: Icons.Rocket,
  "issue-type": Icons.TicketCheck,
  priority: Icons.Signal,
  workflow: Icons.GitBranch,
  "custom-field": Icons.Braces,
  template: Icons.LayoutTemplate,
  board: Icons.Columns3,
  milestone: Icons.Flag,
  "automation-rule": Icons.Zap,
  "notification-rule": Icons.BellRing,
  "permission-scheme": Icons.KeyRound,
  "saved-filter": Icons.ListFilter,
};

export const COLOR_PALETTE = [
  { label: "Indigo", hex: "#6366f1", bg: "#e0e7ff", text: "#3730a3" },
  { label: "Purple", hex: "#8b5cf6", bg: "#f3e8ff", text: "#5b21b6" },
  { label: "Blue", hex: "#3b82f6", bg: "#dbeafe", text: "#1e40af" },
  { label: "Cyan", hex: "#06b6d4", bg: "#cffaff", text: "#155e75" },
  { label: "Teal", hex: "#14b8a6", bg: "#ccfbf1", text: "#115e59" },
  { label: "Emerald", hex: "#10b981", bg: "#d1fae5", text: "#065f46" },
  { label: "Amber", hex: "#f59e0b", bg: "#fef3c7", text: "#92400e" },
  { label: "Orange", hex: "#f97316", bg: "#ffedd5", text: "#9a3412" },
  { label: "Crimson", hex: "#ef4444", bg: "#fee2e2", text: "#991b1b" },
  { label: "Pink", hex: "#ec4899", bg: "#fce7f3", text: "#9d174d" },
  { label: "Slate", hex: "#64748b", bg: "#f1f5f9", text: "#334155" },
];

export const ALL_RESOURCE_FEATURE_CONFIG: Record<ResourceKind, FeatureConfig> = {
  epic: {
    description: "Manage epics, target dates, owners, theme colors, and progress.",
    category: "planning",
    icon: "Map",
    fields: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "Target Completion Date", type: "date" },
      { key: "owner", label: "Epic Owner / Lead", initial: "Unassigned" },
      {
        key: "color",
        label: "Theme Color",
        initial: "Purple",
        type: "select",
        options: COLOR_PALETTE.map((c) => ({ label: c.label, value: c.label })),
      },
      { key: "progress", label: "Progress (%)", initial: "0", type: "number" },
      { key: "summary", label: "Goal Summary", type: "textarea" },
    ],
    presets: [
      {
        name: "Core Platform Modernization v2",
        description: "Re-architecting core database and API layer for 10x throughput.",
        key: "EPIC-CORE",
        config: { startDate: "2026-08-01", endDate: "2026-11-15", owner: "Alex Rivers", color: "Purple", progress: "45", summary: "High performance backend overhaul" },
      },
      {
        name: "Mobile App Native Redesign",
        description: "Complete UI/UX overhaul of iOS and Android mobile applications.",
        key: "EPIC-MOB",
        config: { startDate: "2026-07-01", endDate: "2026-09-30", owner: "Sarah Chen", color: "Cyan", progress: "70", summary: "Flutter/React Native unified app" },
      },
      {
        name: "Enterprise Compliance & SOC2",
        description: "Security auditing, RBAC controls, and compliance reporting.",
        key: "EPIC-SEC",
        config: { startDate: "2026-08-15", endDate: "2026-12-01", owner: "Marcus Vance", color: "Crimson", progress: "20", summary: "SOC2 Type II Readiness" },
      },
    ],
  },

  label: {
    description: "Categorize tickets with color-coded tags and semantic categories.",
    category: "attributes",
    icon: "Tags",
    fields: [
      {
        key: "color",
        label: "Tag Color",
        initial: "Indigo",
        type: "select",
        options: COLOR_PALETTE.map((c) => ({ label: c.label, value: c.label })),
      },
      {
        key: "category",
        label: "Scope Category",
        initial: "General",
        type: "select",
        options: [
          { label: "General Tag", value: "General" },
          { label: "Component Tag", value: "Component" },
          { label: "Severity Tag", value: "Severity" },
          { label: "Security Tag", value: "Security" },
          { label: "Release Tag", value: "Release" },
          { label: "UX / Frontend", value: "UX" },
        ],
      },
      { key: "usage", label: "Usage Guide / Notes", type: "textarea" },
    ],
    presets: [
      { name: "frontend-core", description: "All UI components, CSS styling, and client reactivity.", key: "L-FE", config: { color: "Cyan", category: "UX", usage: "Apply to client-side tickets" } },
      { name: "backend-api", description: "REST API endpoints, controllers, and database access.", key: "L-BE", config: { color: "Indigo", category: "Component", usage: "Apply to server-side tickets" } },
      { name: "high-priority", description: "Urgent ticket requiring rapid response.", key: "L-HP", config: { color: "Crimson", category: "Severity", usage: "Critical operational tasks" } },
      { name: "security-audit", description: "Vulnerability resolution or security patch.", key: "L-SEC", config: { color: "Purple", category: "Security", usage: "Security review items" } },
    ],
  },

  component: {
    description: "Define project subsystems, module leads, and component tags.",
    category: "attributes",
    icon: "Boxes",
    fields: [
      { key: "lead", label: "Component Lead Engineer", initial: "Unassigned" },
      {
        key: "module",
        label: "Subsystem Module",
        initial: "Backend API",
        type: "select",
        options: [
          { label: "Frontend UI", value: "Frontend UI" },
          { label: "Backend API", value: "Backend API" },
          { label: "Database Layer", value: "Database Layer" },
          { label: "Auth & Identity", value: "Auth & Identity" },
          { label: "Analytics Engine", value: "Analytics Engine" },
          { label: "Mobile Client", value: "Mobile Client" },
          { label: "DevOps / Infra", value: "DevOps / Infra" },
        ],
      },
      {
        key: "color",
        label: "Accent Tone",
        initial: "Blue",
        type: "select",
        options: COLOR_PALETTE.map((c) => ({ label: c.label, value: c.label })),
      },
      { key: "repository", label: "Repo Link / Subdir", initial: "src/modules" },
    ],
    presets: [
      { name: "Auth & Security Service", description: "OAuth2, JWT authentication, RBAC policy enforcement.", key: "CMP-AUTH", config: { lead: "Alex Rivers", module: "Auth & Identity", color: "Purple", repository: "server/src/auth" } },
      { name: "Billing & Payment Engine", description: "Stripe integration, invoices, subscriptions, and receipts.", key: "CMP-BILL", config: { lead: "Sarah Chen", module: "Backend API", color: "Emerald", repository: "server/src/billing" } },
      { name: "Design System UI Components", description: "Reusable React button, modal, form, and table primitives.", key: "CMP-UI", config: { lead: "Marcus Vance", module: "Frontend UI", color: "Cyan", repository: "client/src/components" } },
    ],
  },

  release: {
    description: "Plan software release versions, launch dates, owners, and readiness.",
    category: "planning",
    icon: "Rocket",
    fields: [
      { key: "version", label: "Version Number", initial: "v1.0.0" },
      { key: "startDate", label: "Development Start Date", type: "date" },
      { key: "releaseDate", label: "Target Release Date", type: "date" },
      {
        key: "owner",
        label: "Release Manager",
        initial: "Unassigned",
        type: "select",
        options: [
          { label: "Unassigned", value: "Unassigned" },
          { label: "Elena Rostova", value: "Elena Rostova" },
          { label: "Alex Rivers", value: "Alex Rivers" },
          { label: "Marcus Vance", value: "Marcus Vance" },
          { label: "Sarah Chen", value: "Sarah Chen" },
        ],
      },
      {
        key: "status",
        label: "Release State",
        initial: "Unreleased",
        type: "select",
        options: [
          { label: "Unreleased", value: "Unreleased" },
          { label: "In Staging", value: "In Staging" },
          { label: "Released GA", value: "Released GA" },
          { label: "Archived", value: "Archived" },
        ],
      },
      { key: "progress", label: "Completion Progress (%)", initial: "0", type: "number" },
    ],
    presets: [
      { name: "v1.0.0 GA Major Launch", description: "General availability release with core workflow automation.", key: "REL-100", config: { version: "v1.0.0", startDate: "2026-06-01", releaseDate: "2026-08-01", owner: "Elena Rostova", status: "In Staging", progress: "85" } },
      { name: "v1.1.0 Sprint Maintenance", description: "Performance tweaks, bug fixes, and mobile responsiveness.", key: "REL-110", config: { version: "v1.1.0", startDate: "2026-08-02", releaseDate: "2026-09-01", owner: "Alex Rivers", status: "Unreleased", progress: "25" } },
      { name: "v0.9.5 Security Patch", description: "Urgent security patch for session token rotation.", key: "REL-095", config: { version: "v0.9.5", startDate: "2026-07-10", releaseDate: "2026-07-15", owner: "Marcus Vance", status: "Released GA", progress: "100" } },
    ],
  },

  "issue-type": {
    description: "Define ticket types, icons, colors, and ticket hierarchy levels.",
    category: "attributes",
    icon: "TicketCheck",
    fields: [
      {
        key: "icon",
        label: "Icon Type",
        initial: "Bug",
        type: "select",
        options: [
          { label: "Bug (Red Circle)", value: "Bug" },
          { label: "Story (Green Bookmark)", value: "Story" },
          { label: "Task (Blue Checkbox)", value: "Task" },
          { label: "Bug (Crimson Bug)", value: "Bug" },
          { label: "Sub-task (Teal Branch)", value: "Sub-task" },
          { label: "Incident (Alert Triangle)", value: "Incident" },
          { label: "Improvement (Sparkles)", value: "Improvement" },
        ],
      },
      {
        key: "color",
        label: "Badge Color",
        initial: "Crimson",
        type: "select",
        options: COLOR_PALETTE.map((c) => ({ label: c.label, value: c.label })),
      },
      {
        key: "hierarchy",
        label: "Hierarchy Level",
        initial: "Standard Ticket (Level 0)",
        type: "select",
        options: [
          { label: "Sub-task (Level -1)", value: "Sub-task (Level -1)" },
          { label: "Standard Ticket (Level 0)", value: "Standard Ticket (Level 0)" },
        ],
      },
      { key: "defaultWorkflow", label: "Default Associated Workflow", initial: "Standard Software Workflow" },
    ],
    presets: [
      { name: "Bug", description: "A problem that prevents expected behavior.", key: "IT-BUG", config: { icon: "Bug", color: "Crimson", hierarchy: "Standard Ticket (Level 0)", defaultWorkflow: "Standard Software Workflow" } },
      { name: "Story", description: "A user-facing piece of work expressed from the user's perspective.", key: "IT-STORY", config: { icon: "Story", color: "Emerald", hierarchy: "Standard Ticket (Level 0)", defaultWorkflow: "Standard Software Workflow" } },
      { name: "Task", description: "A technical or operational ticket.", key: "IT-TASK", config: { icon: "Task", color: "Blue", hierarchy: "Standard Ticket (Level 0)", defaultWorkflow: "Simple 3-Stage Kanban" } },
      { name: "Sub-task", description: "A smaller piece of work belonging to a parent ticket.", key: "IT-SUB", config: { icon: "Subtask", color: "Teal", hierarchy: "Sub-task (Level -1)", defaultWorkflow: "Simple 3-Stage Kanban" } },
    ],
  },

  priority: {
    description: "Define ticket urgency, severity indicators, icons, and SLA targets.",
    category: "attributes",
    icon: "Signal",
    fields: [
      {
        key: "level",
        label: "Severity Rank",
        initial: "P2 - High",
        type: "select",
        options: [
          { label: "P0 - Blocker (Service Down)", value: "P0 - Blocker" },
          { label: "P1 - Critical (Major Impact)", value: "P1 - Critical" },
          { label: "P2 - High (Important)", value: "P2 - High" },
          { label: "P3 - Medium (Normal)", value: "P3 - Medium" },
          { label: "P4 - Low (Minor)", value: "P4 - Low" },
          { label: "P5 - Trivial (Cosmetic)", value: "P5 - Trivial" },
        ],
      },
      {
        key: "color",
        label: "Priority Accent Color",
        initial: "Orange",
        type: "select",
        options: COLOR_PALETTE.map((c) => ({ label: c.label, value: c.label })),
      },
      {
        key: "icon",
        label: "Arrow Symbol",
        initial: "DoubleUp",
        type: "select",
        options: [
          { label: "Double Up Arrow (P0/P1)", value: "DoubleUp" },
          { label: "Single Up Arrow (P2)", value: "ChevronUp" },
          { label: "Equals / Bar (P3)", value: "Equals" },
          { label: "Single Down Arrow (P4)", value: "ChevronDown" },
          { label: "Double Down Arrow (P5)", value: "DoubleDown" },
        ],
      },
      { key: "slaHours", label: "SLA First Response Target (Hours)", initial: "4", type: "number" },
    ],
    presets: [
      { name: "P0 - Production Blocker", description: "Entire platform or major feature is down for all customers.", key: "P-P0", config: { level: "P0 - Blocker", color: "Crimson", icon: "DoubleUp", slaHours: "1" } },
      { name: "P1 - Critical Severity", description: "Key function impaired with no workaround available.", key: "P-P1", config: { level: "P1 - Critical", color: "Orange", icon: "ChevronUp", slaHours: "4" } },
      { name: "P2 - High Priority", description: "Important ticket affecting productivity or a core path.", key: "P-P2", config: { level: "P2 - High", color: "Amber", icon: "ChevronUp", slaHours: "12" } },
      { name: "P3 - Medium Standard", description: "Normal priority ticket handled during sprint iteration.", key: "P-P3", config: { level: "P3 - Medium", color: "Blue", icon: "Equals", slaHours: "24" } },
      { name: "P4 - Low / Backlog", description: "Minor defect or non-urgent improvement suggestion.", key: "P-P4", config: { level: "P4 - Low", color: "Slate", icon: "ChevronDown", slaHours: "72" } },
    ],
  },

  workflow: {
    description: "Define workflow status pipelines, allowed transitions, and initial steps.",
    category: "governance",
    icon: "GitBranch",
    fields: [
      { key: "statuses", label: "Statuses (comma separated)", initial: "Backlog, To Do, In Progress, In Review, Done" },
      { key: "initialStatus", label: "Initial Starting Status", initial: "To Do" },
      { key: "transitions", label: "Allowed Transitions (e.g. Backlog > To Do, To Do > In Progress)", initial: "Backlog > To Do, To Do > In Progress, In Progress > In Review, In Review > Done, In Review > In Progress" },
    ],
    presets: [
      { name: "Standard Software Workflow", description: "Classic 5-step development workflow with peer code review.", key: "WF-STD", config: { statuses: "Backlog, To Do, In Progress, In Review, Done", initialStatus: "To Do", transitions: "Backlog > To Do, To Do > In Progress, In Progress > In Review, In Review > Done, In Review > In Progress" } },
      { name: "Simple 3-Stage Kanban", description: "Agile continuous delivery pipeline for quick tasks.", key: "WF-KANBAN", config: { statuses: "To Do, In Progress, Done", initialStatus: "To Do", transitions: "To Do > In Progress, In Progress > Done, In Progress > To Do" } },
      { name: "QA & Release Gate Workflow", description: "High security compliance pipeline with mandatory QA testing.", key: "WF-QA", config: { statuses: "Open, In Dev, QA Ready, In QA, Blocked, Closed", initialStatus: "Open", transitions: "Open > In Dev, In Dev > QA Ready, QA Ready > In QA, In QA > Closed, In Dev > Blocked" } },
    ],
  },

  "custom-field": {
    description: "Extend ticket schemas with custom input fields, selects, dates, and validation.",
    category: "attributes",
    icon: "Braces",
    fields: [
      {
        key: "fieldType",
        label: "Field Input Type",
        initial: "Dropdown Select",
        type: "select",
        options: [
          { label: "Short Text Input", value: "Short Text Input" },
          { label: "Multi-line Textarea", value: "Multi-line Textarea" },
          { label: "Dropdown Select", value: "Dropdown Select" },
          { label: "Numeric Value", value: "Numeric Value" },
          { label: "Date Picker", value: "Date Picker" },
          { label: "User Member Picker", value: "User Member Picker" },
          { label: "Checkbox Flag", value: "Checkbox Flag" },
        ],
      },
      { key: "options", label: "Select Options (comma separated)", initial: "Staging, Production, QA, Local Dev" },
      { key: "placeholder", label: "Placeholder Text", initial: "Select target environment..." },
      {
        key: "required",
        label: "Required Field",
        initial: "No",
        type: "select",
        options: [
          { label: "Yes - Mandatory", value: "Yes" },
          { label: "No - Optional", value: "No" },
        ],
      },
    ],
    presets: [
      { name: "Target Deployment Environment", description: "Select which server environment is affected by this issue.", key: "CF-ENV", config: { fieldType: "Dropdown Select", options: "Staging, Production, QA Sandbox, Edge CDN", placeholder: "Choose environment", required: "Yes" } },
      { name: "Affected Customer Count", description: "Number of users impacted by this incident or request.", key: "CF-USERS", config: { fieldType: "Numeric Value", options: "", placeholder: "e.g. 2500", required: "No" } },
      { name: "Root Cause Classification", description: "Category assigned after post-mortem investigation.", key: "CF-RC", config: { fieldType: "Dropdown Select", options: "Code Defect, Config Misconfiguration, DB Lock, Third-Party Outage", placeholder: "Select root cause", required: "No" } },
      { name: "Security Audit Due Date", description: "Hard target date for security compliance review.", key: "CF-SECDATE", config: { fieldType: "Date Picker", options: "", placeholder: "YYYY-MM-DD", required: "No" } },
    ],
  },

  template: {
    description: "Standardize ticket creation with pre-filled summary formats and checklists.",
    category: "attributes",
    icon: "LayoutTemplate",
    fields: [
      {
        key: "issueType",
        label: "Target Ticket Type",
        initial: "Bug",
        type: "select",
        options: [
          { label: "Bug Report", value: "Bug" },
          { label: "Story", value: "Story" },
          { label: "Task", value: "Task" },
          { label: "Bug", value: "Bug" },
          { label: "Sub-task", value: "Sub-task" },
        ],
      },
      { key: "summaryTemplate", label: "Prefilled Summary Pattern", initial: "[Bug] <Module>: <Brief description>" },
      { key: "descriptionTemplate", label: "Description Template (Markdown)", type: "textarea", initial: "## 🐛 Bug Summary\nBrief summary of the issue.\n\n## 🔄 Steps to Reproduce\n1. Go to...\n2. Click on...\n3. Observe error...\n\n## ✅ Expected Behavior\nDescribe what should happen.\n\n## ❌ Actual Behavior\nDescribe what actually happened." },
      {
        key: "defaultPriority",
        label: "Default Priority",
        initial: "P2 - High",
        type: "select",
        options: [
          { label: "P0 - Blocker", value: "P0 - Blocker" },
          { label: "P1 - Critical", value: "P1 - Critical" },
          { label: "P2 - High", value: "P2 - High" },
          { label: "P3 - Medium", value: "P3 - Medium" },
          { label: "P4 - Low", value: "P4 - Low" },
        ],
      },
    ],
    presets: [
      { name: "Standard Bug Report Template", description: "Comprehensive reproduction steps and environment context.", key: "TMP-BUG", config: { issueType: "Bug", summaryTemplate: "[Bug] <Component>: <Summary>", descriptionTemplate: "## Reproduction Steps\n1. Step 1\n2. Step 2\n\n## Expected vs Actual\nExpected: ...\nActual: ...\n\n## Environment\nBrowser/OS: ...", defaultPriority: "P2 - High" } },
      { name: "Feature User Story Template", description: "As a user, I want X so that Y with clear acceptance criteria.", key: "TMP-STORY", config: { issueType: "Story", summaryTemplate: "[Story] <Feature Name>", descriptionTemplate: "## User Story\nAs a <role>, I want <goal> so that <benefit>.\n\n## Acceptance Criteria\n- [ ] Scenario 1: ...\n- [ ] Scenario 2: ...", defaultPriority: "P3 - Medium" } },
    ],
  },

  board: {
    description: "Configure team boards, column status mappings, swimlanes, and card layouts.",
    category: "planning",
    icon: "Columns3",
    fields: [
      {
        key: "boardType",
        label: "Board Type",
        initial: "Kanban",
        type: "select",
        options: [
          { label: "Kanban (Continuous Flow)", value: "Kanban" },
          { label: "Scrum (Sprint Iterations)", value: "Scrum" },
        ],
      },
      { key: "columns", label: "Columns (comma separated)", initial: "Backlog, To Do, In Progress, Code Review, Done" },
      {
        key: "swimlane",
        label: "Swimlane Grouping",
        initial: "Priority",
        type: "select",
        options: [
          { label: "No Swimlanes", value: "None" },
          { label: "Group by Assignee", value: "Assignee" },
          { label: "Group by Priority", value: "Priority" },
          { label: "Group by Epic", value: "Epic" },
        ],
      },
      {
        key: "cardColors",
        label: "Card Color Indicator",
        initial: "Priority",
        type: "select",
        options: [
          { label: "By Priority Level", value: "Priority" },
          { label: "By Ticket Type", value: "Ticket Type" },
          { label: "By Assignee Avatar", value: "Assignee" },
        ],
      },
    ],
    presets: [
      { name: "Engineering Core Kanban", description: "Standard 4-column flow with priority swimlanes.", key: "BRD-KANBAN", config: { boardType: "Kanban", columns: "To Do, In Progress, Code Review, Done", swimlane: "Priority", cardColors: "Priority" } },
      { name: "Sprint Delivery Scrum Board", description: "Sprint backlog to QA release tracking board.", key: "BRD-SCRUM", config: { boardType: "Scrum", columns: "Backlog, In Sprint, In Progress, QA Testing, Done", swimlane: "Epic", cardColors: "Ticket Type" } },
      { name: "Triage & Incident Board", description: "Fast reaction board for incoming bugs & security alerts.", key: "BRD-TRIAGE", config: { boardType: "Kanban", columns: "New Triage, Under Investigation, Patching, Resolved", swimlane: "Priority", cardColors: "Priority" } },
    ],
  },

  milestone: {
    description: "Key target milestones, target delivery dates, status, and deliverables.",
    category: "planning",
    icon: "Flag",
    fields: [
      { key: "targetDate", label: "Completion Deadline", type: "date" },
      { key: "owner", label: "Milestone Lead", initial: "Unassigned" },
      {
        key: "status",
        label: "Status State",
        initial: "In Progress",
        type: "select",
        options: [
          { label: "Upcoming Target", value: "Upcoming Target" },
          { label: "In Progress", value: "In Progress" },
          { label: "Achieved ✅", value: "Achieved ✅" },
          { label: "Delayed ⚠️", value: "Delayed ⚠️" },
        ],
      },
      { key: "deliverables", label: "Key Deliverables Summary", type: "textarea", initial: "- Full API endpoint migration\n- 99.9% uptime test verified" },
    ],
    presets: [
      { name: "M1: Architecture & API Freeze", description: "Finalize all backend schema and REST endpoints.", key: "MS-M1", config: { targetDate: "2026-08-15", owner: "Alex Rivers", status: "In Progress", deliverables: "- Schema locked\n- API swagger docs published" } },
      { name: "M2: Public Beta Customer Testing", description: "Onboard first 50 enterprise customers to beta cluster.", key: "MS-M2", config: { targetDate: "2026-09-30", owner: "Sarah Chen", status: "Upcoming Target", deliverables: "- Beta feedback form\n- Real-time error monitoring" } },
      { name: "M3: Production GA 1.0", description: "General availability rollout across all regions.", key: "MS-M3", config: { targetDate: "2026-11-01", owner: "Elena Rostova", status: "Upcoming Target", deliverables: "- Global CDN deployment\n- SOC2 compliance certificate" } },
    ],
  },

  "automation-rule": {
    description: "Automate repetitive actions with event triggers, conditions, and actions.",
    category: "automation",
    icon: "Zap",
    fields: [
      {
        key: "trigger",
        label: "Trigger Event",
        initial: "ticket.status.changed",
        type: "select",
        options: [
          { label: "Status Changed (ticket.status.changed)", value: "ticket.status.changed" },
          { label: "Ticket Created (ticket.created)", value: "ticket.created" },
          { label: "Assignee Updated (ticket.assigned)", value: "ticket.assigned" },
          { label: "Comment Added (ticket.commented)", value: "ticket.commented" },
          { label: "SLA Warning Breached (sla.breached)", value: "sla.breached" },
        ],
      },
      {
        key: "condition",
        label: "Condition Filter",
        initial: "status = Done",
        type: "select",
        options: [
          { label: "Always Match (No condition)", value: "always" },
          { label: "Status is Done (status = Done)", value: "status = Done" },
          { label: "Status is In Progress (status = In Progress)", value: "status = In Progress" },
          { label: "Priority is Blocker (priority = P0 - Blocker)", value: "priority = P0 - Blocker" },
          { label: "Ticket is Blocked (blocked = true)", value: "blocked = true" },
          { label: "Unassigned (assignee = null)", value: "assignee = null" },
        ],
      },
      {
        key: "action",
        label: "Executive Action",
        initial: "notify watchers",
        type: "select",
        options: [
          { label: "Notify Watchers & Assignee", value: "notify watchers" },
          { label: "Mark Ticket as Blocked", value: "mark blocked" },
          { label: "Clear Blocked Status", value: "clear blocked" },
          { label: "Set Priority to Critical", value: "set priority = P1 - Critical" },
          { label: "Add Label 'urgent'", value: "add label = urgent" },
          { label: "Assign to Component Lead", value: "assign to lead" },
        ],
      },
      {
        key: "active",
        label: "Rule State",
        initial: "Active",
        type: "select",
        options: [
          { label: "Active & Running", value: "Active" },
          { label: "Paused", value: "Paused" },
        ],
      },
    ],
    presets: [
      { name: "Auto-Notify Team on Completion", description: "Sends in-app alert to watchers when ticket status becomes Done.", key: "RULE-NOTIF", config: { trigger: "ticket.status.changed", condition: "status = Done", action: "notify watchers", active: "Active" } },
      { name: "Escalate Blocker Bugs to Critical", description: "Automatically adds urgent label and notifies leads for P0 bugs.", key: "RULE-ESC", config: { trigger: "ticket.created", condition: "priority = P0 - Blocker", action: "add label = urgent", active: "Active" } },
      { name: "Auto-Assign Triage Tickets", description: "Assigns unassigned newly created tickets directly to component lead.", key: "RULE-TRG", config: { trigger: "ticket.created", condition: "assignee = null", action: "assign to lead", active: "Active" } },
    ],
  },

  "notification-rule": {
    description: "Route system events to targeted recipients across channels.",
    category: "automation",
    icon: "BellRing",
    fields: [
      {
        key: "event",
        label: "Event Trigger",
        initial: "ticket.assigned",
        type: "select",
        options: [
          { label: "Ticket Assigned (ticket.assigned)", value: "ticket.assigned" },
          { label: "Ticket Created (ticket.created)", value: "ticket.created" },
          { label: "Status Transition (ticket.status.changed)", value: "ticket.status.changed" },
          { label: "New Comment (ticket.commented)", value: "ticket.commented" },
          { label: "SLA Threshold Warning (sla.warning)", value: "sla.warning" },
        ],
      },
      {
        key: "channel",
        label: "Notification Channel",
        initial: "In-App Notification",
        type: "select",
        options: [
          { label: "In-App Notification Banner", value: "In-App Notification" },
          { label: "Email Alert Digest", value: "Email Alert Digest" },
          { label: "Webhook Integration Payload", value: "Webhook Integration Payload" },
        ],
      },
      {
        key: "recipients",
        label: "Target Audience",
        initial: "Assignee",
        type: "select",
        options: [
          { label: "Assigned Member", value: "Assignee" },
          { label: "Ticket Reporter", value: "Reporter" },
          { label: "All Ticket Watchers", value: "Watchers" },
          { label: "Workspace Admins", value: "Admins" },
        ],
      },
    ],
    presets: [
      { name: "Direct Assignee Assignment Notification", description: "Notifies team member as soon as a ticket is assigned to them.", key: "NR-ASSIGN", config: { event: "ticket.assigned", channel: "In-App Notification", recipients: "Assignee" } },
      { name: "Broadcaster for Status Escalations", description: "Notifies all watchers when ticket transitions or is resolved.", key: "NR-WATCH", config: { event: "ticket.status.changed", channel: "In-App Notification", recipients: "Watchers" } },
      { name: "SLA Warning Admin Emergency Alert", description: "Dispatches urgent webhook alert when SLA threshold is approaching.", key: "NR-SLA", config: { event: "sla.warning", channel: "Webhook Integration Payload", recipients: "Admins" } },
    ],
  },

  "permission-scheme": {
    description: "Control role-based access permissions across workspace operations.",
    category: "governance",
    icon: "KeyRound",
    fields: [
      { key: "roles", label: "Roles in Scheme (comma separated)", initial: "admin, manager, engineer, designer, reviewer" },
      { key: "permissions", label: "Granted Permissions (comma separated)", initial: "browse, create, edit, transition, comment, manage_settings" },
      {
        key: "scope",
        label: "Scope Level",
        initial: "Workspace Wide",
        type: "select",
        options: [
          { label: "Workspace Wide", value: "Workspace Wide" },
          { label: "Project Scoped", value: "Project Scoped" },
          { label: "Team Scoped", value: "Team Scoped" },
        ],
      },
    ],
    presets: [
      { name: "Standard Open Workspace Scheme", description: "Collaborative default where all engineers can create and transition tickets.", key: "PS-OPEN", config: { roles: "admin, manager, engineer, designer", permissions: "browse, create, edit, transition, comment", scope: "Workspace Wide" } },
      { name: "Strict Security Scheme", description: "Restricted scheme where only managers & admins can delete or alter settings.", key: "PS-STRICT", config: { roles: "admin, manager, member, auditor", permissions: "browse, create, edit, transition", scope: "Workspace Wide" } },
      { name: "External Contractor Scheme", description: "Read and comment access with restricted project editing.", key: "PS-GUEST", config: { roles: "admin, contractor, guest", permissions: "browse, comment", scope: "Project Scoped" } },
    ],
  },

  "saved-filter": {
    description: "Save complex ticket searches as reusable team queues with 1-click execution.",
    category: "automation",
    icon: "ListFilter",
    fields: [
      { key: "query", label: "Search Text Query", initial: "bug" },
      { key: "label", label: "Label Tag Filter", initial: "frontend-core" },
      {
        key: "filter",
        label: "Ticket Status State",
        initial: "open",
        type: "select",
        options: [
          { label: "Open Tickets Only", value: "open" },
          { label: "All Tickets", value: "all" },
          { label: "Blocked Tickets Only", value: "blocked" },
        ],
      },
      {
        key: "sort",
        label: "Sort Order",
        initial: "Priority Descending",
        type: "select",
        options: [
          { label: "Priority Descending", value: "priority-desc" },
          { label: "Recently Updated", value: "desc" },
          { label: "Oldest First", value: "asc" },
        ],
      },
      {
        key: "shared",
        label: "Share with Workspace",
        initial: "Yes",
        type: "select",
        options: [
          { label: "Yes - Public to workspace", value: "Yes" },
          { label: "No - Private filter", value: "No" },
        ],
      },
    ],
    presets: [
      { name: "My Critical Open Bugs", description: "High priority bugs requiring immediate developer attention.", key: "SF-BUG", config: { query: "bug", label: "frontend-core", filter: "open", sort: "priority-desc", shared: "Yes" } },
      { name: "Blocked Tickets Queue", description: "All tickets currently flagged as blocked or waiting.", key: "SF-BLK", config: { query: "", label: "", filter: "blocked", sort: "desc", shared: "Yes" } },
      { name: "Recent API Refactor Items", description: "Backend tickets updated within recent sprint.", key: "SF-API", config: { query: "API", label: "backend-api", filter: "open", sort: "desc", shared: "Yes" } },
    ],
  },
};

export function ResourceVisualPreview({ kind, item }: { kind: ResourceKind; item: Partial<ResourceItem> }) {
  const config = item.config || {};

  switch (kind) {
    case "epic": {
      const color = COLOR_PALETTE.find((c) => c.label.toLowerCase() === (config.color || "purple").toLowerCase()) || COLOR_PALETTE[1];
      const pct = Math.max(0, Math.min(100, Number(config.progress || 0)));
      return (
        <div className="rv-preview-card" style={{ borderColor: color.hex, background: "var(--surface)" }}>
          <div className="rv-badge-header">
            <span className="rv-pill" style={{ background: color.bg, color: color.text }}>
              <Icons.Map size={13} /> {item.key || "EPIC-101"}
            </span>
            <span className="rv-owner"><Icons.User size={12} /> {config.owner || "Lead"}</span>
          </div>
          <h4 style={{ margin: "8px 0 4px", fontSize: "14px", fontWeight: 600 }}>{item.name || "Epic Title"}</h4>
          <p className="rv-desc" style={{ fontSize: "11px", color: "var(--muted)", margin: "0 0 10px" }}>{config.summary || item.description || "No description provided"}</p>
          <div className="rv-progress-wrap">
            <div className="rv-progress-text">
              <span>Timeline: {config.startDate || "Start"} → {config.endDate || "End"}</span>
              <b>{pct}%</b>
            </div>
            <div className="rv-progress-bar">
              <div className="rv-progress-fill" style={{ width: `${pct}%`, background: color.hex }} />
            </div>
          </div>
        </div>
      );
    }

    case "label": {
      const color = COLOR_PALETTE.find((c) => c.label.toLowerCase() === (config.color || "indigo").toLowerCase()) || COLOR_PALETTE[0];
      return (
        <div className="rv-preview-card" style={{ textAlign: "center", padding: "16px" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 14px", borderRadius: "16px", background: color.bg, color: color.text, fontWeight: 600, fontSize: "13px", border: `1px solid ${color.hex}` }}>
            <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: color.hex }} />
            {item.name || "label-tag"}
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "10px" }}>
            Category: <b>{config.category || "General"}</b>
          </div>
        </div>
      );
    }

    case "component": {
      const color = COLOR_PALETTE.find((c) => c.label.toLowerCase() === (config.color || "blue").toLowerCase()) || COLOR_PALETTE[2];
      return (
        <div className="rv-preview-card" style={{ borderLeft: `4px solid ${color.hex}` }}>
          <div className="rv-badge-header">
            <span className="rv-pill" style={{ background: color.bg, color: color.text }}>
              <Icons.Boxes size={12} /> {config.module || "Component"}
            </span>
            <span className="rv-owner"><Icons.UserCheck size={12} /> {config.lead || "Lead"}</span>
          </div>
          <h4 style={{ margin: "6px 0", fontSize: "14px" }}>{item.name || "Component Name"}</h4>
          <code style={{ fontSize: "10px", background: "var(--surface-subtle)", padding: "2px 6px", borderRadius: "4px" }}>{config.repository || "src/"}</code>
        </div>
      );
    }

    case "release": {
      const pct = Math.max(0, Math.min(100, Number(config.progress || 0)));
      const isGA = config.status === "Released GA";
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <span className={`rv-pill ${isGA ? "green" : "purple"}`}>
              <Icons.Rocket size={12} /> {config.version || "v1.0.0"}
            </span>
            <span className="rv-pill gray">{config.status || "Unreleased"}</span>
          </div>
          <h4 style={{ margin: "8px 0 4px", fontSize: "14px" }}>{item.name || "Release Name"}</h4>
          <div className="rv-dates" style={{ fontSize: "11px", color: "var(--muted)", marginBottom: "8px" }}>
            <Icons.Calendar size={12} style={{ display: "inline", marginRight: "4px" }} />
            {config.startDate || "N/A"} to {config.releaseDate || "Target Date"}
          </div>
          <div className="rv-progress-wrap">
            <div className="rv-progress-text">
              <span>Readiness</span>
              <b>{pct}%</b>
            </div>
            <div className="rv-progress-bar">
              <div className="rv-progress-fill" style={{ width: `${pct}%`, background: pct >= 80 ? "#10b981" : "#6366f1" }} />
            </div>
          </div>
        </div>
      );
    }

    case "issue-type": {
      const color = COLOR_PALETTE.find((c) => c.label.toLowerCase() === (config.color || "crimson").toLowerCase()) || COLOR_PALETTE[8];
      return (
        <div className="rv-preview-card" style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ width: "38px", height: "38px", borderRadius: "10px", background: color.bg, color: color.text, display: "grid", placeItems: "center" }}>
            <Icons.TicketCheck size={20} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: "14px" }}>{item.name || "Ticket Type"}</h4>
            <span style={{ fontSize: "11px", color: "var(--muted)" }}>{config.hierarchy || "Level 0"}</span>
          </div>
        </div>
      );
    }

    case "priority": {
      const color = COLOR_PALETTE.find((c) => c.label.toLowerCase() === (config.color || "orange").toLowerCase()) || COLOR_PALETTE[7];
      return (
        <div className="rv-preview-card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ width: "24px", height: "24px", borderRadius: "6px", background: color.bg, color: color.text, display: "grid", placeItems: "center" }}>
              <Icons.ChevronUp size={16} />
            </span>
            <div>
              <b style={{ fontSize: "13px", color: color.text }}>{config.level || item.name || "Priority"}</b>
              <div style={{ fontSize: "10px", color: "var(--muted)" }}>{item.description || "Severity level"}</div>
            </div>
          </div>
          {config.slaHours && (
            <span className="rv-pill gray" style={{ fontSize: "11px" }}>
              <Icons.Clock size={11} /> {config.slaHours}h SLA
            </span>
          )}
        </div>
      );
    }

    case "workflow": {
      const statuses = (config.statuses || "To Do, In Progress, Done").split(",").map((s: string) => s.trim());
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <b><Icons.GitBranch size={13} /> {item.name || "Workflow Pipeline"}</b>
            <span className="rv-pill blue">{statuses.length} Steps</span>
          </div>
          <div className="rv-flow-nodes" style={{ display: "flex", gap: "6px", overflowX: "auto", margin: "10px 0 4px", paddingBottom: "4px" }}>
            {statuses.map((st: string, idx: number) => (
              <React.Fragment key={st}>
                <span className="rv-flow-step" style={{ padding: "4px 8px", borderRadius: "6px", background: "var(--surface-subtle)", fontSize: "11px", border: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                  {st}
                </span>
                {idx < statuses.length - 1 && <span style={{ color: "var(--muted)", alignSelf: "center", fontSize: "10px" }}>➔</span>}
              </React.Fragment>
            ))}
          </div>
        </div>
      );
    }

    case "custom-field": {
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header" style={{ marginBottom: "6px" }}>
            <span className="rv-pill purple">{config.fieldType || "Input Field"}</span>
            {config.required === "Yes" && <span className="rv-pill red">Required</span>}
          </div>
          <label style={{ fontSize: "12px", fontWeight: 600, display: "block", marginBottom: "4px" }}>
            {item.name || "Custom Field Name"}
          </label>
          {config.fieldType === "Dropdown Select" ? (
            <select disabled style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", background: "var(--surface-subtle)" }}>
              <option>{config.placeholder || "Select option..."}</option>
            </select>
          ) : (
            <input disabled placeholder={config.placeholder || "Sample input..."} style={{ width: "100%", padding: "6px 8px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "12px", background: "var(--surface-subtle)" }} />
          )}
        </div>
      );
    }

    case "template": {
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header" style={{ marginBottom: "6px" }}>
            <span className="rv-pill blue">{config.issueType || "Ticket"} Template</span>
            <span className="rv-pill gray">{config.defaultPriority || "Priority"}</span>
          </div>
          <h4 style={{ margin: "4px 0", fontSize: "13px" }}>{item.name || "Template Name"}</h4>
          <div style={{ fontSize: "11px", background: "var(--surface-subtle)", padding: "8px", borderRadius: "6px", border: "1px dashed var(--border)", maxHeight: "70px", overflow: "hidden" }}>
            <code>{config.summaryTemplate || "[Summary Pattern]"}</code>
          </div>
        </div>
      );
    }

    case "board": {
      const cols = (config.columns || "To Do, In Progress, Done").split(",").map((c: string) => c.trim());
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header" style={{ marginBottom: "8px" }}>
            <b><Icons.Columns3 size={13} /> {item.name || "Board View"}</b>
            <span className="rv-pill purple">{config.boardType || "Kanban"}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(4, cols.length)}, 1fr)`, gap: "6px" }}>
            {cols.slice(0, 4).map((col: string) => (
              <div key={col} style={{ background: "var(--surface-subtle)", padding: "6px", borderRadius: "6px", fontSize: "10px", textAlign: "center" }}>
                <b style={{ display: "block", marginBottom: "4px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>{col}</b>
                <div style={{ background: "var(--surface)", height: "20px", borderRadius: "4px", border: "1px solid var(--border)" }} />
              </div>
            ))}
          </div>
        </div>
      );
    }

    case "milestone": {
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <span className="rv-pill emerald"><Icons.Flag size={12} /> Milestone</span>
            <span className="rv-pill gray">{config.status || "Target"}</span>
          </div>
          <h4 style={{ margin: "6px 0 4px", fontSize: "14px" }}>{item.name || "Milestone Target"}</h4>
          <div style={{ fontSize: "11px", color: "var(--muted)" }}>
            Deadline: <b>{config.targetDate || "Date TBD"}</b> • Lead: <b>{config.owner || "Unassigned"}</b>
          </div>
        </div>
      );
    }

    case "automation-rule": {
      const active = config.active !== "Paused";
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <b style={{ fontSize: "13px" }}><Icons.Zap size={13} style={{ color: active ? "#f59e0b" : "var(--muted)" }} /> {item.name || "Automation Rule"}</b>
            <span className={`rv-pill ${active ? "green" : "gray"}`}>{active ? "Active" : "Paused"}</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "11px", margin: "8px 0 2px" }}>
            <span className="rv-pill blue">⚡ {config.trigger || "Trigger"}</span>
            <span>➔</span>
            <span className="rv-pill purple">⚙️ {config.action || "Action"}</span>
          </div>
        </div>
      );
    }

    case "notification-rule": {
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <b><Icons.BellRing size={13} /> {item.name || "Notification Rule"}</b>
            <span className="rv-pill cyan">{config.channel || "Channel"}</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", marginTop: "6px" }}>
            Event: <b>{config.event || "ticket.created"}</b> ➔ Audience: <b>{config.recipients || "Assignee"}</b>
          </div>
        </div>
      );
    }

    case "permission-scheme": {
      const roles = (config.roles || "admin, engineer").split(",").map((r: string) => r.trim());
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <b><Icons.KeyRound size={13} /> {item.name || "Permission Scheme"}</b>
            <span className="rv-pill gray">{config.scope || "Workspace"}</span>
          </div>
          <div style={{ display: "flex", gap: "4px", flexWrap: "wrap", marginTop: "6px" }}>
            {roles.map((r: string) => (
              <span key={r} className="rv-pill blue" style={{ fontSize: "10px" }}>{r}</span>
            ))}
          </div>
        </div>
      );
    }

    case "saved-filter": {
      return (
        <div className="rv-preview-card">
          <div className="rv-badge-header">
            <b><Icons.ListFilter size={13} /> {item.name || "Saved Search Queue"}</b>
            <span className="rv-pill green">Filter Queue</span>
          </div>
          <div style={{ fontSize: "11px", color: "var(--muted)", margin: "6px 0 0" }}>
            Query: <code>{config.query || "all"}</code> • Filter: <b>{config.filter || "open"}</b>
          </div>
        </div>
      );
    }

    default:
      return (
        <div className="rv-preview-card">
          <h4>{item.name}</h4>
          <p>{item.description}</p>
        </div>
      );
  }
}

interface VisualModalProps {
  kind: ResourceKind;
  initialData?: ResourceItem | null;
  onSave: (data: { name: string; description: string; key?: string; config: Record<string, string> }) => Promise<void>;
  onClose: () => void;
}

export function ResourceVisualModal({ kind, initialData, onSave, onClose }: VisualModalProps) {
  const featureConfig = ALL_RESOURCE_FEATURE_CONFIG[kind];
  const [name, setName] = useState(initialData?.name || "");
  const [description, setDescription] = useState(initialData?.description || "");
  const [key, setKey] = useState(initialData?.key || "");
  const [config, setConfig] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    featureConfig.fields.forEach((f) => {
      initial[f.key] = String(initialData?.config?.[f.key] ?? f.initial ?? "");
    });
    return initial;
  });

  const [saving, setSaving] = useState(false);

  const applyPreset = (preset: (typeof featureConfig.presets)[0]) => {
    setName(preset.name);
    setDescription(preset.description);
    if (preset.key) setKey(preset.key);
    setConfig({ ...preset.config });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), description: description.trim(), key: key.trim() || undefined, config });
      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const kindTitle = kind
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

  return (
    <ModalOverlay onClose={onClose} ariaLabel={`${initialData ? "Edit" : "Create"} ${kindTitle}`}>
      <div className="card rv-modal-card">
        <form onSubmit={handleSubmit} style={{ overflowY: "auto", paddingRight: "8px", display: "flex", flexDirection: "column", gap: "12px", minHeight: 0 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: "18px" }}>{initialData ? "Edit" : "Create"} {kindTitle}</h3>
            <p style={{ margin: 0, fontSize: "12px", color: "var(--muted)" }}>{featureConfig.description}</p>
          </div>

          {featureConfig.presets.length > 0 && (
            <div className="rv-presets-section">
              <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--muted)", textTransform: "uppercase" }}>Quick Presets:</span>
              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "4px" }}>
                {featureConfig.presets.map((p) => (
                  <button key={p.name} type="button" className="btn sm outline" onClick={() => applyPreset(p)} style={{ fontSize: "11px" }}>
                    + {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <label className="field">
            <span>Resource Name *</span>
            <input required value={name} onChange={(e) => setName(e.target.value)} placeholder={`e.g. ${featureConfig.presets[0]?.name || kind}`} />
          </label>

          <label className="field">
            <span>Key / Identifier (Optional)</span>
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. RES-01" />
          </label>

          <label className="field">
            <span>Description</span>
            <textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Usage details or scope notes..." />
          </label>

          <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", display: "grid", gap: "12px" }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>Configuration Attributes</span>
            {featureConfig.fields.map((field) => (
              <div key={field.key} className="field">
                {field.type === "select" ? (
                  <label>
                    <span>{field.label}</span>
                    <select value={config[field.key] || ""} onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })}>
                      {field.options?.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </label>
                ) : field.type === "textarea" ? (
                  <label>
                    <span>{field.label}</span>
                    <textarea rows={3} value={config[field.key] || ""} onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })} />
                  </label>
                ) : field.type === "date" ? (
                  <MiniDatePicker
                    name={field.key}
                    label={field.label}
                    value={config[field.key] || ""}
                    onChange={(val) => setConfig({ ...config, [field.key]: val })}
                  />
                ) : (
                  <label>
                    <span>{field.label}</span>
                    <input type={field.type || "text"} value={config[field.key] || ""} onChange={(e) => setConfig({ ...config, [field.key]: e.target.value })} />
                  </label>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginTop: "auto", paddingTop: "12px", paddingBottom: "4px", display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid var(--border)", position: "sticky", bottom: 0, background: "var(--surface)", zIndex: 10 }}>
            <button type="button" className="btn outline" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn primary" disabled={saving}>{saving ? "Saving..." : initialData ? "Save Changes" : "Create Resource"}</button>
          </div>
        </form>

        <div style={{ background: "var(--surface-subtle)", borderRadius: "10px", padding: "16px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", minHeight: 0, position: "relative" }}>
          <button
            type="button"
            className="icon-btn modal-close"
            onClick={onClose}
            aria-label="Close modal"
            style={{ position: "absolute", top: "12px", right: "12px", zIndex: 20 }}
          >
            <Icons.X size={16} />
          </button>
          <h4 style={{ margin: "0 0 12px", fontSize: "13px", color: "var(--muted)", textTransform: "uppercase" }}>Live Preview</h4>
          <ResourceVisualPreview kind={kind} item={{ name, description, key, config }} />
          <div style={{ marginTop: "auto", fontSize: "11px", color: "var(--muted)", padding: "10px", background: "var(--surface)", borderRadius: "6px", border: "1px solid var(--border)" }}>
            <Icons.Info size={13} style={{ display: "inline", marginRight: "4px" }} />
            This configuration is saved live in your workspace state and can be referenced across all project boards.
          </div>
        </div>
      </div>
    </ModalOverlay>
  );
}
