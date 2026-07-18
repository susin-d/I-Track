import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { AlertCircle, Bot, Boxes, Building2, ChartNoAxesCombined, Check, CircleSlash2, FilePlus2, ListChecks, PanelsTopLeft, SendHorizonal, ShieldAlert, Sparkles, Ticket, Timer, Trash2, User, UserPlus, UsersRound, WandSparkles, X } from "lucide-react";
import { api, apiFetch } from "../../api";
import { useWorkspace } from "../workspace";
import { CustomMarkdown } from "./Markdown";
import { cx } from "../../utils/ui";

export type AiChatMessage = {
  id: number | string;
  role: "user" | "assistant";
  content: string;
  requiresConfirmation?: boolean;
  pendingAction?: { method: string; path: string; body?: any; description: string };
};

export type AiConversation = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AiToolActivity = {
  id: string;
  method: string;
  path: string;
  status: "running" | "complete" | "error";
};

// Workspace identifiers are internal implementation details and should never
// be rendered in the conversational UI, even if a model echoes an API result.
function redactAiPrivateDetails(value: string) {
  return value
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[hidden]")
    .replace(/\b[0-9a-f]{24}\b/gi, "[hidden]")
    .replace(/`?\b(?:GET|POST|PUT|PATCH|DELETE)\s+\/[^\s`,;)]*`?/gi, "the requested action")
    .replace(/`\/(?:api\/v1\/)?[a-z][a-z0-9_/:?&=.-]*`/gi, "the requested feature");
}

type AiAgentContextValue = {
  messages: AiChatMessage[];
  conversations: AiConversation[];
  activeConversationId: string | null;
  historyLoading: boolean;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  toolActivities: AiToolActivity[];
  sendMessage: (text: string, confirmed?: { action: string }) => Promise<void>;
  confirmMessage: (message: AiChatMessage) => void;
  denyMessage: () => void;
  clearChat: () => void;
  openConversation: (id: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
};

const AiAgentContext = createContext<AiAgentContextValue | null>(null);

const aiActionPrompts = [
  { label: "Show what you can do", icon: "ListChecks", prompt: "Show what you can do across my organization and current workspace. Group actions by organization, groups, workspaces, projects, tickets, planning, team, resources, reports, settings, and integrations." },
  { label: "Organization overview", icon: "Building2", prompt: "Summarize my organization, its accessible workspaces, groups, and company directory. Do not show internal IDs." },
  { label: "Create a workspace", icon: "PanelsTopLeft", prompt: "Help me create a workspace in my current organization. Ask for the workspace name before creating it.", adminOnly: true },
  { label: "Manage access groups", icon: "UsersRound", prompt: "Show the groups in my organization, their members, and workspace access. Ask what I want to change before updating anything.", adminOnly: true },
  { label: "Create a ticket", icon: "FilePlus2", prompt: "Help me create a ticket. Ask for any missing title, project, assignee, sprint, priority, due date, and description before creating it." },
  { label: "Show my tickets", icon: "Ticket", prompt: "Show my tickets and summarize what needs attention first." },
  { label: "Summarize sprint status", icon: "Timer", prompt: "Summarize the current sprint status, risks, blockers, and recommended next actions." },
  { label: "Show blockers", icon: "CircleSlash2", prompt: "Show blocked tickets and explain what is blocking delivery." },
  { label: "Invite a teammate", icon: "UserPlus", prompt: "Help me invite a teammate. Ask for their name, email, role, and capacity before sending the invitation." },
  { label: "Manage workspace resources", icon: "Boxes", prompt: "Help me manage workspace resources. Show available resource types and ask what I want to create, update, or delete." },
  { label: "Show reports", icon: "ChartNoAxesCombined", prompt: "Show reports and summarize delivery, workload, risk, and velocity insights." },
];
const actionIcons = { Boxes, Building2, ChartNoAxesCombined, CircleSlash2, FilePlus2, ListChecks, PanelsTopLeft, Ticket, Timer, UserPlus, UsersRound };

export function aiActivityLabel(activity: AiToolActivity) {
  const path = activity.path.split("?")[0] || "/request";
  const segments = path.split("/").filter(Boolean);
  const action = segments.at(-1) || "";
  const parent = segments.at(-2)?.replace(/[-_]/g, " ") || "item";
  const isOrganizationRequest = segments[0] === "companies";
  const isGroupRequest = segments.includes("groups");
  if (isOrganizationRequest) {
    if (activity.method === "GET" && segments.length === 1) return "Fetching organizations";
    if (activity.method === "GET" && action === "workspaces") return "Fetching organization workspaces";
    if (activity.method === "GET" && action === "members") return "Fetching company directory";
    if (activity.method === "GET" && action === "groups") return "Fetching access groups";
    if (activity.method === "POST" && action === "workspaces") return "Creating workspace";
    if (activity.method === "POST" && action === "groups") return "Creating access group";
    if (isGroupRequest && action === "members") return "Updating group members";
    if (isGroupRequest && action === "workspaces") return "Updating group workspace access";
    if (isGroupRequest && activity.method === "DELETE") return "Removing access group";
    if (isGroupRequest) return "Updating access group";
  }
  const actionLabels: Record<string, string> = {
    assign: "Assigning ticket",
    archive: `Archiving ${parent.replace(/s$/, "")}`,
    attachments: "Adding attachment",
    bulk: "Updating tickets",
    clone: "Cloning ticket",
    comments: "Adding comment",
    complete: "Completing sprint",
    deactivate: "Deactivating user",
    invitations: "Sending invitation",
    members: "Updating project members",
    reactivate: "Reactivating user",
    "read-all": "Marking notifications as read",
    reopen: "Reopening sprint",
    resend: "Resending invitation",
    restore: `Restoring ${parent.replace(/s$/, "")}`,
    start: "Starting sprint",
    status: "Updating ticket status",
    watch: "Updating ticket watchers",
    "work-logs": "Adding work log",
  };
  if (activity.method !== "GET" && actionLabels[action]) return actionLabels[action];

  const idLike = /^[a-f\d]{24}$/i.test(action) || /^[a-f\d-]{32,36}$/i.test(action);
  const resource = (idLike ? parent : action.replace(/[-_]/g, " ")) || "workspace data";
  const readable = resource === "me" ? "your profile" : resource.replace(/s$/, "");
  const verb = activity.method === "GET"
    ? "Fetching"
    : activity.method === "POST"
      ? "Creating"
      : activity.method === "DELETE"
        ? "Removing"
        : "Updating";
  return `${verb} ${readable}`;
}

export function AiAgentProvider({ children, toast }: { children: React.ReactNode; toast: (s: string) => void }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [conversations, setConversations] = useState<AiConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolActivities, setToolActivities] = useState<AiToolActivity[]>([]);

  const refreshConversations = async () => {
    const response = await apiFetch("/ai/conversations");
    if (!response.ok) throw new Error("Unable to load AI chat history");
    const data = await response.json();
    const items = (data.conversations || []) as AiConversation[];
    setConversations(items);
    return items;
  };

  const openConversation = async (id: string) => {
    setHistoryLoading(true);
    try {
      const response = await apiFetch(`/ai/conversations/${id}/messages`);
      if (!response.ok) throw new Error("Unable to load this conversation");
      const data = await response.json();
      setActiveConversationId(id);
      setMessages((data.messages || []).map((message: any) => ({
        id: message.id,
        role: message.role,
        content: redactAiPrivateDetails(message.content),
        requiresConfirmation: message.metadata?.requiresConfirmation,
        pendingAction: message.metadata?.pendingAction
          ? { ...message.metadata.pendingAction, description: redactAiPrivateDetails(message.metadata.pendingAction.description) }
          : undefined,
      })));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to load this conversation");
    } finally {
      setHistoryLoading(false);
    }
  };

  useEffect(() => {
    refreshConversations()
      .then((items) => items[0] ? openConversation(items[0].id) : undefined)
      .catch((error) => toast(error instanceof Error ? error.message : "Unable to load AI chat history"))
      .finally(() => setHistoryLoading(false));
  }, []);

  const sendMessage = async (text: string, confirmed?: { action: string }) => {
    if (!text.trim() && !confirmed) return;
    const userMsg: AiChatMessage = { id: Date.now(), role: "user", content: text };
    if (!confirmed) setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setToolActivities([]);
    try {
      const history = messages.filter((m) => !m.requiresConfirmation).map((m) => ({ role: m.role, content: m.content }));
      const response = await apiFetch("/ai/chat", {
        method: "POST",
        // AI requests can execute several API tools before the streamed reply is
        // complete. The shared 15-second API timeout otherwise aborts the body
        // reader after the response headers have already arrived.
        timeoutMs: 5 * 60_000,
        headers: {
          Accept: "application/x-ndjson",
        },
        body: JSON.stringify({ message: text, history, ...(activeConversationId ? { conversationId: activeConversationId } : {}), ...(confirmed ? { confirmed } : {}) }),
      });
      if (response.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.message || `Request failed (${response.status})`);
      }
      if (!response.body) throw new Error("The AI response stream was unavailable.");

      let buffer = "";
      let res: any = null;
      let streamError = "";
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const consumeEvent = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "tool_start") {
          const args = event.arguments || {};
          setToolActivities((current) => [...current, {
            id: event.id,
            method: args.method || "GET",
            path: args.path || "/request",
            status: "running",
          }]);
        } else if (event.type === "tool_result") {
          setToolActivities((current) => current.map((activity) => activity.id === event.id
            ? { ...activity, status: event.ok ? "complete" : "error" }
            : activity));
        } else if (event.type === "done") {
          res = event;
        } else if (event.type === "error") {
          streamError = event.message || "AI chat failed";
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        lines.forEach(consumeEvent);
        if (done) break;
      }
      consumeEvent(buffer);
      if (streamError) {
        setMessages((m) => [...m, {
          id: Date.now() + 1,
          role: "assistant",
          content: redactAiPrivateDetails(`The AI request stopped before it completed: ${streamError}`),
        }]);
        return;
      }
      if (!res) throw new Error("The AI response ended before it was complete.");

      const assistantMsg: AiChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: redactAiPrivateDetails(res.reply || "I couldn't process that request."),
        requiresConfirmation: res.requiresConfirmation,
        pendingAction: res.pendingAction
          ? { ...res.pendingAction, description: redactAiPrivateDetails(res.pendingAction.description) }
          : undefined,
      };
      setMessages((m) => [...m, assistantMsg]);
      if (res.conversationId) setActiveConversationId(res.conversationId);
      await refreshConversations();
    } catch (e) {
      const rawMessage = e instanceof Error ? e.message : "AI request failed";
      const wasAborted = e instanceof DOMException && (e.name === "AbortError" || e.name === "TimeoutError")
        || /BodyStreamBuffer was aborted|body stream.*aborted/i.test(rawMessage);
      const message = wasAborted
        ? "The AI request took too long to finish. Please try again."
        : rawMessage;
      toast(message);
      setMessages((m) => [...m, {
        id: Date.now() + 1,
        role: "assistant",
        content: redactAiPrivateDetails(`Sorry, something went wrong: ${message}`),
      }]);
    } finally {
      setLoading(false);
      setToolActivities([]);
    }
  };

  const handleConfirm = (msg: AiChatMessage) => {
    if (!msg.pendingAction) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    sendMessage(lastUserMsg?.content || "confirm", { action: `${msg.pendingAction.method} ${msg.pendingAction.path}` });
  };

  const handleDeny = () => {
    setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: "Understood — action cancelled. How else can I help?" }]);
  };

  const clearChat = () => {
    setActiveConversationId(null);
    setMessages([]);
    setToolActivities([]);
  };

  const deleteConversation = async (id: string) => {
    try {
      const response = await apiFetch(`/ai/conversations/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Unable to delete this conversation");
      const remaining = conversations.filter((conversation) => conversation.id !== id);
      setConversations(remaining);
      if (activeConversationId === id) {
        if (remaining[0]) await openConversation(remaining[0].id);
        else clearChat();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete this conversation");
    }
  };

  return (
    <AiAgentContext.Provider value={{
      messages,
      conversations,
      activeConversationId,
      historyLoading,
      input,
      setInput,
      loading,
      toolActivities,
      sendMessage,
      confirmMessage: handleConfirm,
      denyMessage: handleDeny,
      clearChat,
      openConversation,
      deleteConversation,
    }}>
      {children}
    </AiAgentContext.Provider>
  );
}

