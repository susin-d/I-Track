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
