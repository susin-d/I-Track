import { aiEndpointsForRole, catalogEndpointFor } from "./aiAccess.js";
import type { Permission } from "./constants/permissions.js";
import type { UserRole } from "./models/User.js";

export type AiMutationContract = {
  endpoint: string;
  body: string;
  prerequisites?: string;
  response?: string;
};

const noBody = "No request body.";

const contracts: Record<string, Omit<AiMutationContract, "endpoint">> = {
  "POST /auth/register": { body: "{ name: string (min 2), email: valid email, password: string (min 8) }", response: "Returns an OTP challenge; verify it with POST /auth/verify-otp before using the session." },
  "POST /auth/login": { body: "{ email: valid email, password: string (min 8), organizationId?: string }", response: "Returns an OTP challenge; verify it with POST /auth/verify-otp before using the session." },
  "POST /auth/verify-otp": { body: "{ email: valid email, otp: 6-digit string, purpose: registration|login }" },
  "POST /auth/resend-otp": { body: "{ email: valid email, purpose: registration|login }" },
  "POST /auth/refresh": { body: "{ refreshToken: string (min 20) }" },
  "POST /auth/logout": { body: "{ refreshToken?: string }" },
  "POST /auth/forgot-password": { body: "{ email: valid email }" },
  "POST /auth/reset-password": { body: "{ token: string (min 20), password: string (min 8) }" },
  "POST /auth/change-password": { body: "{ currentPassword: string, newPassword: string (min 8) }" },
  "PATCH /auth/preferences": { body: "{ notificationPreferences: { ticketAssignments: boolean, mentionsAndComments: boolean, sprintRiskAlerts: boolean, weeklySummary: boolean } }" },
  "POST /auth/accept-invite": { body: "Existing account: { invitationId: string, otp: 6-digit string }. New account: { token: string (min 20), otp: 6-digit string, name: string (min 2), password: string (min 8) }." },
  "POST /workspaces": { body: "{ name: string (min 2) }", prerequisites: "Returns the new workspace id. Call POST /workspaces/:id/switch if you need to perform actions in the new workspace." },
  "POST /workspaces/:id/switch": { body: "{ refreshToken?: string }", prerequisites: "Use the organization/workspace id from a membership returned by GET /workspaces; do not use the membership record id." },
  "POST /workspaces/:id/onboarding/complete": { body: noBody, prerequisites: "Must switch to this workspace (POST /workspaces/:id/switch) and create at least one project (POST /projects) in it before completing onboarding." },
  "POST /companies/:companyId/workspaces": { body: "{ name: string (min 2), slug?: lowercase letters, numbers, and hyphens }", prerequisites: "Use a company id returned by GET /companies. The server generates a unique slug when slug is omitted." },
  "POST /companies/:companyId/groups": { body: "{ name: string (min 2), description?: string }", prerequisites: "Use a company id returned by GET /companies." },
  "PATCH /companies/:companyId/groups/:id": { body: "Any subset of { name?: string (min 2), description?: string }", prerequisites: "Use the company id and group id returned by GET /companies/:companyId/groups." },
  "PUT /companies/:companyId/groups/:id/members": { body: "{ userIds: string[] }", prerequisites: "Read GET /companies/:companyId/members and GET /companies/:companyId/groups first. Every user id must belong to the organization; the supplied array replaces the full group membership." },
  "PUT /companies/:companyId/groups/:id/workspaces": { body: "{ grants: Array<{ workspace: string, role: workspace role slug }> }", prerequisites: "Read the organization's groups and workspaces first. Every workspace id and role slug must belong to the organization; the supplied array replaces all workspace grants for the group." },
  "POST /roles": { body: "{ name: string (min 2), description?: string, permissions: permission keys[] }", prerequisites: "Read GET /roles first. The role is created for the current workspace." },
  "PATCH /roles/:id": { body: "Any subset of { name?: string (min 2), description?: string, permissions?: permission keys[], rank?: number 1..99 }", prerequisites: "Use a role id returned by GET /roles. The Administrator role cannot be reduced." },
  "POST /team": { body: "{ name: string (min 2), email: valid email, role: workspace role slug, skills: string[], availability: number 0..1, capacity: number >= 0, avatarColor: string }", prerequisites: "Use a role slug returned by GET /roles. Note: there is no POST /users endpoint; use POST /team or POST /invitations to create workspace users." },
  "PATCH /users/:id": { body: "Any subset of { name: string (min 2), role: workspace role slug, skills: string[], availability: number 0..1, capacity: number >= 0, avatarColor: string }", prerequisites: "Use a user id returned by GET /users and a role slug returned by GET /roles." },
  "POST /invitations": { body: "{ name: string (min 2), email: valid email, role?: workspace role slug (default engineer), capacity?: number >= 0 (default 32) }", prerequisites: "Use a role slug returned by GET /roles." },
  "POST /projects": { body: "{ key: string (2..12), name: string (min 2), description: string (min 5), status?: planning|active|paused|done, progress?: number 0..100, riskLevel?: low|medium|high|critical, activeSprint?: string, members?: string[] }" },
  "PATCH /projects/:id": { body: "Any subset of POST /projects fields.", prerequisites: "Use a project id returned by GET /projects. Member ids must belong to the workspace." },
  "PUT /projects/:id/members": { body: "{ userIds: string[] }", prerequisites: "Use a project id from GET /projects and active user ids from GET /users." },
  "POST /sprints": { body: "{ name: string (min 2), project: string id, status?: planned|active|completed, startDate: valid date, endDate: valid date, capacity: number >= 0, plannedPoints: number >= 0, completedPoints?: number >= 0, velocityHistory?: number[], riskScore?: number 0..100 }", prerequisites: "Use a project id returned by GET /projects." },
  "PATCH /sprints/:id": { body: "Any subset of POST /sprints fields.", prerequisites: "Use a sprint id returned by GET /sprints." },
  "POST /sprints/:id/complete": { body: "{ moveIncompleteToSprint?: string }", prerequisites: "Use sprint ids returned by GET /sprints." },
  "POST /cycles": { body: "{ name: string (min 2), goal?: string, status?: planned|active|completed, startDate: valid date, endDate: valid date, sprints?: string[] }", prerequisites: "Every sprint id must come from GET /sprints." },
  "PATCH /cycles/:id": { body: "Any subset of POST /cycles fields.", prerequisites: "Use a cycle id returned by GET /cycles." },
  "POST /tickets": { body: "{ title: string (min 3), description: string (min 5), storyPoints: integer 1..21, project: string id, sprint: string id, assignee: string id, dueDate: valid date, status?: Backlog|To Do|In Progress|In Review|Done, priority?: low|medium|high|critical, issueType?: Story|Task|Bug|Sub-task|custom ticket type (never Epic), acceptanceCriteria?: string[], epic?: optional epic name (min 2), labels?: string[], blocked?: boolean, dependencies?: string[] }", prerequisites: "GET /dashboard first. Use real _id values for project, sprint, and assignee; never invent ids. Epic is an optional ticket grouping, not a ticket type." },
  "PATCH /tickets/:id": { body: "Any subset of POST /tickets fields.", prerequisites: "Use a ticket _id returned by GET /tickets or GET /dashboard." },
  "POST /tickets/bulk": { body: "{ ids: string[] (min 1), update: { status?: Backlog|To Do|In Progress|In Review|Done, priority?: low|medium|high|critical, assignee?: string, sprint?: string, blocked?: boolean } }", prerequisites: "Use real ids returned by read endpoints." },
  "POST /tickets/:id/assign": { body: "{ assignee: string id | null }", prerequisites: "Use a ticket _id and an active workspace user id." },
  "PATCH /tickets/:id/status": { body: "{ status: Backlog|To Do|In Progress|In Review|Done }" },
  "PATCH /tickets/:id/rank": { body: "{ rank: number, sprint?: string id | null, status?: Backlog|To Do|In Progress|In Review|Done }" },
  "POST /tickets/:id/links": { body: "{ type: blocks|is-blocked-by|relates-to|duplicates, ticket: string id }" },
  "POST /tickets/:id/comments": { body: "{ body: string (min 1) }" },
  "PATCH /tickets/:id/comments/:commentId": { body: "{ body: string (min 1) }" },
  "POST /tickets/:id/work-logs": { body: "{ hours: number 0.25..24, note: string (min 1) }" },
  "PATCH /tickets/:id/work-logs/:logId": { body: "At least one of { hours?: number 0.25..24, note?: string (min 1) }" },
  "PATCH /tickets/:id/dependencies": { body: "{ dependencies: string[] }" },
  "POST /tickets/:id/attachments": { body: "{ name: string (min 1), url?: valid URL, dataUrl?: base64 data URL, mimeType?: string, size?: integer 0..10000000 }. Supply either url or dataUrl." },
  "POST /tickets/:id/attachments/presign": { body: "{ name: string (min 1), mimeType: string, size: integer 1..10000000 }", response: "Returns a signed upload URL and pending attachment id." },
  "POST /tickets/:id/attachments/:attachmentId/complete": { body: "{}", response: "Finalizes a completed direct storage upload." },
  "POST /resources/:kind": { body: "{ name: string (min 1), project?: string id, key?: string, description?: string, status?: string, order?: number, config?: object }. kind must be epic|label|component|release|issue-type|priority|workflow|custom-field|template|board|milestone|automation-rule|notification-rule|permission-scheme|saved-filter.", prerequisites: "project must belong to the workspace." },
  "PATCH /resources/:kind/:id": { body: "Resource fields to update as a JSON object.", prerequisites: "Use kind and id returned by GET /resources/:kind." },
  "POST /integrations/:kind": { body: "{ name: string (min 1), url?: valid URL, events?: string[] }; kind must be api-token or webhook." },
  "POST /integrations/:kind/:id/test": { body: "{}", response: "Returns { ok, status } without returning integration secrets." },
  "PATCH /settings": { body: "{ riskThreshold: number 0..100, sprintLengthDays: integer 1..60, weeklyCapacityHours?: number 1..168, timezone: string (min 2), aiEnabled: boolean, slaPolicy?: SLA policy object }", prerequisites: "GET /settings first and send the complete settings object." },
  "PATCH /sla/policy": { body: "{ critical: { firstResponseHours: number 0.25..8760, resolutionHours: number 0.25..8760 }, high: same, medium: same, low: same }" },
  "PATCH /organization": { body: "At least one of { name?: string (min 2), plan?: starter|scale|enterprise }" },
  "DELETE /organization": { body: "{ confirmationName: exact current organization name, currentPassword: string }", prerequisites: "GET /auth/me first, reauthenticate, and require explicit user confirmation." },
  "POST /import/resources": { body: "{ resources: Array (max 1000) of { kind: valid resource kind, name: string (min 1), project?: string id, key?: string, description?: string, status?: string, order?: number, config?: object } }" },
  "POST /import": { body: "{ organization?: object, users?: export membership records[], projects?: project export[], sprints?: sprint export[], cycles?: cycle export[], tickets?: ticket export[], resources?: resource export[] }", prerequisites: "Use a workspace export generated by GET /export. This operation is admin-only and must be explicitly confirmed; existing users are matched by email and credentials are never imported." },
  "POST /analysis/sprint-risk": { body: "{ plannedPoints: number, capacity: number, blockedTickets: number, totalTickets: number, workload: number, focusLoad: number, requiredSkills: number, coveredSkills: number, velocityHistory: number[] }" },
  "POST /ai/generate-tickets": { body: "{ prompt: detailed string (min 20), model?: provider model id }. This creates a plan only and does not save tickets." },
  "POST /ai/confirm-ticket-plan": { body: "{ plan: generated ticket plan, projectId: string, sprintId: string, assigneeId: string }", prerequisites: "Use the unchanged plan returned by POST /ai/generate-tickets and real ids from GET /dashboard." },
};

