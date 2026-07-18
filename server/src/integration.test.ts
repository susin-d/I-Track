import assert from "node:assert/strict";
import { once } from "node:events";
import crypto from "node:crypto";
import test from "node:test";

const integrationUrl = process.env.INTEGRATION_DATABASE_URL;
const isLocalDatabase = (() => {
  if (!integrationUrl) return false;
  try {
    return ["localhost", "127.0.0.1", "::1"].includes(new URL(integrationUrl).hostname);
  } catch {
    return false;
  }
})();
const integrationEnabled = process.env.RUN_DB_INTEGRATION_TESTS === "1"
  && Boolean(integrationUrl)
  && (isLocalDatabase || process.env.ALLOW_REMOTE_INTEGRATION === "1");
const skipReason = !integrationUrl
  ? "Set RUN_DB_INTEGRATION_TESTS=1 and INTEGRATION_DATABASE_URL to run PostgreSQL integration tests"
  : !isLocalDatabase && process.env.ALLOW_REMOTE_INTEGRATION !== "1"
    ? "Integration database is remote; set ALLOW_REMOTE_INTEGRATION=1 only for a disposable test database"
    : undefined;

type JsonResponse = { response: Response; body: any };

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

test("authenticated PostgreSQL workspace flow", { skip: integrationEnabled ? false : skipReason }, async () => {
  process.env.DATABASE_URL = integrationUrl!;
  process.env.SUPABASE_DATABASE_URL = "";
  process.env.SMTP_HOST = "";
  process.env.NODE_ENV = "test";
  process.env.JWT_SECRET = process.env.JWT_SECRET || "integration-test-secret-change-me";

  const { connectDb } = await import("./config/db.js");
  await connectDb();
  const { postgres } = await import("./config/postgres.js");
  const { createApp } = await import("./app.js");
  const { Organization } = await import("./models/Organization.js");
  const { Company, CompanyMembership } = await import("./models/Company.js");
  const { Project } = await import("./models/Project.js");
  const { Sprint } = await import("./models/Sprint.js");
  const { Ticket } = await import("./models/Ticket.js");
  const { User } = await import("./models/User.js");
  const { Invitation } = await import("./models/WorkspaceAccess.js");
  const bcrypt = (await import("bcryptjs")).default;

  const suffix = crypto.randomBytes(5).toString("hex");
  const password = "IntegrationPassword123!";
  const email = `integration-${suffix}@example.test`;
  const organizationName = `Integration Workspace ${suffix}`;
  let userId: string | undefined;
  let organizationId: string | undefined;
  let companyId: string | undefined;
  let httpServer: ReturnType<ReturnType<typeof createApp>["listen"]> | undefined;

  const cleanup = async () => {
    if (organizationId) {
      await postgres.query("UPDATE users SET last_active_organization = NULL WHERE last_active_organization = $1", [organizationId]);
      await postgres.query("UPDATE organizations SET owner = NULL WHERE id = $1", [organizationId]);
      const tables = ["sessions", "action_tokens", "notifications", "audit_events", "integrations", "counters", "workspace_resources", "tickets", "cycles", "sprints", "projects", "organization_memberships", "invitations"];
      for (const table of tables) await postgres.query(`DELETE FROM "${table}" WHERE organization = $1`, [organizationId]);
      await postgres.query("DELETE FROM organizations WHERE id = $1", [organizationId]);
    }
    if (companyId) {
      await postgres.query("DELETE FROM companies WHERE id = $1", [companyId]);
    }
    if (userId) {
      await postgres.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
      await postgres.query("DELETE FROM action_tokens WHERE user_id = $1", [userId]);
      await postgres.query("DELETE FROM users WHERE id = $1", [userId]);
    }
  };

  try {
    const user = await User.create({ name: "Integration Admin", email, passwordHash: await bcrypt.hash(password, 4) });
    userId = String(user._id);
    const company = await Company.create({ name: organizationName, slug: `integration-company-${suffix}`, owner: user._id });
    companyId = String(company._id);
    const organization = await Organization.create({ company: company._id, name: organizationName, slug: `integration-${suffix}`, plan: "starter", owner: user._id, onboardingCompletedAt: new Date() });
    organizationId = String(organization._id);
    user.lastActiveOrganization = organization._id;
    await user.save();
    await (await import("./models/WorkspaceAccess.js")).OrganizationMembership.create({ user: user._id, organization: organization._id, role: "admin", status: "active", skills: [], availability: 1, capacity: 32 });
    await CompanyMembership.create({ company: company._id, user: user._id, role: "admin", status: "active" });
    const project = await Project.create({ organization: organization._id, key: `ITG${suffix.slice(0, 4).toUpperCase()}`, name: "Integration Project", status: "active", progress: 0, riskLevel: "low", members: [user._id] });
    const sprint = await Sprint.create({ organization: organization._id, name: "Integration Sprint", project: project._id, status: "active", startDate: new Date(Date.now() - 86400_000), endDate: new Date(Date.now() + 13 * 86400_000), capacity: 32, plannedPoints: 3, completedPoints: 0, velocityHistory: [], riskScore: 0 });
    const ticket = await Ticket.create({ organization: organization._id, ticketId: `${project.key}-101`, title: "Integration ticket", description: "A ticket for authenticated flow coverage", status: "Backlog", priority: "medium", storyPoints: 3, assignee: user._id, reporter: user._id, project: project._id, sprint: sprint._id, epic: "Integration", labels: [], dependencies: [], issueLinks: [], comments: [], workLogs: [], history: [], statusTransitions: [], watchers: [], attachments: [], slaPolicy: { firstResponseHours: 8, resolutionHours: 72 }, slaStatus: "healthy", rank: 0 });

    const app = createApp();
    httpServer = app.listen(0);
    await once(httpServer, "listening");
    const address = httpServer.address();
    assert.ok(address && typeof address !== "string");
    const baseUrl = `http://127.0.0.1:${address.port}/api/v1`;
    const loginResponse = await fetch(`${baseUrl}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const loginChallenge = await readJson(loginResponse);
    assert.equal(loginResponse.status, 202);
    assert.equal(loginChallenge?.requiresOtp, true);
    const verifyResponse = await fetch(`${baseUrl}/auth/verify-otp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, purpose: "login", otp: loginChallenge.verificationCode }) });
    const session = await readJson(verifyResponse);
    assert.equal(verifyResponse.status, 200);
    assert.equal(typeof session?.token, "string");

    const request = async (path: string, init: RequestInit = {}): Promise<JsonResponse> => {
      const headers = new Headers(init.headers);
      headers.set("Authorization", `Bearer ${session.token}`);
      if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
      const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
      return { response, body: await readJson(response) };
    };

    const dashboard = await request("/dashboard");
    assert.equal(dashboard.response.status, 200);
    const createdGroup = await request(`/companies/${company._id}/groups`, { method: "POST", body: JSON.stringify({ name: "Engineering", description: "Shared product engineering access" }) });
    assert.equal(createdGroup.response.status, 201);
    const groupId = createdGroup.body?.group?._id;
    const groupMembers = await request(`/companies/${company._id}/groups/${groupId}/members`, { method: "PUT", body: JSON.stringify({ userIds: [user._id] }) });
    assert.equal(groupMembers.response.status, 200);
    const groupWorkspaces = await request(`/companies/${company._id}/groups/${groupId}/workspaces`, { method: "PUT", body: JSON.stringify({ grants: [{ workspace: organization._id, role: "engineer" }] }) });
    assert.equal(groupWorkspaces.response.status, 200);
    const groups = await request(`/companies/${company._id}/groups`);
    assert.equal(groups.response.status, 200);
    assert.equal(groups.body?.groups?.[0]?.members?.[0]?.email, email);
    const sla = await request("/sla");
    assert.equal(sla.response.status, 200);
    assert.ok(sla.body?.summary);

    const updatedTicket = await request(`/tickets/${ticket._id}`, { method: "PATCH", body: JSON.stringify({ description: "Updated through the authenticated API" }) });
    assert.equal(updatedTicket.response.status, 200);
    const storedTicket = await Ticket.findById(ticket._id);
    assert.equal(String(storedTicket?.assignee), String(user._id));
    assert.equal(String(storedTicket?.project), String(project._id));
    assert.equal(String(storedTicket?.sprint), String(sprint._id));

    const assignment = await request(`/tickets/${ticket._id}/assign`, { method: "POST", body: JSON.stringify({ assignee: user._id }) });
    assert.equal(assignment.response.status, 200);
    const assignedTicket = await Ticket.findById(ticket._id);
    assert.equal(String(assignedTicket?.assignee), String(user._id));

    const rankedTicket = await request(`/tickets/${ticket._id}/rank`, { method: "PATCH", body: JSON.stringify({ rank: "1000" }) });
    assert.equal(rankedTicket.response.status, 200);
    assert.equal(rankedTicket.body?.ticket?.rank, 1000);

    const completedSprint = await request(`/sprints/${sprint._id}/complete`, { method: "POST", body: JSON.stringify({ moveIncompleteToSprint: null }) });
    assert.equal(completedSprint.response.status, 200);
    assert.equal(completedSprint.body?.sprint?.status, "completed");

    const commentResponse = await request(`/tickets/${ticket._id}/comments`, { method: "POST", body: JSON.stringify({ body: "Initial integration comment" }) });
    assert.equal(commentResponse.response.status, 201);
    const commentId = commentResponse.body?.ticket?.comments?.at(-1)?._id;
    assert.equal(typeof commentId, "string");
    const editedComment = await request(`/tickets/${ticket._id}/comments/${commentId}`, { method: "PATCH", body: JSON.stringify({ body: "Edited integration comment" }) });
    assert.equal(editedComment.response.status, 200);
    const ticketAfterComment = await Ticket.findById(ticket._id);
    assert.equal(ticketAfterComment?.comments?.at(-1)?.body, "Edited integration comment");

    const workLogResponse = await request(`/tickets/${ticket._id}/work-logs`, { method: "POST", body: JSON.stringify({ hours: 1.5, note: "Initial integration work log" }) });
    assert.equal(workLogResponse.response.status, 201);
    const workLogId = workLogResponse.body?.ticket?.workLogs?.at(-1)?._id;
    assert.equal(typeof workLogId, "string");
    const editedWorkLog = await request(`/tickets/${ticket._id}/work-logs/${workLogId}`, { method: "PATCH", body: JSON.stringify({ hours: 2, note: "Edited integration work log" }) });
    assert.equal(editedWorkLog.response.status, 200);
    const ticketAfterWorkLog = await Ticket.findById(ticket._id);
    assert.equal(ticketAfterWorkLog?.workLogs?.at(-1)?.note, "Edited integration work log");

    const invitationResponse = await request("/invitations", { method: "POST", body: JSON.stringify({ name: "Invited Teammate", email: `invite-${suffix}@example.test`, role: "engineer", capacity: 24 }) });
    assert.equal(invitationResponse.response.status, 201);
    const invitationId = invitationResponse.body?.invitation?.id;
    assert.equal(typeof invitationId, "string");
    const resentInvitation = await request(`/invitations/${invitationId}/resend`, { method: "POST" });
    assert.equal(resentInvitation.response.status, 200);
    const cancelledInvitation = await request(`/invitations/${invitationId}`, { method: "DELETE" });
    assert.equal(cancelledInvitation.response.status, 204);
    const storedInvitation = await Invitation.findById(invitationId);
    assert.equal(storedInvitation?.status, "cancelled");

    const deletedOrganization = await request("/organization", { method: "DELETE", body: JSON.stringify({ confirmationName: organizationName, currentPassword: password }) });
    assert.equal(deletedOrganization.response.status, 204);
    assert.equal(await Organization.findById(organization._id), null);
  } finally {
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer!.close((error) => error ? reject(error) : resolve()));
    await cleanup();
    await postgres.end();
  }
});
