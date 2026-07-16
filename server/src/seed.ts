import bcrypt from "bcryptjs";
import { connectDb } from "./config/db.js";
import { postgres } from "./config/postgres.js";
import { Organization } from "./models/Organization.js";
import { Cycle } from "./models/Cycle.js";
import { Project } from "./models/Project.js";
import { Sprint } from "./models/Sprint.js";
import { Ticket } from "./models/Ticket.js";
import { User } from "./models/User.js";
import { Invitation, OrganizationMembership } from "./models/WorkspaceAccess.js";
import { seedUsers, ticketTemplates } from "./data/seedData.js";
import { defaultSlaPolicy, getTicketSlaStatus, slaFieldsForTicket, statusTransition } from "./services/sla.js";

async function seed() {
  await connectDb();
  await postgres.query("TRUNCATE TABLE audit_events, integrations, notifications, action_tokens, sessions, counters, workspace_resources, tickets, cycles, sprints, projects, invitations, organization_memberships, organizations, users RESTART IDENTITY CASCADE");

  const passwordHash = await bcrypt.hash("Password123!", 10);
  const organization = await Organization.create({
    name: "I-TRACK Demo Workspace",
    slug: "itrack-demo",
    plan: "scale",
    settings: {
      riskThreshold: 65,
      sprintLengthDays: 14,
      timezone: "Asia/Calcutta",
      aiEnabled: true,
      slaPolicy: defaultSlaPolicy,
    },
  });
  const users = await User.insertMany(seedUsers.map((user, index) => ({ ...user, role: index === 0 ? "admin" : user.role, organization: organization._id, inviteStatus: "active", passwordHash })));
  organization.owner = users[0]._id;
  organization.onboardingCompletedAt = new Date();
  await organization.save();
  await OrganizationMembership.insertMany(users.map((user, index) => ({ user: user._id, organization: organization._id, role: index === 0 ? "admin" : seedUsers[index].role, status: "active", skills: seedUsers[index].skills, availability: seedUsers[index].availability, capacity: seedUsers[index].capacity })));
  const project = await Project.create({
    organization: organization._id,
    key: "ITR",
    name: "I-TRACK Sprint Intelligence",
    description: "AI-assisted sprint planning with deterministic, explainable delivery intelligence.",
    status: "active",
    progress: 64,
    riskLevel: "high",
    activeSprint: "Sprint 24.7",
    members: users.map((user) => user._id),
  });
  const sprint = await Sprint.create({
    organization: organization._id,
    name: "Sprint 24.7",
    project: project._id,
    status: "active",
    startDate: new Date("2026-07-01"),
    endDate: new Date("2026-07-14"),
    capacity: 118,
    plannedPoints: 142,
    completedPoints: 67,
    velocityHistory: [92, 104, 97, 111, 106],
    riskScore: 73,
  });
  await Cycle.create({
    organization: organization._id,
    name: "Cycle 2026-Q3 Alpha",
    goal: "Ship the first complete sprint intelligence workflow.",
    status: "active",
    startDate: new Date("2026-07-01"),
    endDate: new Date("2026-08-15"),
    sprints: [sprint._id],
  });

  await Ticket.insertMany(
    ticketTemplates.map(([ticketId, title, status, priority, points, blocked, labels], index) => ({
      ...(() => {
        const createdAt = new Date(2026, 6, 1 + index);
        const resolvedAt = status === "Done" ? new Date(2026, 6, 8 + index) : undefined;
        const firstRespondedAt = index % 2 === 0 ? new Date(2026, 6, 2 + index) : undefined;
        const slaFields = slaFieldsForTicket(priority, createdAt, defaultSlaPolicy);
        return {
          ...slaFields,
          firstRespondedAt,
          resolvedAt,
          slaStatus: getTicketSlaStatus({ status, firstRespondedAt, resolvedAt, firstResponseDueAt: slaFields.firstResponseDueAt, resolutionDueAt: slaFields.resolutionDueAt }),
          statusTransitions: [
            statusTransition(undefined, "Backlog", createdAt, String(users[0]._id)),
            ...(status !== "Backlog" ? [statusTransition("Backlog", "In Progress", new Date(2026, 6, 3 + index), String(users[index % users.length]._id))] : []),
            ...(status === "In Review" || status === "Done" ? [statusTransition("In Progress", "In Review", new Date(2026, 6, 6 + index), String(users[index % users.length]._id))] : []),
            ...(status === "Done" ? [statusTransition("In Review", "Done", resolvedAt!, String(users[index % users.length]._id))] : []),
          ],
          createdAt,
          updatedAt: resolvedAt ?? new Date(),
        };
      })(),
      organization: organization._id,
      ticketId,
      title,
      description: `${title} for the I-TRACK intelligence workspace.`,
      acceptanceCriteria: ["Result is explainable", "Keyboard users can complete the flow", "Errors are actionable"],
      status,
      priority,
      storyPoints: points,
      assignee: users[index % users.length]._id,
      reporter: users[0]._id,
      project: project._id,
      sprint: sprint._id,
      epic: "AI Sprint Intelligence v2",
      labels,
      dueDate: new Date(2026, 6, 10 + index),
      blocked,
      dependencies: blocked ? ["ITR-105"] : [],
      comments: [{ author: "Maya Chen", body: "Keep the formula visible in review.", createdAt: new Date() }],
      workLogs: [{ author: users[index % users.length].name, hours: 3 + index, note: "Implementation and review", createdAt: new Date() }],
      history: [{ event: `Moved to ${status}`, createdAt: new Date() }],
    })),
  );

  console.log("Seeded I-TRACK demo data. Login: maya@itrack.dev / Password123!");
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
