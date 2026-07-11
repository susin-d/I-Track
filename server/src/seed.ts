import bcrypt from "bcryptjs";
import { connectDb } from "./config/db.js";
import { Organization } from "./models/Organization.js";
import { Project } from "./models/Project.js";
import { Sprint } from "./models/Sprint.js";
import { Ticket } from "./models/Ticket.js";
import { User } from "./models/User.js";
import { seedUsers, ticketTemplates } from "./data/seedData.js";

async function seed() {
  await connectDb();
  await Promise.all([Organization.deleteMany({}), User.deleteMany({}), Project.deleteMany({}), Sprint.deleteMany({}), Ticket.deleteMany({})]);

  const passwordHash = await bcrypt.hash("Password123!", 10);
  const organization = await Organization.create({
    name: "I-TRACK Demo Workspace",
    slug: "itrack-demo",
    plan: "scale",
  });
  const users = await User.insertMany(seedUsers.map((user, index) => ({ ...user, role: index === 0 ? "admin" : user.role, organization: organization._id, inviteStatus: "active", passwordHash })));
  organization.owner = users[0]._id;
  await organization.save();
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

  await Ticket.insertMany(
    ticketTemplates.map(([ticketId, title, status, priority, points, blocked, labels], index) => ({
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
