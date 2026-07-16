import { catalogEndpointFor } from "./aiAccess.js";

export type AiMutationContract = {
  endpoint: string;
  body: string;
  prerequisites?: string;
};

const noBody = "No request body.";

const contracts: Record<string, Omit<AiMutationContract, "endpoint">> = {
  "POST /auth/register": { body: "{ name: string (min 2), email: valid email, password: string (min 8) }" },
  "POST /auth/login": { body: "{ email: valid email, password: string (min 8), organizationId?: string }" },
  "POST /auth/refresh": { body: "{ refreshToken: string (min 20) }" },
  "POST /auth/logout": { body: "{ refreshToken?: string }" },
  "POST /auth/forgot-password": { body: "{ email: valid email }" },
  "POST /auth/reset-password": { body: "{ token: string (min 20), password: string (min 8) }" },
  "POST /auth/change-password": { body: "{ currentPassword: string, newPassword: string (min 8) }" },
  "PATCH /auth/preferences": { body: "{ notificationPreferences: { ticketAssignments: boolean, mentionsAndComments: boolean, sprintRiskAlerts: boolean, weeklySummary: boolean } }" },
  "POST /auth/accept-invite": { body: "Existing account: { invitationId: string }. New account: { token: string (min 20), name: string (min 2), password: string (min 8) }." },
  "POST /workspaces": { body: "{ name: string (min 2) }" },
  "POST /workspaces/:id/switch": { body: "{ refreshToken?: string }", prerequisites: "Use a workspace membership id returned by GET /workspaces." },
  "PATCH /users/:id": { body: "Any subset of { name: string (min 2), role: admin|manager|engineer|designer, skills: string[], availability: number 0..1, capacity: number >= 0, avatarColor: string }", prerequisites: "Use a user id returned by GET /users." },
  "POST /invitations": { body: "{ name: string (min 2), email: valid email, role?: admin|manager|engineer|designer (default engineer), capacity?: number >= 0 (default 32) }" },
  "POST /projects": { body: "{ key: string (2..12), name: string (min 2), description: string (min 5), status?: planning|active|paused|done, progress?: number 0..100, riskLevel?: low|medium|high|critical, activeSprint?: string, members?: string[] }" },
  "PATCH /projects/:id": { body: "Any subset of POST /projects fields.", prerequisites: "Use a project id returned by GET /projects. Member ids must belong to the workspace." },
  "PUT /projects/:id/members": { body: "{ userIds: string[] }", prerequisites: "Use a project id from GET /projects and active user ids from GET /users." },
  "POST /sprints": { body: "{ name: string (min 2), project: string id, status?: planned|active|completed, startDate: valid date, endDate: valid date, capacity: number >= 0, plannedPoints: number >= 0, completedPoints?: number >= 0, velocityHistory?: number[], riskScore?: number 0..100 }", prerequisites: "Use a project id returned by GET /projects." },
  "PATCH /sprints/:id": { body: "Any subset of POST /sprints fields.", prerequisites: "Use a sprint id returned by GET /sprints." },
  "POST /sprints/:id/complete": { body: "{ moveIncompleteToSprint?: string }", prerequisites: "Use sprint ids returned by GET /sprints." },
  "POST /cycles": { body: "{ name: string (min 2), goal?: string, status?: planned|active|completed, startDate: valid date, endDate: valid date, sprints?: string[] }", prerequisites: "Every sprint id must come from GET /sprints." },
  "PATCH /cycles/:id": { body: "Any subset of POST /cycles fields.", prerequisites: "Use a cycle id returned by GET /cycles." },
  "POST /tickets": { body: "{ title: string (min 3), description: string (min 5), storyPoints: integer 1..21, project: string id, sprint: string id, assignee: string id, dueDate: valid date, status?: Backlog|To Do|In Progress|In Review|Done, priority?: low|medium|high|critical, acceptanceCriteria?: string[], epic?: string (min 2), labels?: string[], blocked?: boolean, dependencies?: string[] }", prerequisites: "GET /dashboard first. Use real _id values for project, sprint, and assignee; never invent ids." },
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
  "POST /tickets/:id/attachments": { body: "{ name: string (min 1), url: valid URL, mimeType?: string, size?: non-negative integer }" },
  "POST /resources/:kind": { body: "{ name: string (min 1), project?: string id, key?: string, description?: string, status?: string, order?: number, config?: object }. kind must be epic|label|component|release|issue-type|priority|workflow|custom-field|template|board|milestone|automation-rule|notification-rule|permission-scheme|saved-filter.", prerequisites: "project must belong to the workspace." },
  "PATCH /resources/:kind/:id": { body: "Resource fields to update as a JSON object.", prerequisites: "Use kind and id returned by GET /resources/:kind." },
  "POST /integrations/:kind": { body: "{ name: string (min 1), url?: valid URL, events?: string[] }; kind must be api-token or webhook." },
  "PATCH /settings": { body: "{ riskThreshold: number 0..100, sprintLengthDays: integer 1..60, weeklyCapacityHours?: number 1..168, timezone: string (min 2), aiEnabled: boolean, slaPolicy?: SLA policy object }", prerequisites: "GET /settings first and send the complete settings object." },
  "PATCH /sla/policy": { body: "{ critical: { firstResponseHours: number 0.25..8760, resolutionHours: number 0.25..8760 }, high: same, medium: same, low: same }" },
  "PATCH /organization": { body: "At least one of { name?: string (min 2), plan?: starter|scale|enterprise }" },
  "DELETE /organization": { body: "{ confirmationName: exact current organization name }", prerequisites: "GET /auth/me first and require explicit user confirmation." },
  "POST /import/resources": { body: "{ resources: Array (max 1000) of { kind: valid resource kind, name: string (min 1), project?: string id, key?: string, description?: string, status?: string, order?: number, config?: object } }" },
  "POST /analysis/sprint-risk": { body: "{ plannedPoints: number, capacity: number, blockedTickets: number, totalTickets: number, workload: number, focusLoad: number, requiredSkills: number, coveredSkills: number, velocityHistory: number[] }" },
  "POST /ai/generate-tickets": { body: "{ prompt: detailed string (min 20), model?: provider model id }. This creates a plan only and does not save tickets." },
  "POST /ai/confirm-ticket-plan": { body: "{ plan: generated ticket plan, projectId: string, sprintId: string, assigneeId: string }", prerequisites: "Use the unchanged plan returned by POST /ai/generate-tickets and real ids from GET /dashboard." },
};

const noBodyEndpoints = new Set([
  "DELETE /auth/sessions/:id",
  "POST /workspaces/:id/onboarding/complete",
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
]);

export function mutationContractFor(method: string, path: string): AiMutationContract | null {
  const catalog = catalogEndpointFor(method, path);
  if (!catalog || method.toUpperCase() === "GET") return null;
  const contract = contracts[catalog.endpoint];
  if (contract) return { endpoint: catalog.endpoint, ...contract };
  if (noBodyEndpoints.has(catalog.endpoint)) return { endpoint: catalog.endpoint, body: noBody };
  return null;
}

const ticketCreateContract = contracts["POST /tickets"]!;
export const ticketCreateAiGuidance = `${ticketCreateContract.body}\n${ticketCreateContract.prerequisites}`;
