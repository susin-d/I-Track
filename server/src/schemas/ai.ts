import { z } from "zod";

export const generatedTicketSchema = z.object({
  epic: z.object({
    title: z.string().min(3),
    description: z.string().min(10),
  }),
  stories: z.array(
    z.object({
      title: z.string().min(3),
      description: z.string().min(10),
      acceptanceCriteria: z.array(z.string().min(3)),
      priority: z.enum(["low", "medium", "high", "critical"]),
      storyPoints: z.number().int().min(1).max(13),
      labels: z.array(z.string()),
      tasks: z.array(
        z.object({
          title: z.string().min(3),
          description: z.string().min(5),
          storyPoints: z.number().int().min(1).max(13),
          dependencies: z.array(z.string()),
        }),
      ),
    }),
  ),
});

export type GeneratedTicketPlan = z.infer<typeof generatedTicketSchema>;

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value !== "string") return value;
  return value
    .split(/\r?\n|;|(?<=[.!?])\s+/)
    .map((item) => item.replace(/^[-*\d.)\s]+/, "").trim())
    .filter(Boolean);
}

function priority(value: unknown) {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  const aliases: Record<string, string> = {
    p0: "critical",
    urgent: "critical",
    highest: "critical",
    p1: "high",
    major: "high",
    p2: "medium",
    normal: "medium",
    p3: "low",
    minor: "low",
  };
  return aliases[normalized] ?? normalized;
}

function points(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : value;
  }
  return value;
}

export function normalizeGeneratedTicketPlan(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const plan = value as Record<string, unknown>;
  const stories = Array.isArray(plan.stories)
    ? plan.stories.map((rawStory) => {
        if (!rawStory || typeof rawStory !== "object") return rawStory;
        const story = rawStory as Record<string, unknown>;
        const tasks = Array.isArray(story.tasks)
          ? story.tasks.map((rawTask) => {
              if (!rawTask || typeof rawTask !== "object") return rawTask;
              const task = rawTask as Record<string, unknown>;
              return {
                ...task,
                storyPoints: points(task.storyPoints),
                dependencies: stringArray(task.dependencies),
              };
            })
          : story.tasks;
        return {
          ...story,
          acceptanceCriteria: stringArray(story.acceptanceCriteria),
          priority: priority(story.priority),
          storyPoints: points(story.storyPoints),
          labels: stringArray(story.labels),
          tasks,
        };
      })
    : plan.stories;
  return { ...plan, stories };
}
