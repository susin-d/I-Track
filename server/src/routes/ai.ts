import { Router, type Request } from "express";
import { OpenAI } from "openai";
import type {
  ChatCompletionMessageParam,
  ChatCompletionTool,
} from "openai/resources/chat/completions";
import { z } from "zod";
import { aiEndpointsForRole, canRoleAccessAiEndpoint, isConfirmationRequired, normalizeAiPath } from "../aiAccess.js";
import { mutationContractFor, mutationContractGuidanceForRole } from "../aiContracts.js";
import { apiCatalog } from "../apiCatalog.js";
import { env } from "../config/env.js";
import { postgres } from "../config/postgres.js";
import { measureAsync } from "../lib/performance.js";
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

const aiExecuteSchema = z.object({
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  path: z.string().min(1),
  body: z.unknown().optional(),
  confirmed: z.boolean().default(false),
});

type AiExecutionResult = { status: number; payload: unknown };

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(",")}]`;
  if (!value || typeof value !== "object") return JSON.stringify(value);
  return `{${Object.keys(value as Record<string, unknown>).sort().map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
}

export function mutationAttemptKey(method: string, path: string, body: unknown) {
  return `${method.toUpperCase()} ${normalizeAiPath(path)} ${stableJson(body ?? {})}`;
}

export async function executeAiRequest(req: AuthRequest, input: unknown): Promise<AiExecutionResult> {
  const parsed = aiExecuteSchema.safeParse(input);
  if (!parsed.success) {
    return { status: 400, payload: { message: "Invalid AI endpoint execution request", issues: parsed.error.issues } };
  }

  const method = parsed.data.method;
  const path = normalizeAiPath(parsed.data.path);
  if (path.startsWith("/ai/execute")) return { status: 400, payload: { message: "AI execution cannot call itself" } };

  const access = canRoleAccessAiEndpoint(req.user!.role!, method, path, req.user!.permissions || []);
  if (!access.allowed) {
    return {
      status: 403,
      payload: {
        message: "Your role cannot access this endpoint through AI",
        allowedRoles: access.roles,
      },
    };
  }

  if (isConfirmationRequired(method, path) && !parsed.data.confirmed) {
    return {
      status: 409,
      payload: {
        requiresConfirmation: true,
        action: `${method} ${path}`,
        message: "Confirm this destructive action before AI performs it.",
      },
    };
  }

  const url = new URL(`/api/v1${path}`, requestOrigin(req));
  const response = await measureAsync("ai.execute.target_api", () => fetch(url, {
    method,
    headers: {
      authorization: req.headers.authorization ?? "",
      cookie: req.headers.cookie ?? "",
      ...(method === "GET" || method === "DELETE" ? {} : { "content-type": "application/json" }),
    },
    body: method === "GET" || method === "DELETE" ? undefined : JSON.stringify(parsed.data.body ?? {}),
  }), { method });
  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "application/json";
  const payload = contentType.includes("application/json") && text ? JSON.parse(text) : text;

  if (method !== "GET") {
    await measureAsync("ai.execute.audit", () => AuditEvent.create({
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
    }), { method });
  }

  return { status: response.status, payload };
}

router.get("/endpoints", (req: AuthRequest, res) => {
  return res.json({
    catalogVersion: apiCatalog.version,
    endpoints: aiEndpointsForRole(req.user!.role!, req.user!.permissions || []),
  });
});

router.post("/execute", async (req: AuthRequest, res) => {
  const result = await executeAiRequest(req, req.body);
  return res.status(result.status).json(result.payload);
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

router.get("/conversations", async (req: AuthRequest, res) => {
  const result = await postgres.query(
    `select id, title, created_at as "createdAt", updated_at as "updatedAt"
       from ai_conversations
      where organization = $1 and user_id = $2
      order by updated_at desc
      limit 50`,
    [req.user!.organizationId, req.user!.userId],
  );
  return res.json({ conversations: result.rows });
});

router.get("/conversations/:id/messages", async (req: AuthRequest, res) => {
  const conversation = await postgres.query(
    "select id, title from ai_conversations where id = $1 and organization = $2 and user_id = $3",
    [req.params.id, req.user!.organizationId, req.user!.userId],
  );
  if (!conversation.rowCount) return res.status(404).json({ message: "Conversation not found" });
  const messages = await postgres.query(
    `select id, role, content, metadata, created_at as "createdAt"
       from ai_messages where conversation_id = $1 order by created_at asc`,
    [req.params.id],
  );
  return res.json({ conversation: conversation.rows[0], messages: messages.rows });
});

router.delete("/conversations/:id", async (req: AuthRequest, res) => {
  const result = await postgres.query(
    "delete from ai_conversations where id = $1 and organization = $2 and user_id = $3 returning id",
    [req.params.id, req.user!.organizationId, req.user!.userId],
  );
  return result.rowCount
    ? res.json({ ok: true })
    : res.status(404).json({ message: "Conversation not found" });
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
    conversationId: z.string().optional(),
    history: z.array(z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
    })).optional(),
    confirmed: z.object({ action: z.string() }).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: "Invalid chat request", issues: parsed.error.issues });

  const authReq = req as AuthRequest;
  let conversationId = parsed.data.conversationId;
  let storedHistory: { role: "user" | "assistant"; content: string }[] = [];
  if (conversationId) {
    const conversation = await postgres.query(
      "select id from ai_conversations where id = $1 and organization = $2 and user_id = $3",
      [conversationId, authReq.user!.organizationId, authReq.user!.userId],
    );
    if (!conversation.rowCount) return res.status(404).json({ message: "Conversation not found" });
    const historyResult = await postgres.query(
      "select role, content from ai_messages where conversation_id = $1 order by created_at asc limit 100",
      [conversationId],
    );
    storedHistory = historyResult.rows;
  } else {
    const title = parsed.data.message.trim().replace(/\s+/g, " ").slice(0, 72) || "New conversation";
    const created = await postgres.query(
      `insert into ai_conversations (organization, user_id, title)
       values ($1, $2, $3) returning id`,
      [authReq.user!.organizationId, authReq.user!.userId, title],
    );
    conversationId = created.rows[0].id;
  }
  if (!parsed.data.confirmed) {
    await postgres.query(
      "insert into ai_messages (conversation_id, role, content) values ($1, 'user', $2)",
      [conversationId, parsed.data.message],
    );
    storedHistory.push({ role: "user", content: parsed.data.message });
  }

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
  const finish = async (payload: Record<string, unknown>) => {
    const reply = typeof payload.reply === "string" ? payload.reply : "";
    if (reply) {
      const metadata = {
        requiresConfirmation: payload.requiresConfirmation === true,
        ...(payload.pendingAction ? { pendingAction: payload.pendingAction } : {}),
      };
      await postgres.query(
        "insert into ai_messages (conversation_id, role, content, metadata) values ($1, 'assistant', $2, $3)",
        [conversationId, reply, JSON.stringify(metadata)],
      );
      await postgres.query("update ai_conversations set updated_at = now() where id = $1", [conversationId]);
    }
    payload.conversationId = conversationId;
    if (!streamsToolActivity) return res.json(payload);
    const { toolCalls: _toolCalls, ...clientPayload } = payload;
    sendEvent({ type: "done", ...clientPayload });
    res.end();
  };

  const userRole = authReq.user!.role!;
  const endpoints = aiEndpointsForRole(userRole, authReq.user!.permissions || []);
  const endpointList = endpoints.map((ep) => `${ep.method} ${ep.path}${ep.requiresConfirmation ? " [requires confirmation]" : ""}`).join("\n");
  const writeContracts = mutationContractGuidanceForRole(userRole, authReq.user!.permissions || []);

  const systemPrompt = [
    "You are the I-TRACK project-management assistant. You operate as the authenticated user.",
    "Use ONLY the following endpoints available for the user's role:",
    endpointList,
    "",
    "Feature coverage:",
    "- Tickets: list, create, update details, move status, rank, bulk update, assign, watch, clone, archive, delete, manage comments, work logs, dependencies, and attachments.",
    "- Projects, cycles, and sprints: list, create, update, manage members, archive/restore projects, group sprints into cycles, start/complete/reopen sprints, and summarize sprint risk.",
    "- Organization hierarchy: list the user's organizations, workspaces, organization members, and groups; create workspaces; switch workspaces; and manage groups, group members, and group workspace grants when the role allows it.",
    "- Team and workspace: list/update users, create team members (POST /team), send invitations, resend/cancel invitations, manage SLA policy, settings, resources, integrations, notifications, sessions, reports, exports, imports, and audit logs when the role allows it. Note: there is no POST /users endpoint; use POST /team or POST /invitations to create workspace users.",
    "- For requests that need missing IDs or required fields, first read the relevant list endpoint or ask the user for the missing value.",
    "",
    "Output formatting:",
    "- Respond in clear GitHub-flavored Markdown and lead with the direct answer or outcome.",
    "- Use short headings only when they make a longer response easier to scan.",
    "- Use Markdown tables for comparisons or metric summaries, bullets for related items, and numbered lists for ordered next steps.",
    "- Use **bold** sparingly for key labels or results and fenced code blocks only for multiline user-facing code.",
    "- Keep paragraphs concise and place a blank line between headings, paragraphs, lists, and tables.",
    "- Do not emit raw HTML, except `<br>` when a table cell needs multiple lines. Never wrap the entire response in a code fence.",
    "- Summarize tool results instead of dumping raw payloads unless the user asks for raw data. Clearly distinguish zero values from missing or unavailable data.",
    "- Never show workspace/organization IDs, membership IDs, tokens, or other internal UUIDs in your reply. Refer to workspaces by their name; internal IDs may be used only inside tool calls.",
    "- Never expose API endpoints, route paths, HTTP methods, request payloads, tool names, or other transport details in user-facing replies. Describe actions using product language such as creating a project or updating a ticket.",
    "",
    "Rules:",
    "- For destructive or irreversible actions (DELETE, archive, deactivate, etc.), describe what will happen and ask for explicit confirmation before proceeding.",
    "- Never expose credentials, tokens, or internal secrets.",
    "- If a tool execution returns a successful (2xx) status or payload, treat the operation as successful and summarize the outcome to the user. Do not state that an operation failed if the tool returned a successful result.",
    "- Explain final failures in user-friendly product language without status codes, endpoint paths, or raw backend messages.",
    "- Never retry a failed create, update, or delete request with the same arguments. Explain the failure or ask for corrected information.",
    "- Prefer GET /dashboard when project, sprint, ticket, and user context is needed together; do not fetch those lists separately unless the dashboard lacks a required field.",
    "- For organization-level requests, use GET /companies first and use the returned company id. Then read that organization's workspaces, members, or groups before making changes.",
    "- A company is the top-level organization and an organization record is a workspace. Describe both with the user-facing terms organization and workspace; never call a workspace a company.",
    "- Before changing group members or workspace access, read the organization members, groups, and workspaces and use only ids returned by those endpoints.",
    "- When creating a new workspace, switch to it with POST /workspaces/:id/switch before calling endpoints intended for that workspace.",
    "- POST /workspaces/:id/onboarding/complete requires creating at least one project (POST /projects) in that workspace first.",
    "- Use get_itrack_api_contract when you need the exact fields or prerequisites for a write. The backend always validates access, confirmation, and request bodies before execution.",
    "- When you need to call an I-TRACK API, use the execute_itrack_api tool.",
    "",
    "Write request contracts:",
    writeContracts,
    "",
    "Project creation rules:",
    "- POST /projects requires key, name, and description. Use a short unique key. If key uniqueness is unclear, read GET /projects first.",
    "- If POST /projects returns PROJECT_KEY_EXISTS or 409, ask for another key or generate a different key. Do not retry the same body.",
  ].join("\n");

  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...(storedHistory.length ? storedHistory : (parsed.data.history ?? [])).map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ...(parsed.data.confirmed ? [{ role: "user" as const, content: parsed.data.message }] : []),
  ];

  const tools: ChatCompletionTool[] = [
    {
      type: "function",
      function: {
        name: "get_itrack_api_contract",
        description: "Get the exact request-body contract and prerequisites for an I-TRACK write operation when the required fields are unclear.",
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
        description: "Execute an allowed I-TRACK backend operation as the signed-in user. Access, destructive-action confirmation, and request bodies are validated by the backend.",
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

  const allToolCalls: { name: string; arguments: unknown; result: unknown; error?: boolean }[] = [];
  try {
    const client = getClient();
    const model = env.openaiChatModel || "grok-3-mini";
    const failedMutationAttempts = new Set<string>();
    const MAX_ITERATIONS = 7;
    const fallbackReply = () => {
      const lastExecution = [...allToolCalls].reverse().find((call) => call.name === "execute_itrack_api");
      if (lastExecution) {
        return lastExecution.error
          ? "I couldn't complete the request. Please check the information and try again."
          : "I finished the requested API operations.";
      }
      return allToolCalls.some((call) => call.error)
        ? "I couldn't complete the request. Please check the information and try again."
        : allToolCalls.length
          ? "I finished the requested API operations."
          : "I couldn't generate a response. Please try again.";
    };

    let response = await measureAsync("ai.provider.initial", () => client.chat.completions.create({
      model,
      temperature: 0.3,
      messages,
      tools,
    }));

    for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const choice = response.choices[0];
      if (!choice) break;

      const assistantMessage = choice.message;
      messages.push(assistantMessage);

      if (choice.finish_reason !== "tool_calls" || !assistantMessage.tool_calls?.length) {
        return await finish({ reply: assistantMessage.content || fallbackReply(), ...(allToolCalls.length ? { toolCalls: allToolCalls } : {}) });
      }

      const parallelReads = new Map<string, Promise<AiExecutionResult>>();
      for (const toolCall of assistantMessage.tool_calls) {
        if (toolCall.type !== "function" || toolCall.function.name !== "execute_itrack_api") continue;
        try {
          const args = JSON.parse(toolCall.function.arguments) as { method?: string; path?: string; body?: Record<string, unknown> };
          if (args.method !== "GET" || typeof args.path !== "string") continue;
          sendEvent({ type: "tool_start", id: toolCall.id, name: toolCall.function.name, arguments: args });
          parallelReads.set(toolCall.id, executeAiRequest(authReq, { ...args, confirmed: true }).catch((error) => ({
            status: 500,
            payload: { message: error instanceof Error ? error.message : "AI read execution failed" },
          })));
        } catch {
          // The normal tool-processing path below reports malformed arguments.
        }
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
            ? { found: true, endpoint: contract.endpoint, body: contract.body, ...(contract.prerequisites ? { prerequisites: contract.prerequisites } : {}) }
            : { found: false, message: "No custom write contract specified for this endpoint. Send standard fields." };
          allToolCalls.push({ name: toolCall.function.name, arguments: contractArgs, result });
          sendEvent({ type: "tool_result", id: toolCall.id, ok: true, status: 200 });
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
        const mutationKey = method === "GET" ? null : mutationAttemptKey(method, path, body);

        if (isConfirmationRequired(method, path) && parsed.data.confirmed?.action !== actionKey) {
          return finish({
            reply: "I need your confirmation before performing this destructive action. Please confirm to proceed.",
            requiresConfirmation: true,
            pendingAction: {
              method,
              path,
              body: body ?? null,
              description: "Confirm destructive action",
            },
          });
        }

        if (mutationKey && failedMutationAttempts.has(mutationKey)) {
          const blocked = {
            error: true,
            status: 409,
            details: { message: "Repeated mutation blocked after the same request body already failed. Correct the payload or ask the user for clarification." },
          };
          allToolCalls.push({ name: toolCall.function.name, arguments: args, result: blocked, error: true });
          sendEvent({ type: "tool_result", id: toolCall.id, ok: false, status: 409 });
          messages.push({ role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(blocked) });
          continue;
        }

        const pendingRead = parallelReads.get(toolCall.id);
        if (!pendingRead) sendEvent({ type: "tool_start", id: toolCall.id, name: toolCall.function.name, arguments: args });

        const execution = pendingRead
          ? await pendingRead
          : await executeAiRequest(authReq, { method, path, body, confirmed: true });
        const executionOk = execution.status >= 200 && execution.status < 300;
        const result = executionOk
          ? execution.payload
          : { error: true, status: execution.status, details: execution.payload };
        if (!executionOk && mutationKey) failedMutationAttempts.add(mutationKey);

        allToolCalls.push({ name: toolCall.function.name, arguments: args, result, ...(!executionOk ? { error: true } : {}) });
        sendEvent({ type: "tool_result", id: toolCall.id, ok: executionOk, status: execution.status });
        messages.push({ role: "tool", tool_call_id: toolCall.id, content: typeof result === "string" ? result : JSON.stringify(result) });
      }


      response = await measureAsync("ai.provider.followup", () => client.chat.completions.create({
        model,
        temperature: 0.3,
        messages,
        tools,
      }));
    }

    const finalChoice = response.choices[0];
    return finish({ reply: finalChoice?.message?.content || fallbackReply(), ...(allToolCalls.length ? { toolCalls: allToolCalls } : {}) });
  } catch (error) {
    if (streamsToolActivity) {
      sendEvent({
        type: "error",
        message: error instanceof Error ? error.message : "Unknown error",
      });
      res.end();
      return;
    }
    return res.status(500).json({ message: "AI chat failed", detail: error instanceof Error ? error.message : "Unknown error" });
  }
});

export default router;
