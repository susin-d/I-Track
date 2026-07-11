import { z } from "zod";
import {
  priorityLevels,
  projectStatuses,
  sprintStatuses,
  ticketStatuses,
  userRoles,
} from "../constants/workflow.js";

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

export const ticketSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(5),
  acceptanceCriteria: z.array(z.string()).default([]),
  status: z.enum(ticketStatuses).default("Backlog"),
  priority: z.enum(priorityLevels).default("medium"),
  storyPoints: z.number().int().min(1).max(21),
  assignee: z.string(),
  project: z.string(),
  sprint: z.string(),
  epic: z.string().min(2).default("Product backlog"),
  labels: z.array(z.string()).default([]),
  dueDate: z.coerce.date(),
  blocked: z.boolean().default(false),
  dependencies: z.array(z.string()).default([]),
});

export const teamSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  role: z.enum(userRoles).default("engineer"),
  skills: z.array(z.string()).default(["Planning"]),
  availability: z.number().min(0).max(1).default(1),
  capacity: z.number().min(0).default(30),
  avatarColor: z.string().default("#00AEEF"),
});

export const settingsSchema = z.object({
  riskThreshold: z.number().min(0).max(100),
  sprintLengthDays: z.number().min(1).max(60),
  timezone: z.string().min(2),
  aiEnabled: z.boolean(),
});
