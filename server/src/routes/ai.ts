import { Router, type Request } from "express";
import OpenAI from "openai";
import { z } from "zod";
import { aiEndpointsForRole, canRoleAccessAiEndpoint, isConfirmationRequired, normalizeAiPath } from "../aiAccess.js";
import { mutationContractFor } from "../aiContracts.js";
import { env } from "../config/env.js";
import { requireAuth, requireRole, requireWorkspace, type AuthRequest } from "../middleware/auth.js";
import { enforceApiAccess } from "../middleware/access.js";
import { AuditEvent } from "../models/Operational.js";
import { Project } from "../models/Project.js";
import { Sprint } from "../models/Sprint.js";
import { Ticket } from "../models/Ticket.js";
import { User } from "../models/User.js";
import { OrganizationMembership } from "../models/WorkspaceAccess.js";
import { generatedTicketSchema, normalizeGeneratedTicketPlan } from "../schemas/ai.js";

const router = Router();
router.use(requireAuth);
router.use(requireWorkspace);
router.use(enforceApiAccess);

function getClient() {
  if (!env.openaiApiKey) throw new Error("OPENAI_API_KEY is not configured");
  return new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl });
}

function requestOrigin(req: Request) {
  const forwardedHost = req.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || req.get("host");
  if (!host) return `http://127.0.0.1:${env.port}`;

  const forwardedProtocol = req.get("x-forwarded-proto")?.split(",")[0]?.trim();
  return `${forwardedProtocol || req.protocol}://${host}`;
}

function parseJsonPayload(raw: string) {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstObject = trimmed.indexOf("{");
    const lastObject = trimmed.lastIndexOf("}");
    if (firstObject !== -1 && lastObject > firstObject) {
      return JSON.parse(trimmed.slice(firstObject, lastObject + 1));
    }

    throw new Error("AI response did not contain valid JSON");
  }
}

router.get("/endpoints", (req: AuthRequest, res) => {
  return res.json({ endpoints: aiEndpointsForRole(req.user!.role!) });
});