const noBodyEndpoints = new Set([
  "DELETE /auth/sessions/:id",
  "POST /users/:id/deactivate",
  "POST /users/:id/reactivate",
  "DELETE /users/:id",
  "POST /invitations/:id/resend",
  "DELETE /invitations/:id",
  "DELETE /projects/:id",
  "POST /projects/:id/archive",
  "POST /projects/:id/restore",
  "DELETE /sprints/:id",
  "POST /sprints/:id/start",
  "POST /sprints/:id/reopen",
  "DELETE /cycles/:id",
  "DELETE /tickets/:id",
  "POST /tickets/:id/archive",
  "POST /tickets/:id/restore",
  "POST /tickets/:id/clone",
  "POST /tickets/:id/watch",
  "DELETE /tickets/:id/watch",
  "DELETE /tickets/:id/comments/:commentId",
  "DELETE /tickets/:id/work-logs/:logId",
  "DELETE /tickets/:id/attachments/:attachmentId",
  "DELETE /resources/:kind/:id",
  "PATCH /notifications/:id/read",
  "POST /notifications/read-all",
  "DELETE /integrations/:kind/:id",
  "DELETE /companies/:companyId/groups/:id",
  "DELETE /roles/:id",
]);

export function mutationContractFor(method: string, path: string): AiMutationContract | null {
  const catalog = catalogEndpointFor(method, path);
  if (!catalog || method.toUpperCase() === "GET") return null;
  const contract = contracts[catalog.endpoint];
  if (contract) return { endpoint: catalog.endpoint, ...contract };
  if (noBodyEndpoints.has(catalog.endpoint)) return { endpoint: catalog.endpoint, body: noBody };
  return null;
}

export function mutationContractGuidanceForRole(role: UserRole, permissions: Permission[] = []) {
  const seen = new Set<string>();
  return aiEndpointsForRole(role, permissions)
    .filter((endpoint) => endpoint.method !== "GET")
    .flatMap((endpoint) => {
      const contract = mutationContractFor(endpoint.method, endpoint.path);
      if (!contract || seen.has(contract.endpoint)) return [];
      seen.add(contract.endpoint);
      return [`- ${contract.endpoint}: ${contract.body}${contract.prerequisites ? ` Prerequisite: ${contract.prerequisites}` : ""}`];
    })
    .join("\n");
}

const ticketCreateContract = contracts["POST /tickets"]!;
export const ticketCreateAiGuidance = `${ticketCreateContract.body}\n${ticketCreateContract.prerequisites}`;