export function useAiAgent() {
  const context = useContext(AiAgentContext);
  if (!context) throw new Error("useAiAgent must be used inside AiAgentProvider");
  return context;
}

export function AiAgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { messages, input, setInput, loading, toolActivities, sendMessage, confirmMessage, denyMessage, clearChat } = useAiAgent();
  const [actionsOpen, setActionsOpen] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const saved = localStorage.getItem("ai_panel_width");
    return saved ? Math.min(Math.max(parseInt(saved, 10), 340), window.innerWidth - 60) : 440;
  });
  const [isResizing, setIsResizing] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const { user, company, organization, role } = useWorkspace();

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    document.body.classList.add("ai-panel-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const newWidth = Math.max(340, Math.min(window.innerWidth - 60, window.innerWidth - moveEvent.clientX));
      setPanelWidth(newWidth);
    };

    const onMouseUp = () => {
      setIsResizing(false);
      document.body.classList.remove("ai-panel-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      setPanelWidth((currentWidth) => {
        localStorage.setItem("ai_panel_width", String(currentWidth));
        return currentWidth;
      });
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }, []);

  const handleResetWidth = useCallback(() => {
    setPanelWidth(440);
    localStorage.setItem("ai_panel_width", "440");
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading, toolActivities]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const quickActions = [
    "Organization overview",
    "Show my tickets",
    "Sprint status",
    ...(role === "admin" ? ["Create a workspace", "Manage access groups"] : []),
  ];
  const visibleActions = aiActionPrompts.filter((action) => !action.adminOnly || role === "admin");

  const runAction = (prompt: string) => {
    setActionsOpen(false);
    sendMessage(prompt);
  };

  if (!open) return null;

  return (
    <>
      <div className="ai-panel-backdrop" onClick={onClose} />
      <aside
        className={cx("ai-panel", isResizing && "is-resizing")}
        id="ai-agent-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI Agent"
        style={{ width: `${panelWidth}px` }}
      >
        <div
          className="ai-resize-handle"
          onMouseDown={handleMouseDown}
          onDoubleClick={handleResetWidth}
          title="Drag to resize panel (Double-click to reset width)"
        />
        <div className="ai-panel-head">
          <div className="ai-panel-icon"><Bot size={20} /></div>
          <div>
            <b>I-TRACK AI Agent</b>
            <small>{company?.name || "Organization"} · {organization?.name || "Current workspace"}</small>
          </div>
          <div className="ai-panel-actions">
            <button className="icon-btn" onClick={() => setActionsOpen((value) => !value)} title="AI actions" aria-haspopup="menu" aria-expanded={actionsOpen}>
              <WandSparkles size={16} />
            </button>
            <button className="icon-btn" onClick={clearChat} title="Clear chat"><Trash2 size={16} /></button>
            <button className="icon-btn" onClick={onClose} title="Close (Ctrl+J)"><X size={18} /></button>
            {actionsOpen && (
              <div className="ai-actions-menu" role="menu">
                {visibleActions.map((action) => {
                  const Icon = actionIcons[action.icon as keyof typeof actionIcons] || Sparkles;
                  return (
                    <button key={action.label} role="menuitem" onClick={() => runAction(action.prompt)}>
                      <Icon size={15} />
                      <span>{action.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="ai-chat-body" ref={bodyRef}>
          {messages.length === 0 && (
            <div className="ai-welcome">
              <div className="ai-welcome-icon"><Sparkles size={28} /></div>
              <h3>Hey{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</h3>
              <p>I can work across your organization, access groups, workspaces, projects, and tickets. Just ask in natural language.</p>
              <div className="ai-quick-actions">
                {quickActions.map((q) => (
                  <button key={q} onClick={() => sendMessage(q)}>{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((msg) => (
            <div className={cx("ai-msg", msg.role)} key={msg.id}>
              <div className="ai-msg-avatar">
                {msg.role === "assistant" ? <Bot size={16} /> : <User size={16} />}
              </div>
              <div>
                <div className="ai-msg-bubble">
                  {msg.role === "assistant" ? <CustomMarkdown content={msg.content} /> : msg.content}
                </div>
                {msg.requiresConfirmation && msg.pendingAction && (
                  <div className="ai-confirm-bar">
                    <p><ShieldAlert size={14} /> Confirmation Required</p>
                    <span>{msg.pendingAction.description}</span>
                    <div>
                      <button className="btn-confirm" onClick={() => confirmMessage(msg)}>Yes, proceed</button>
                      <button className="btn-deny" onClick={denyMessage}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="ai-typing">
              <div className="ai-msg-avatar" style={{ background: "linear-gradient(135deg, var(--purple), var(--blue))", color: "#fff", width: 30, height: 30, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Bot size={16} />
              </div>
              {toolActivities.length ? (
                <div className="ai-request-activity" aria-live="polite">
                  {toolActivities.map((activity) => (
                    <div className={cx("ai-request-row", activity.status)} key={activity.id}>
                      <span className="ai-request-indicator">
                        {activity.status === "complete" && <Check size={13} />}
                        {activity.status === "error" && <AlertCircle size={13} />}
                      </span>
                      <span>{aiActivityLabel(activity)}</span>
                      {activity.status === "running" && <span className="ai-request-ellipsis" aria-hidden="true">...</span>}
                    </div>
                  ))}
                </div>
              ) : <div className="ai-typing-dots"><span /><span /><span /></div>}
            </div>
          )}
        </div>
        <div className="ai-panel-input">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask me anything about your workspace…"
            rows={1}
          />
          <button className="ai-send-btn" disabled={!input.trim() || loading} onClick={() => sendMessage(input)}>
            <SendHorizonal size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}