router.post("/execute", async (req: AuthRequest, res) => {
  const parsed = z.object({
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().min(1),
    body: z.unknown().optional(),
    confirmed: z.boolean().default(false),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid AI endpoint execution request", issues: parsed.error.issues });

  const method = parsed.data.method;
  const path = normalizeAiPath(parsed.data.path);
  if (path.startsWith("/ai/execute")) return res.status(400).json({ message: "AI execution cannot call itself" });

  const access = canRoleAccessAiEndpoint(req.user!.role!, method, path);
  if (!access.allowed) {
    return res.status(403).json({
      message: "Your role cannot access this endpoint through AI",
      allowedRoles: access.roles,
    });
  }

  if (isConfirmationRequired(method, path) && !parsed.data.confirmed) {
    return res.status(409).json({
      requiresConfirmation: true,
      action: `${method} ${path}`,
      message: "Confirm this destructive action before AI performs it.",
    });
  }

  const url = new URL(`/api/v1${path}`, requestOrigin(req));
  const response = await fetch(url, {
    method,
    headers: {
      authorization: req.headers.authorization ?? "",
      ...(method === "GET" || method === "DELETE" ? {} : { "content-type": "application/json" }),
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(parsed.data.body ?? {}),
  });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";
  const payload = contentType.includes("application/json") && text ? JSON.parse(text) : text;

  if (method !== "GET") {
    await AuditEvent.create({
      organization: req.user!.organizationId,
      actor: req.user!.userId,
      action: "ai.endpoint_executed",
      metadata: {
        method,
        path,
        endpoint: access.endpoint,
        confirmed: parsed.data.confirmed,
        status: response.status,
      },
    });
  }

  return res.status(response.status).json(payload);
});

router.get("/models", async (_req, res) => {
  try {
    const client = getClient();
    const models = await client.models.list();
    return res.json({ models: models.data.map((model) => model.id) });
  } catch (error) {
    return res.status(503).json({ message: "Unable to inspect provider models", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/generate-tickets", async (req, res) => {
  const parsed = z.object({ prompt: z.string().min(20), model: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "A detailed feature prompt is required" });
  const model = parsed.data.model ?? env.openaiModel;
  if (!model || model === "ask-me-before-selecting-a-model") {
    return res.status(400).json({ message: "Select a provider model before generating tickets" });
  }

  try {
    const client = getClient();
    const schemaInstruction = [
      "Return only valid JSON matching this exact shape:",
      "{ epic: { title: string, description: string }, stories: [{ title: string, description: string, acceptanceCriteria: string[], priority: low|medium|high|critical, storyPoints: integer 1..13, labels: string[], tasks: [{ title: string, description: string, storyPoints: integer 1..13, dependencies: string[] }] }] }.",
      "All array fields must always be JSON arrays, even when they contain one or zero items. Priority must be lowercase. Do not create records.",
    ].join("\n");
    const completion = await client.chat.completions.create({
      model,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: schemaInstruction,
        },
        { role: "user", content: parsed.data.prompt },
      ],
    });
    let raw = completion.choices[0]?.message?.content;
    let json = normalizeGeneratedTicketPlan(raw ? parseJsonPayload(raw) : null);
    let validation = generatedTicketSchema.safeParse(json);
    if (!validation.success && raw) {
      const repair = await client.chat.completions.create({
        model,
        temperature: 0,
        messages: [
          { role: "system", content: `${schemaInstruction}\nRepair the supplied JSON so it satisfies the schema. Return only the repaired JSON.` },
          { role: "user", content: JSON.stringify({ json, issues: validation.error.issues }) },
        ],
      });
      raw = repair.choices[0]?.message?.content;
      json = normalizeGeneratedTicketPlan(raw ? parseJsonPayload(raw) : null);
      validation = generatedTicketSchema.safeParse(json);
    }
    if (!validation.success) {
      return res.status(422).json({ message: "AI output did not match the ticket schema", issues: validation.error.issues });
    }
    return res.json({ plan: validation.data });
  } catch (error) {
    return res.status(500).json({ message: "AI ticket generation failed", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});

router.post("/confirm-ticket-plan", requireRole(["admin", "manager"]), async (req: AuthRequest, res) => {
  const parsed = z.object({
    plan: generatedTicketSchema,
    projectId: z.string(),
    sprintId: z.string(),
    assigneeId: z.string(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid ticket plan confirmation", issues: parsed.error.issues });

  const organization = req.user!.organizationId;
  const [project, sprint, assigneeMembership, reporterMembership, assignee, reporter] = await Promise.all([
    Project.findOne({ _id: parsed.data.projectId, organization }),
    Sprint.findOne({ _id: parsed.data.sprintId, organization }),
    OrganizationMembership.findOne({ user: parsed.data.assigneeId, organization, status: "active" }),
    OrganizationMembership.findOne({ user: req.user!.userId, organization, status: "active" }),
    User.findById(parsed.data.assigneeId),
    User.findById(req.user!.userId),
  ]);
  if (!project || !sprint || !assigneeMembership || !reporterMembership || !assignee || !reporter) return res.status(404).json({ message: "Project, sprint, assignee, or reporter not found" });

  const existingCount = await Ticket.countDocuments({ organization, project: project._id });
  let next = existingCount + 101;
  const docs = parsed.data.plan.stories.flatMap((story) => {
    const storyTicketId = `${project.key}-${String(next++).padStart(3, "0")}`;
    const storyDoc = {
      organization,
      ticketId: storyTicketId,
      title: story.title,
      description: story.description,
      acceptanceCriteria: story.acceptanceCriteria,
      status: "Backlog",
      priority: story.priority,
      storyPoints: story.storyPoints,
      assignee: assignee._id,
      reporter: reporter._id,
      project: project._id,
      sprint: sprint._id,
      epic: parsed.data.plan.epic.title,
      labels: story.labels,
      dueDate: sprint.endDate,
      blocked: false,
      dependencies: [],
      comments: [],
      workLogs: [],
      history: [{ event: "Created from AI Task Architect", createdAt: new Date() }],
    };
    const taskDocs = story.tasks.map((task) => ({
      organization,
      ticketId: `${project.key}-${String(next++).padStart(3, "0")}`,
      title: task.title,
      description: task.description,
      acceptanceCriteria: [],
      status: "Backlog",
      priority: story.priority,
      storyPoints: task.storyPoints,
      assignee: assignee._id,
      reporter: reporter._id,
      project: project._id,
      sprint: sprint._id,
      epic: parsed.data.plan.epic.title,
      labels: story.labels,
      dueDate: sprint.endDate,
      blocked: task.dependencies.length > 0,
      dependencies: task.dependencies,
      comments: [],
      workLogs: [],
      history: [{ event: "Created from AI Task Architect", createdAt: new Date() }],
    }));
    return [storyDoc, ...taskDocs];
  });

  const tickets = await Ticket.insertMany(docs);
  return res.status(201).json({ tickets });
});

router.post("/chat", async (req, res) => {
  const parsed = z.object({
    message: z.string().min(1),
    history: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional(),
    confirmed: z.object({ action: z.string() }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid chat request", issues: parsed.error.issues });

  const streamsToolActivity = req.get("accept")?.includes("application/x-ndjson") ?? false;
  if (streamsToolActivity) {
    res.status(200);
    res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
  }

  const sendEvent = (event: Record<string, unknown>) => {
    if (streamsToolActivity && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`);
  };
  const finish = (payload: Record<string, unknown>) => {
    if (!streamsToolActivity) return res.json(payload);
    const { toolCalls: _toolCalls, ...clientPayload } = payload;
    sendEvent({ type: "done", ...clientPayload });
    res.end();
  };

  const authReq = req as AuthRequest;
  const userRole = authReq.user!.role!;
  const endpoints = aiEndpointsForRole(userRole);
  const endpointList = endpoints.map((ep) => `${ep.method} ${ep.path}${ep.requiresConfirmation ? " [requires confirmation]" : ""}`).join("\n");

  const systemPrompt = [
    "You are the I-TRACK project-management assistant. You operate as the authenticated user.",
    "Use ONLY the following endpoints available for the user's role:",
    endpointList,
    "",
    "Feature coverage:",
    "- Tickets: list, create, update details, move status, rank, bulk update, assign, watch, clone, archive, delete, manage comments, work logs, dependencies, and attachments.",
    "- Projects, cycles, and sprints: list, create, update, manage members, archive/restore projects, group sprints into cycles, start/complete/reopen sprints, and summarize sprint risk.",
    "- Team and workspace: list/update users, send invitations, resend/cancel invitations, manage SLA policy, settings, resources, integrations, notifications, sessions, reports, exports, imports, and audit logs when the role allows it.",
    "- For requests that need missing IDs or required fields, first read the relevant list endpoint or ask the user for the missing value.",
    "",
    "Output formatting:",
    "- Respond in clear GitHub-flavored Markdown and lead with the direct answer or outcome.",
    "- Use short headings only when they make a longer response easier to scan.",
    "- Use Markdown tables for comparisons or metric summaries, bullets for related items, and numbered lists for ordered next steps.",
    "- Use **bold** sparingly for key labels or results, `inline code` for IDs, routes, fields, and commands, and fenced code blocks only for multiline code or payload examples.",
    "- Keep paragraphs concise and place a blank line between headings, paragraphs, lists, and tables.",
    "- Do not emit raw HTML, except `<br>` when a table cell needs multiple lines. Never wrap the entire response in a code fence.",
    "- Summarize tool results instead of dumping raw payloads unless the user asks for raw data. Clearly distinguish zero values from missing or unavailable data.",
    "- Never show workspace/organization IDs, membership IDs, tokens, or other internal UUIDs in your reply. Refer to workspaces by their name; internal IDs may be used only inside tool calls.",
    "",
    "Rules:",
    "- For destructive or irreversible actions (DELETE, archive, deactivate, etc.), describe what will happen and ask for explicit confirmation before proceeding.",
    "- Never expose credentials, tokens, or internal secrets.",
    "- Report backend errors accurately — include status codes and messages.",
    "- Never retry a failed create, update, or delete request with the same arguments. Explain the failure or ask for corrected information.",
    "- Before every POST, PUT, PATCH, or DELETE operation, call get_itrack_api_contract with the concrete method and path, follow its body contract and prerequisites exactly, then call execute_itrack_api.",
    "- When you need to call an I-TRACK API, use the execute_itrack_api tool.",
  ].join("\n");

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(parsed.data.history ?? []).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user", content: parsed.data.message },
  ];

  const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_itrack_api_contract",
        description: "Get the exact request-body contract and prerequisites for an I-TRACK write operation. Required before POST, PUT, PATCH, or DELETE.",
        parameters: {
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string", enum: ["POST", "PUT", "PATCH", "DELETE"] },
            path: { type: "string", description: "Concrete API path, with real ids when known." },
          },
        },
      },
    },
    {
      type: "function",
      function: {
        name: "execute_itrack_api",
        description: "Execute an allowed I-TRACK backend operation as the signed-in user. Before any write operation, inspect its contract with get_itrack_api_contract.",
        parameters: {
          type: "object",
          required: ["method", "path"],
          properties: {
            method: { type: "string", enum: ["GET", "POST", "PUT", "PATCH", "DELETE"] },
            path: { type: "string", description: "API path like /tickets or /tickets/:id/status" },
            body: { type: "object", description: "Request body for POST/PUT/PATCH" },
          },
        },
      },
    },
  ];

  try {
    const client = getClient();
    const model = env.openaiModel || "grok-3-mini";
    const allToolCalls: { name: string; arguments: unknown; result: unknown; error?: boolean }[] = [];
    const inspectedContracts = new Set<string>();
    const MAX_ITERATIONS = 7;
    const fallbackReply = () => allToolCalls.some((call) => call.error)
      ? "One or more requests failed. Please review the API error and try again with corrected information."
      : allToolCalls.length
        ? "I finished the requested API operations."
        : "I couldn't generate a response. Please try again.";

    let response = await client.chat.completions.create({
      model,
      temperature: 0.3,
      messages,
      tools,
    });

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      if (choice.finish_reason !== "tool_calls" || !assistantMessage.tool_calls?.length) {
        return finish({ reply: assistantMessage.content || fallbackReply(), ...(allToolCalls.length ? { toolCalls: allToolCalls } : {}) });
      }

      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function") {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "Unsupported tool type" }) });
          continue;
        }

        if (toolCall.function.name === "get_itrack_api_contract") {
          let contractArgs: { method: string; path: string };
          try {
            contractArgs = JSON.parse(toolCall.function.arguments);
          } catch {
            const result = { error: true, message: "Invalid contract lookup arguments" };
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
            allToolCalls.push({ name: toolCall.function.name, arguments: toolCall.function.arguments, result, error: true });
            continue;
          }
          sendEvent({ type: "tool_start", id: toolCall.id, name: toolCall.function.name, arguments: contractArgs });
          const contract = mutationContractFor(contractArgs.method, contractArgs.path);
          const result = contract
            ? { endpoint: contract.endpoint, body: contract.body, ...(contract.prerequisites ? { prerequisites: contract.prerequisites } : {}) }
            : { error: true, message: "No write contract exists for this method and path" };
          if (contract) inspectedContracts.add(contract.endpoint);
          allToolCalls.push({ name: toolCall.function.name, arguments: contractArgs, result, ...(!contract ? { error: true } : {}) });
          sendEvent({ type: "tool_result", id: toolCall.id, ok: Boolean(contract), status: contract ? 200 : 404 });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
          continue;
        }

        if (toolCall.function.name !== "execute_itrack_api") {
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify({ error: "Unknown tool" }) });
          continue;
        }

        let args: { method: string; path: string; body?: Record<string, unknown> };
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch {
          const errResult = { error: "Invalid tool arguments" };
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(errResult) });
          allToolCalls.push({ name: toolCall.function.name, arguments: toolCall.function.arguments, result: errResult, error: true });
          continue;
        }

        const { method, path, body } = args;
        const actionKey = `${method} ${path}`;

        if (method !== "GET") {
          const contract = mutationContractFor(method, path);
          if (!contract || !inspectedContracts.has(contract.endpoint)) {
            const result = {
              error: true,
              message: contract
                ? `Inspect ${contract.endpoint} with get_itrack_api_contract before executing it.`
                : "This write operation has no registered AI request contract.",
            };
            allToolCalls.push({ name: toolCall.function.name, arguments: args, result, error: true });
            messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(result) });
            continue;
          }
        }

        if (isConfirmationRequired(method, path) && parsed.data.confirmed?.action !== actionKey) {
          return finish({
            reply: `I need your confirmation to perform a destructive action: **${actionKey}**. Please confirm to proceed.`,
            requiresConfirmation: true,
            pendingAction: {
              method,
              path,
              body: body ?? null,
              description: actionKey,
            },
          });
        }

        sendEvent({ type: "tool_start", id: toolCall.id, name: toolCall.function.name, arguments: args });

        const executeUrl = new URL("/api/v1/ai/execute", requestOrigin(req));
        const executeRes = await fetch(executeUrl, {
          method: "POST",
          headers: {
            authorization: req.headers.authorization ?? "",
            "content-type": "application/json",
          },
          body: JSON.stringify({ method, path, body, confirmed: true }),
        });

        const resultText = await executeRes.text();
        let payload: unknown;
        try {
          payload = JSON.parse(resultText);
        } catch {
          payload = resultText;
        }

        const result = executeRes.ok
          ? payload
          : { error: true, status: executeRes.status, details: payload };

        allToolCalls.push({ name: toolCall.function.name, arguments: args, result, ...(!executeRes.ok ? { error: true } : {}) });
        sendEvent({ type: "tool_result", id: toolCall.id, ok: executeRes.ok, status: executeRes.status });
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: typeof result === "string" ? result : JSON.stringify(result) });
      }


      response = await client.chat.completions.create({
        model,
        temperature: 0.3,
        messages,
        tools,
      });
    }

    const finalChoice = response.choices[0];
    return finish({ reply: finalChoice?.message?.content || fallbackReply(), ...(allToolCalls.length ? { toolCalls: allToolCalls } : {}) });
  } catch (error) {
    if (streamsToolActivity) {
      sendEvent({ type: "error", message: error instanceof Error ? error.message : "Unknown error" });
      res.end();
      return;
    }
    return res.status(500).json({ message: "AI chat failed", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
