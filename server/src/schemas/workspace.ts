import { z } from "zod";
import { priorityLevels, cycleStatuses, projectStatuses, sprintStatuses, ticketStatuses } from "../constants/workflow.js";

export const projectSchema = z.object({
  key: z.string().min(2).max(12).transform((value) => value.toUpperCase()),
  name: z.string().min(2),
  description: z.string().min(5),
  status: z.enum(projectStatuses).default("active"),
  progress: z.number().min(0).max(100).default(0),
  riskLevel: z.enum(priorityLevels).default("medium"),
  activeSprint: z.string().default("Planning"),
  members: z.array(z.string()).default([]),
});

export const sprintSchema = z.object({
  name: z.string().min(2),
  project: z.string(),
  status: z.enum(sprintStatuses).default("planned"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  capacity: z.number().min(0),
  plannedPoints: z.number().min(0),
  completedPoints: z.number().min(0).default(0),
  velocityHistory: z.array(z.number()).default([]),
  riskScore: z.number().min(0).max(100).default(0),
});

export const cycleSchema = z.object({
  name: z.string().min(2),
  goal: z.string().default(""),
  status: z.enum(cycleStatuses).default("planned"),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  sprints: z.array(z.string()).default([]),
});

export const ticketSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  acceptanceCriteria: z.array(z.string()).default([]),
  acceptanceCriteriaDone: z.array(z.boolean()).default([]),
  status: z.enum(ticketStatuses).default("Backlog"),
  priority: z.enum(priorityLevels).default("medium"),
  issueType: z.string().trim().min(1).refine(
    (value) => value.toLowerCase() !== "epic",
    { message: "Epic is a ticket grouping and cannot be used as a ticket type" },
  ).default("Task"),
  customFields: z.record(z.string(), z.unknown()).default({}),
  storyPoints: z.number().int().min(1).max(21),
  assignee: z.string().optional(),
  project: z.string(),
  sprint: z.string().optional(),
  epic: z.string().trim().refine(
    (value) => value.length === 0 || value.length >= 2,
    { message: "Epic must be empty or contain at least 2 characters" },
  ).default(""),
  labels: z.array(z.string()).default([]),
  dueDate: z.coerce.date(),
  blocked: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
});

export const teamSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.string().min(1).default("engineer"),
  skills: z.array(z.string()).default(["Planning"]),
  availability: z.number().min(0).max(1).default(1),
  capacity: z.number().min(0).default(30),
  avatarColor: z.string().default("#00AEEF"),
});

export const settingsSchema = z.object({
  riskThreshold: z.number().min(0).max(100),
  sprintLengthDays: z.number().min(1).max(60),
  weeklyCapacityHours: z.number().min(1).max(168).default(40),
  timezone: z.string().min(2),
  aiEnabled: z.boolean(),
  slaPolicy: z.object({
    critical: z.object({ firstResponseHours: z.number().min(0.25).max(8760), resolutionHours: z.number().min(0.25).max(8760) }),
    high: z.object({ firstResponseHours: z.number().min(0.25).max(8760), resolutionHours: z.number().min(0.25).max(8760) }),
    medium: z.object({ firstResponseHours: z.number().min(0.25).max(8760), resolutionHours: z.number().min(0.25).max(8760) }),
    low: z.object({ firstResponseHours: z.number().min(0.25).max(8760), resolutionHours: z.number().min(0.25).max(8760) }),
  }).optional(),
});
