import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  BrowserRouter,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import * as Icons from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, clearSession, getToken, login, saveSession } from "../api";
import { resourceKinds } from "../constants/resources";
import type { NotificationPreferences, Role, Ticket, TicketStatus, Toast } from "../types/domain";
import { ApiGate, useWorkspace } from "./workspace";
import { nav } from "./navigation";
import {
  Avatar,
  Badge,
  CardTitle,
  Empty,
  FilterBar,
  LabelChips,
  LabelPicker,
  PageHead,
  Progress,
} from "./components/ui";
import { cx, fmt } from "../utils/ui";
import { CustomMarkdown } from "./components/Markdown";

const defaultNotificationPreferences: NotificationPreferences = {
  ticketAssignments: true,
  mentionsAndComments: true,
  sprintRiskAlerts: true,
  weeklySummary: false,
};

const notificationPreferenceOptions: { key: keyof NotificationPreferences; label: string }[] = [
  { key: "ticketAssignments", label: "Ticket assignments" },
  { key: "mentionsAndComments", label: "Mentions and comments" },
  { key: "sprintRiskAlerts", label: "Sprint risk alerts" },
  { key: "weeklySummary", label: "Weekly summary" },
];

export function App() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");
  const [density, setDensity] = useState(
    localStorage.getItem("density") || "comfortable",
  );
  const [role, setRole] = useState<Role>("admin");
  const [toasts, setToasts] = useState<Toast[]>([]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.dataset.density = density;
    localStorage.setItem("theme", theme);
  }, [theme, density]);
  const toast = (message: string) => {
    const id = Date.now();
    setToasts((t) => [...t, { id, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2600);
  };
  return (
    <BrowserRouter>
      <ApiGate toast={toast}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<AuthPageLive type="login" />} />
          <Route path="/register" element={<AuthPageLive type="register" />} />
          <Route
            path="/forgot-password"
            element={<AuthPageLive type="forgot-password" />}
          />
          <Route
            path="/reset-password"
            element={<AuthPageLive type="reset-password" />}
          />
          <Route
            path="/accept-invite"
            element={<InvitationAcceptPage />}
          />
          <Route path="/onboarding/:step" element={<OnboardingFlow toast={toast} />} />
          <Route
            path="/*"
            element={
              <Shell
                theme={theme}
                setTheme={setTheme}
                role={role}
                setRole={setRole}
                toast={toast}
              >
                <AppRoutes
                  density={density}
                  setDensity={setDensity}
                  toast={toast}
                />
              </Shell>
            }
          />
        </Routes>
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((t) => (
            <div className="toast" key={t.id} role="status">
              <Icons.CheckCircle2 size={18} />
              {t.message}
            </div>
          ))}
        </div>
      </ApiGate>
    </BrowserRouter>
  );
}
function Shell({
  children,
  theme,
  setTheme,
  role,
  setRole,
  toast,
}: {
  children: React.ReactNode;
  theme: string;
  setTheme: (s: string) => void;
  role: Role;
  setRole: (r: Role) => void;
  toast: (s: string) => void;
}) {
  const {
    organization,
    user: currentUser,
    notifications = [],
    memberships = [],
    pendingInvitations = [],
    refetch,
  } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<any>(null);
  const mobileMenuButton = React.useRef<HTMLButtonElement>(null);
  const searchButton = React.useRef<HTMLButtonElement>(null);
  const loc = useLocation();
  const navigate = useNavigate();
  const label =
    nav
      .flatMap((g) => g.items)
      .find((i) => loc.pathname.startsWith(i[0]))?.[2] ||
    fmt(loc.pathname.split("/").filter(Boolean).at(-1) || "Dashboard");
  const effectiveRole = (currentUser?.role || role) as Role;
  const switchWorkspace = async (organizationId: string) => {
    const session = await api<any>(`/workspaces/${organizationId}/switch`, { method: "POST", body: JSON.stringify({ refreshToken: localStorage.getItem("itrack_refresh_token") }) });
    saveSession(session);
    window.location.assign("/dashboard");
  };
  const acceptPendingInvitation = async () => {
    if (!selectedInvitation) return;
    const session = await api<any>("/auth/accept-invite", { method: "POST", body: JSON.stringify({ invitationId: selectedInvitation.id }) });
    saveSession(session);
    window.location.assign("/dashboard");
  };

  const unreadCount = notifications.filter((n: any) => !n.readAt).length;

  const closeOverlays = React.useCallback(() => {
    setMobile(false);
    setSearch(false);
    setWorkspaceMenu(false);
    setAiPanel(false);
  }, []);

  useEffect(() => {
    closeOverlays();
  }, [loc.pathname, closeOverlays]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        closeOverlays();
        setSearch(true);
      }
      if (event.key === "Escape") {
        const wasMobile = mobile;
        const wasSearch = search;
        closeOverlays();
        if (wasMobile) mobileMenuButton.current?.focus();
        if (wasSearch) searchButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobile, search, closeOverlays]);

  useEffect(() => {
    document.body.classList.toggle("overlay-open", mobile || search || aiPanel);
    return () => document.body.classList.remove("overlay-open");
  }, [mobile, search, aiPanel]);

  return (
    <AiAgentProvider toast={toast}>
    <div className={cx("app", collapsed && "collapsed")}>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside
        className={cx("sidebar", mobile && "open")}
        aria-label="Workspace navigation"
      >
        <div className="brand">
          <div className="brand-mark"><img src="/logo-mark.png" alt="" /></div>
          <span>I-TRACK</span>
          <button
            className="icon-btn collapse"
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Icons.PanelLeftClose size={19} />
          </button>
          <button
            className="icon-btn mobile-sidebar-close"
            onClick={() => {
              setMobile(false);
              mobileMenuButton.current?.focus();
            }}
            aria-label="Close navigation"
          >
            <Icons.X size={19} />
          </button>
        </div>
        <div className="workspace-switcher">
          <button
            className="org-switch"
            aria-haspopup="menu"
            aria-expanded={workspaceMenu}
            onClick={() => setWorkspaceMenu(!workspaceMenu)}
          >
            <span className="avatar square">
              {(organization?.name || "Workspace")
                .split(" ")
                .map((x: string) => x[0])
                .join("")
                .slice(0, 2)}
            </span>
            <span>
              <b>{organization?.name || "Workspace"}</b>
              <small>{fmt(organization?.plan || "starter")} workspace</small>
            </span>
            <Icons.ChevronsUpDown size={15} />
          </button>
          {workspaceMenu && (
            <div className="workspace-menu" role="menu">
              <p>WORKSPACES</p>
              {memberships.map((membership: any) => {
                const selected = String(membership.organization?.id) === String(organization?.id || organization?._id);
                return <button key={membership.id} className={selected ? "selected" : ""} role="menuitem" onClick={() => selected ? setWorkspaceMenu(false) : switchWorkspace(membership.organization.id)}><span className="avatar square">{(membership.organization?.name || "W").slice(0, 2).toUpperCase()}</span><span><b>{membership.organization?.name}</b><small>{selected ? "Current workspace" : fmt(membership.role)}</small></span>{selected && <Icons.Check size={16} />}</button>;
              })}
              {pendingInvitations.length > 0 && <><hr /><p>PENDING INVITATIONS</p>{pendingInvitations.map((invitation: any) => <button key={invitation.id} role="menuitem" onClick={() => { setWorkspaceMenu(false); setSelectedInvitation(invitation); }}><Icons.MailPlus size={17} /><span><b>{invitation.organization?.name}</b><small>Invited as {fmt(invitation.role)}</small></span></button>)}</>}
              <hr />
              <button
                role="menuitem"
                onClick={() => {
                  setWorkspaceMenu(false);
                  navigate("/organization");
                }}
              >
                <Icons.Settings size={17} />
                <span>
                  <b>Workspace settings</b>
                  <small>Members, plan and preferences</small>
                </span>
              </button>
            </div>
          )}
        </div>
        <nav>
          {nav
            .filter((g) => !g.admin || effectiveRole === "admin")
            .map((g) => (
              <div className="nav-group" key={g.group}>
                <p>{g.group}</p>
                {g.items.map(([path, icon, label]) => {
                  const Icon = (Icons as any)[icon];
                  return (
                    <NavLink
                      key={path}
                      to={path}
                      onClick={() => setMobile(false)}
                      className={({ isActive }) => (isActive ? "active" : "")}
                      title={collapsed ? label : undefined}
                    >
                      <Icon size={19} />
                      <span>{label}</span>
                      {label === "Notifications" && unreadCount > 0 && (
                        <em>{unreadCount}</em>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            ))}
        </nav>
        <button
          className="sidebar-user"
          onClick={() => navigate("/settings/profile")}
          aria-label="Open profile settings"
        >
          <Avatar
            name={currentUser?.name || "User"}
            color={currentUser?.avatarColor}
          />
          <span>
            <b>{currentUser?.name || "User"}</b>
            <small>{fmt(currentUser?.role || role)}</small>
          </span>
          <Icons.Settings size={17} />
        </button>
      </aside>
      <header className="topbar">
        <button
          ref={mobileMenuButton}
          className="icon-btn mobile-menu"
          onClick={() => {
            closeOverlays();
            setMobile(true);
          }}
          aria-label="Open navigation"
          aria-expanded={mobile}
        >
          <Icons.Menu />
        </button>
        <div className="crumb">
          <span>{organization?.name || "Workspace"}</span>
          <Icons.ChevronRight size={15} />
          <b>{label}</b>
        </div>
        <div className="top-actions">
          <button
            ref={searchButton}
            className="search-trigger"
            onClick={() => {
              closeOverlays();
              setSearch(true);
            }}
            aria-label="Search workspace"
          >
            <Icons.Search size={17} />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
          {(effectiveRole === "admin" || effectiveRole === "manager") && (
            <button
              className="btn primary"
              onClick={() => navigate("/tickets/new")}
            >
              <Icons.Plus size={17} />
              New ticket
            </button>
          )}
          <button
            className="ai-agent-toggle"
            onClick={() => {
              const next = !aiPanel;
              closeOverlays();
              setAiPanel(next);
            }}
            aria-expanded={aiPanel}
            aria-controls="ai-agent-panel"
          >
              <span className="pulse-dot" />
              <Icons.Bot size={16} />
              <span>AI Agent</span>
            </button>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
          </button>
          <button
            className="icon-btn"
            onClick={() => navigate("/notifications")}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            title="Notifications"
          >
            <Icons.Bell />
            {unreadCount > 0 && <i />}
          </button>
        </div>
      </header>
      <main id="main-content" tabIndex={-1}>{children}</main>
      {selectedInvitation && <div className="modal-wrap" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedInvitation(null)}><section className="card invite-review" role="dialog" aria-modal="true" aria-labelledby="invite-review-title"><button className="icon-btn modal-close" onClick={() => setSelectedInvitation(null)} aria-label="Close invitation"><Icons.X /></button><Badge tone="blue">WORKSPACE INVITATION</Badge><h2 id="invite-review-title">Join {selectedInvitation.organization?.name}</h2><p>{selectedInvitation.invitedBy?.name || "A workspace admin"} invited you to collaborate as <b>{fmt(selectedInvitation.role)}</b>.</p><div className="invite-summary"><span>Workspace <b>{selectedInvitation.organization?.name}</b></span><span>Role <b>{fmt(selectedInvitation.role)}</b></span><span>Email <b>{selectedInvitation.email}</b></span></div><div className="form-actions"><button className="btn" onClick={() => setSelectedInvitation(null)}>Not now</button><button className="btn primary" onClick={acceptPendingInvitation}>Accept and open workspace</button></div></section></div>}
      <nav className="bottom-nav" aria-label="Mobile navigation">
        {[
          ["/dashboard", "House", "Home"],
          ["/projects", "FolderKanban", "Projects"],
          ["/my-work", "CircleUserRound", "Work"],
          ["/reports", "ChartNoAxesCombined", "Reports"],
          ["/settings", "Menu", "More"],
        ].map(([p, i, l]) => {
          const Icon = (Icons as any)[i];
          return (
            <NavLink to={p} key={p}>
              <Icon />
              <span>{l}</span>
            </NavLink>
          );
        })}
      </nav>
      {mobile && (
        <button
          className="scrim"
          onClick={() => {
            setMobile(false);
            mobileMenuButton.current?.focus();
          }}
          aria-label="Close navigation"
        />
      )}{" "}
      {search && (
        <Command
          close={() => {
            setSearch(false);
            requestAnimationFrame(() => searchButton.current?.focus());
          }}
          navigate={navigate}
        />
      )}
      {(effectiveRole === "admin" || effectiveRole === "manager") && (
        <button
          className="fab"
          onClick={() => navigate("/tickets/new")}
          aria-label="Create ticket"
          title="Create ticket"
        >
          <Icons.Plus />
        </button>
      )}
      <AiAgentPanel open={aiPanel} onClose={() => setAiPanel(false)} />
    </div>
    </AiAgentProvider>
  );
}
function Command({
  close,
  navigate,
}: {
  close: () => void;
  navigate: (s: string) => void;
}) {
  const [q, setQ] = useState("");
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const all = nav.flatMap((g) => g.items);
  const results = all
    .filter((x) => x[2].toLowerCase().includes(q.toLowerCase()))
    .slice(0, 8);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
        ),
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    dialog.addEventListener("keydown", trapFocus);
    return () => dialog.removeEventListener("keydown", trapFocus);
  }, [results.length]);
  return (
    <div className="modal-wrap" onMouseDown={close}>
      <div
        ref={dialogRef}
        className="command"
        role="dialog"
        aria-modal="true"
        aria-labelledby="command-title"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div>
          <Icons.Search />
          <span className="sr-only" id="command-title">Search workspace</span>
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, tickets and projects…"
            aria-label="Search pages"
          />
          <kbd>ESC</kbd>
          <button
            className="icon-btn command-close"
            onClick={close}
            aria-label="Close search"
          >
            <Icons.X />
          </button>
        </div>
        <p>QUICK NAVIGATION</p>
        {results.map(([p, i, l]) => {
            const Icon = (Icons as any)[i];
            return (
              <button
                key={p}
                onClick={() => {
                  navigate(p);
                  close();
                }}
              >
                <Icon />
                <span>{l}</span>
                <Icons.ArrowUpRight />
              </button>
            );
          })}
        {results.length === 0 && (
          <div className="command-empty">
            <Icons.SearchX />
            <b>No pages found</b>
            <span>Try a different page name.</span>
          </div>
        )}
      </div>
    </div>
  );
}

type AiChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  requiresConfirmation?: boolean;
  pendingAction?: { method: string; path: string; body?: any; description: string };
};

type AiToolActivity = {
  id: string;
  method: string;
  path: string;
  status: "running" | "complete" | "error";
};

// Workspace identifiers are internal implementation details and should never
// be rendered in the conversational UI, even if a model echoes an API result.
function redactAiInternalIds(value: string) {
  return value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[hidden]");
}

type AiAgentContextValue = {
  messages: AiChatMessage[];
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  loading: boolean;
  toolActivities: AiToolActivity[];
  sendMessage: (text: string, confirmed?: { action: string }) => Promise<void>;
  confirmMessage: (message: AiChatMessage) => void;
  denyMessage: () => void;
  clearChat: () => void;
};

const AiAgentContext = createContext<AiAgentContextValue | null>(null);

const aiActionPrompts = [
  { label: "Show what you can do", icon: "ListChecks", prompt: "Show what you can do in this workspace. Group actions by tickets, projects, sprints, team, resources, reports, settings, and integrations." },
  { label: "Create a ticket", icon: "FilePlus2", prompt: "Help me create a ticket. Ask for any missing title, project, assignee, sprint, priority, due date, and description before creating it." },
  { label: "Show my tickets", icon: "Ticket", prompt: "Show my tickets and summarize what needs attention first." },
  { label: "Summarize sprint status", icon: "Timer", prompt: "Summarize the current sprint status, risks, blockers, and recommended next actions." },
  { label: "Show blockers", icon: "CircleSlash2", prompt: "Show blocked tickets and explain what is blocking delivery." },
  { label: "Invite a teammate", icon: "UserPlus", prompt: "Help me invite a teammate. Ask for their name, email, role, and capacity before sending the invitation." },
  { label: "Manage workspace resources", icon: "Boxes", prompt: "Help me manage workspace resources. Show available resource types and ask what I want to create, update, or delete." },
  { label: "Show reports", icon: "ChartNoAxesCombined", prompt: "Show reports and summarize delivery, workload, risk, and velocity insights." },
];

function aiActivityLabel(activity: AiToolActivity) {
  const path = activity.path.split("?")[0] || "/request";
  const segments = path.split("/").filter(Boolean);
  const action = segments.at(-1) || "";
  const parent = segments.at(-2)?.replace(/[-_]/g, " ") || "item";
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

function AiAgentProvider({ children, toast }: { children: React.ReactNode; toast: (s: string) => void }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [toolActivities, setToolActivities] = useState<AiToolActivity[]>([]);

  const sendMessage = async (text: string, confirmed?: { action: string }) => {
    if (!text.trim() && !confirmed) return;
    const userMsg: AiChatMessage = { id: Date.now(), role: "user", content: text };
    if (!confirmed) setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    setToolActivities([]);
    try {
      const history = messages.filter((m) => !m.requiresConfirmation).map((m) => ({ role: m.role, content: m.content }));
      const token = getToken();
      const response = await fetch("/api/v1/ai/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/x-ndjson",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ message: text, history, ...(confirmed ? { confirmed } : {}) }),
      });
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
      if (streamError) throw new Error(streamError);
      if (!res) throw new Error("The AI response ended before it was complete.");

      const assistantMsg: AiChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: redactAiInternalIds(res.reply || "I couldn't process that request."),
        requiresConfirmation: res.requiresConfirmation,
        pendingAction: res.pendingAction
          ? { ...res.pendingAction, description: redactAiInternalIds(res.pendingAction.description) }
          : undefined,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "AI request failed");
      setMessages((m) => [...m, {
        id: Date.now() + 1,
        role: "assistant",
        content: e instanceof Error ? redactAiInternalIds(`Sorry, something went wrong: ${e.message}`) : "An unexpected error occurred.",
      }]);
    } finally {
      setLoading(false);
      setToolActivities([]);
    }
  };

  const handleConfirm = (msg: AiChatMessage) => {
    if (!msg.pendingAction) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    sendMessage(lastUserMsg?.content || "confirm", { action: msg.pendingAction.description });
  };

  const handleDeny = () => {
    setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: "Understood — action cancelled. How else can I help?" }]);
  };

  const clearChat = () => { setMessages([]); setToolActivities([]); };

  return (
    <AiAgentContext.Provider value={{
      messages,
      input,
      setInput,
      loading,
      toolActivities,
      sendMessage,
      confirmMessage: handleConfirm,
      denyMessage: handleDeny,
      clearChat,
    }}>
      {children}
    </AiAgentContext.Provider>
  );
}

function useAiAgent() {
  const context = useContext(AiAgentContext);
  if (!context) throw new Error("useAiAgent must be used inside AiAgentProvider");
  return context;
}

function AiAgentPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { messages, input, setInput, loading, toolActivities, sendMessage, confirmMessage, denyMessage, clearChat } = useAiAgent();
  const [actionsOpen, setActionsOpen] = useState(false);
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const { user } = useWorkspace();

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

  const quickActions = ["Show my tickets", "Sprint status", "Create a ticket", "Team overview", "Show backlog"];

  const runAction = (prompt: string) => {
    setActionsOpen(false);
    sendMessage(prompt);
  };

  if (!open) return null;

  return (
    <>
      <div className="ai-panel-backdrop" onClick={onClose} />
      <aside
        className="ai-panel"
        id="ai-agent-panel"
        role="dialog"
        aria-modal="true"
        aria-label="AI Agent"
      >
        <div className="ai-panel-head">
          <div className="ai-panel-icon"><Icons.Bot size={20} /></div>
          <div>
            <b>I-TRACK AI Agent</b>
            <small>Powered by AI · Ready to help</small>
          </div>
          <div className="ai-panel-actions">
            <button className="icon-btn" onClick={() => setActionsOpen((value) => !value)} title="AI actions" aria-haspopup="menu" aria-expanded={actionsOpen}>
              <Icons.WandSparkles size={16} />
            </button>
            <button className="icon-btn" onClick={clearChat} title="Clear chat"><Icons.Trash2 size={16} /></button>
            <button className="icon-btn" onClick={onClose} title="Close (Ctrl+J)"><Icons.X size={18} /></button>
            {actionsOpen && (
              <div className="ai-actions-menu" role="menu">
                {aiActionPrompts.map((action) => {
                  const Icon = (Icons as any)[action.icon];
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
              <div className="ai-welcome-icon"><Icons.Sparkles size={28} /></div>
              <h3>Hey{user?.name ? `, ${user.name.split(" ")[0]}` : ""}!</h3>
              <p>I can manage your tickets, projects, sprints, and more. Just ask me in natural language.</p>
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
                {msg.role === "assistant" ? <Icons.Bot size={16} /> : <Icons.User size={16} />}
              </div>
              <div>
                <div className="ai-msg-bubble">
                  {msg.role === "assistant" ? <CustomMarkdown content={msg.content} /> : msg.content}
                </div>
                {msg.requiresConfirmation && msg.pendingAction && (
                  <div className="ai-confirm-bar">
                    <p><Icons.ShieldAlert size={14} /> Confirmation Required</p>
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
                <Icons.Bot size={16} />
              </div>
              {toolActivities.length ? (
                <div className="ai-request-activity" aria-live="polite">
                  {toolActivities.map((activity) => (
                    <div className={cx("ai-request-row", activity.status)} key={activity.id}>
                      <span className="ai-request-indicator">
                        {activity.status === "complete" && <Icons.Check size={13} />}
                        {activity.status === "error" && <Icons.AlertCircle size={13} />}
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
            <Icons.SendHorizonal size={18} />
          </button>
        </div>
      </aside>
    </>
  );
}

function AppRoutes({
  density,
  setDensity,
  toast,
}: {
  density: string;
  setDensity: (s: string) => void;
  toast: (s: string) => void;
}) {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<DashboardLive />} />
      <Route path="/my-work" element={<MyWork />} />
      <Route path="/notifications" element={<Notifications toast={toast} />} />
      <Route path="/projects" element={<Projects />} />
      <Route
        path="/projects/new"
        element={<FormPage type="project" toast={toast} />}
      />
      <Route path="/projects/:projectId/*" element={<ProjectDetail />} />
      <Route path="/backlog" element={<BacklogLive toast={toast} />} />
      <Route path="/board" element={<Board toast={toast} />} />
      <Route path="/cycles" element={<CyclesLive toast={toast} />} />
      <Route path="/sprints" element={<SprintsLive toast={toast} />} />
      <Route path="/sla" element={<SlaPage toast={toast} />} />
      <Route
        path="/sprints/new"
        element={<FormPage type="sprint" toast={toast} />}
      />
      <Route path="/sprints/:sprintId" element={<SprintDetail />} />
      <Route path="/sprints/:sprintId/risk" element={<RiskPage />} />
      <Route
        path="/sprints/:sprintId/complete"
        element={<CompleteSprint toast={toast} />}
      />
      <Route path="/sprint-risk" element={<RiskPage />} />
      <Route path="/tickets" element={<TicketList />} />
      <Route
        path="/tickets/new"
        element={<FormPage type="ticket" toast={toast} />}
      />
      <Route
        path="/tickets/:ticketId"
        element={<TicketDetailLive toast={toast} />}
      />
      <Route path="/team" element={<Team />} />
      <Route
        path="/team/invite"
        element={<FormPage type="invite" toast={toast} />}
      />
      <Route path="/team/:userId" element={<UserDetail />} />
      <Route path="/reports/*" element={<Reports />} />
      <Route path="/ai/*" element={<AIPage />} />
      <Route path="/resources/*" element={<ResourcesLive toast={toast} />} />
      <Route
        path="/organization"
        element={
          <AdminOnly>
            <OrganizationLive toast={toast} />
          </AdminOnly>
        }
      />
      <Route
        path="/settings/*"
        element={
          <Settings density={density} setDensity={setDensity} toast={toast} />
        }
      />
      <Route
        path="/change-password"
        element={<ChangePasswordLive toast={toast} />}
      />
      <Route path="/sessions" element={<Sessions toast={toast} />} />
      <Route
        path="/integrations/*"
        element={
          <AdminOnly>
            <IntegrationsLive toast={toast} />
          </AdminOnly>
        }
      />
      <Route
        path="/audit-logs"
        element={
          <AdminOnly>
            <AuditLogsLive />
          </AdminOnly>
        }
      />
      <Route
        path="/import"
        element={
          <AdminOnly>
            <ImportExportLive toast={toast} />
          </AdminOnly>
        }
      />
      <Route
        path="/export"
        element={
          <AdminOnly>
            <ImportExportLive toast={toast} />
          </AdminOnly>
        }
      />
      <Route path="/403" element={<ErrorPage code="403" />} />
      <Route path="/500" element={<ErrorPage code="500" />} />
      <Route path="/offline" element={<ErrorPage code="Offline" />} />
      <Route path="*" element={<ErrorPage code="404" />} />
    </Routes>
  );
}

function AdminOnly({ children }: { children: React.ReactNode }) {
  const { role } = useWorkspace();
  return role === "admin" ? <>{children}</> : <Navigate to="/403" replace />;
}

function Projects() {
  const { projects, people, role } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();

  const q = params.get("q") || "";
  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";
  const view = params.get("view") || "grid";

  // Filter
  const filtered = projects.filter((p) => {
    const matchesQuery =
      p.name.toLowerCase().includes(q.toLowerCase()) ||
      p.key.toLowerCase().includes(q.toLowerCase()) ||
      p.description.toLowerCase().includes(q.toLowerCase());
    const matchesFilter = filter === "open" ? p.status === "active" : true;
    return matchesQuery && matchesFilter;
  });

  // Sort
  const sorted = [...filtered].sort((a, b) => {
    const valA = a.name.toLowerCase();
    const valB = b.name.toLowerCase();
    if (sort === "desc") {
      return valA > valB ? -1 : valA < valB ? 1 : 0;
    } else {
      return valA < valB ? -1 : valA > valB ? 1 : 0;
    }
  });

  const isLeader = ["admin", "manager"].includes(role);

  return (
    <>
      <PageHead
        title="Projects"
        desc="Plan, track, and deliver work across every initiative."
      >
        {isLeader && (
          <>
            <button className="btn" onClick={() => nav("/import")}>
              <Icons.Upload />
              Import
            </button>
            <button
              className="btn primary"
              onClick={() => nav("/projects/new")}
            >
              <Icons.Plus />
              New project
            </button>
          </>
        )}
      </PageHead>
      <FilterBar placeholder="Search projects…" />
      {view === "list" ? (
        <div className="card no-pad">
          <table className="table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Key</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Members</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((p) => (
                <tr
                  key={p.key}
                  onClick={() => nav(`/projects/${p.key}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <b>{p.name}</b>
                  </td>
                  <td>
                    <code>{p.key}</code>
                  </td>
                  <td>
                    <Badge tone={p.risk === "high" ? "orange" : "green"}>
                      {p.risk} risk
                    </Badge>
                  </td>
                  <td>{p.progress}%</td>
                  <td>{p.members} members</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="project-grid">
          {sorted.map((p, i) => (
            <article
              className="project-card"
              key={p.key}
              onClick={() => nav(`/projects/${p.key}`)}
            >
              <div className="project-top">
                <span className={`project-icon p${i % 4}`}>
                  {p.key.slice(0, 2)}
                </span>
                <Badge tone={p.risk}>{p.risk} risk</Badge>
              </div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <div className="project-meta">
                <span>
                  <Icons.Timer /> {p.sprint}
                </span>
                <span>
                  <Icons.Users /> {p.members}
                </span>
              </div>
              <div className="progress-label">
                <span>Progress</span>
                <b>{p.progress}%</b>
              </div>
              <Progress
                value={p.progress}
                tone={p.risk === "high" ? "orange" : "purple"}
              />
              <div className="avatar-stack">
                {people.slice(0, 3).map((x: any) => (
                  <Avatar key={x.name} name={x.name} color={x.color} />
                ))}
                <span>+{Math.max(0, p.members - 3)}</span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function ProjectSettings({
  project,
  refetch,
  toast,
}: {
  project: any;
  refetch: () => Promise<void>;
  toast: (s: string) => void;
}) {
  const { dashboard } = useWorkspace();
  const nav = useNavigate();
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [status, setStatus] = useState(project.status || "active");
  const [riskLevel, setRiskLevel] = useState(project.risk || "medium");
  const [busy, setBusy] = useState(false);

  // Members selection
  const allUsers = dashboard?.users || [];
  const dashboardProj = (dashboard?.projects || []).find(
    (x: any) => x.key === project.key,
  );
  const currentMemberIds = (dashboardProj?.members || []).map(
    (m: any) => m._id || m,
  );
  const [selectedMembers, setSelectedMembers] =
    useState<string[]>(currentMemberIds);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(`/projects/${dashboardProj._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description, status, riskLevel }),
      });
      toast("Project updated successfully");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed");
    } finally {
      setBusy(false);
    }
  };

  const updateMembers = async () => {
    try {
      await api(`/projects/${dashboardProj._id}/members`, {
        method: "PUT",
        body: JSON.stringify({ userIds: selectedMembers }),
      });
      toast("Project members updated");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed");
    }
  };

  const archive = async () => {
    try {
      await api(`/projects/${dashboardProj._id}/archive`, { method: "POST" });
      toast("Project archived");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Archive failed");
    }
  };

  const restore = async () => {
    try {
      await api(`/projects/${dashboardProj._id}/restore`, { method: "POST" });
      toast("Project restored");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Restore failed");
    }
  };

  const remove = async () => {
    const confirmation = window.prompt(
      `Type ${project.key} to permanently delete this project.`,
    );
    if (confirmation !== project.key) return;
    try {
      await api(`/projects/${dashboardProj._id}`, { method: "DELETE" });
      toast("Project deleted");
      nav("/projects");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleMemberToggle = (userId: string) => {
    setSelectedMembers((prev) =>
      prev.includes(userId)
        ? prev.filter((id) => id !== userId)
        : [...prev, userId],
    );
  };

  return (
    <div className="project-settings">
      <div className="two-col">
        <section className="card">
          <CardTitle title="Project details" />
          <form onSubmit={save} className="form-grid">
            <label className="field full">
              <span>Project name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="planning">Planning</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="done">Done</option>
              </select>
            </label>
            <label className="field">
              <span>Risk level</span>
              <select
                value={riskLevel}
                onChange={(e) => setRiskLevel(e.target.value)}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
              />
            </label>
            <button className="btn primary" type="submit" disabled={busy}>
              Save details
            </button>
          </form>
        </section>

        <section className="card">
          <CardTitle title="Manage members" />
          <div
            className="member-list"
            style={{
              maxHeight: "250px",
              overflowY: "auto",
              marginBottom: "1rem",
            }}
          >
            {allUsers.map((u: any) => (
              <label
                key={u._id}
                className="check"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  margin: "8px 0",
                  cursor: "pointer",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedMembers.includes(u._id)}
                  onChange={() => handleMemberToggle(u._id)}
                />
                <span>
                  <b>{u.name}</b> ({u.role})
                </span>
              </label>
            ))}
          </div>
          <button className="btn" onClick={updateMembers}>
            Update members
          </button>
        </section>
      </div>

      <section className="card danger-zone" style={{ marginTop: "2rem" }}>
        <CardTitle
          title="Danger zone"
          sub="Archive or permanently delete this project."
        />
        <div style={{ display: "flex", gap: "12px", marginTop: "1rem" }}>
          {status === "done" ? (
            <button className="btn" onClick={restore}>
              Restore project
            </button>
          ) : (
            <button className="btn warning" onClick={archive}>
              Archive project
            </button>
          )}
          <button className="btn danger" onClick={remove}>
            Delete project
          </button>
        </div>
      </section>
    </div>
  );
}

function ProjectDetail() {
  const { projectId } = useParams();
  const { projects, tickets, refetch, toast, role } = useWorkspace();
  const nav = useNavigate();
  const loc = useLocation();

  const p = projects.find((x) => x.key === projectId);
  if (!p)
    return (
      <Empty
        title="Project not found"
        body="The requested project key does not exist."
        action={{ label: "Back to projects", to: "/projects" }}
      />
    );

  const tab = loc.pathname.endsWith("/settings")
    ? "Settings"
    : loc.pathname.endsWith("/board")
      ? "Board"
      : loc.pathname.endsWith("/backlog")
        ? "Backlog"
        : loc.pathname.endsWith("/sprints")
          ? "Sprints"
          : loc.pathname.endsWith("/tickets")
            ? "Tickets"
            : "Overview";

  // Filter project tickets
  const projTickets = tickets.filter((t) => t.project === p.name);

  return (
    <>
      <PageHead eyebrow={p.key} title={p.name} desc={p.description}>
        <button className="btn" onClick={() => nav("/team")}>
          <Icons.UserPlus />
          Members
        </button>
        {role === "admin" || role === "manager" ? (
          <button className="btn primary" onClick={() => nav("/tickets/new")}>
            <Icons.Plus />
            Add ticket
          </button>
        ) : null}
      </PageHead>
      <div className="tabs">
        {["Overview", "Board", "Backlog", "Sprints", "Tickets", "Settings"].map(
          (x) => (
            <button
              className={x === tab ? "active" : ""}
              onClick={() =>
                nav(
                  x === "Overview"
                    ? `/projects/${p.key}`
                    : `/projects/${p.key}/${x.toLowerCase()}`,
                )
              }
              key={x}
            >
              {x}
            </button>
          ),
        )}
      </div>

      {tab === "Overview" && (
        <>
          <div className="metrics compact">
            <article className="metric">
              <div>
                <span>Progress</span>
                <strong>{p.progress}%</strong>
                <small>Across current scope</small>
              </div>
            </article>
            <article className="metric">
              <div>
                <span>Open work</span>
                <strong>
                  {projTickets.filter((t) => t.status !== "Done").length}
                </strong>
                <small>
                  {projTickets.filter((t) => t.blocked).length} blocked
                </small>
              </div>
            </article>
            <article className="metric">
              <div>
                <span>Team</span>
                <strong>{p.members}</strong>
                <small>contributors</small>
              </div>
            </article>
            <article className="metric">
              <div>
                <span>Risk</span>
                <strong>{fmt(p.risk)}</strong>
                <small>Stable this week</small>
              </div>
            </article>
          </div>
          <div className="two-col">
            <section className="card">
              <CardTitle
                title="Recent work"
                sub="Updates across this project"
              />
              <TicketTable rows={projTickets.slice(0, 4)} />
            </section>
            <section className="card">
              <CardTitle title="Milestones" />
              <div className="timeline">
                {[
                  "Design system ready",
                  "Private beta",
                  "General availability",
                ].map((x, i) => (
                  <div key={x}>
                    <i className={i === 0 ? "done" : ""} />
                    <span>
                      <b>{x}</b>
                      <small>
                        {i === 0 ? "Completed 8 Jul" : `Due ${18 + i * 7} Jul`}
                      </small>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}

      {tab === "Board" && <Board toast={toast} projectFilter={p.name} />}

      {tab === "Backlog" && (
        <BacklogLive toast={toast} projectFilter={p.name} />
      )}

      {tab === "Sprints" && (
        <SprintsLive toast={toast} projectFilter={p.name} />
      )}

      {tab === "Tickets" && (
        <section className="card no-pad">
          <TicketTable rows={projTickets} />
        </section>
      )}

      {tab === "Settings" && (
        <ProjectSettings project={p} refetch={refetch} toast={toast} />
      )}
    </>
  );
}

function matchesTicket(
  ticket: Pick<Ticket, "title" | "key" | "labels">,
  query: string,
  selectedLabel: string,
) {
  const needle = query.trim().toLocaleLowerCase();
  const labelNeedle = selectedLabel.trim().toLocaleLowerCase();
  const labels = (ticket.labels || []).map((label) => String(label));
  const matchesQ =
    !needle ||
    [ticket.title, ticket.key, ...labels].some((value) =>
      String(value || "").toLocaleLowerCase().includes(needle),
    );
  const matchesLabel =
    !labelNeedle ||
    labels.some((label) => label.toLocaleLowerCase() === labelNeedle);
  return matchesQ && matchesLabel;
}

function TicketTable({ rows }: { rows?: Ticket[] }) {
  const { tickets: wsTickets } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const filter = params.get("filter") || "";
  const selectedLabel = params.get("label") || "";
  const sort = params.get("sort") || "";

  const data = rows || wsTickets;

  // Filter
  const filtered = data.filter((t) => {
    const matchesQ = matchesTicket(t, q, selectedLabel);
    const matchesFilter = filter === "open" ? t.status !== "Done" : true;
    return matchesQ && matchesFilter;
  });

  // Sort
  const sorted = sort
    ? [...filtered].sort((a, b) => {
        const valA = a.title.toLowerCase();
        const valB = b.title.toLowerCase();
        if (sort === "desc") {
          return valA > valB ? -1 : valA < valB ? 1 : 0;
        } else {
          return valA < valB ? -1 : valA > valB ? 1 : 0;
        }
      })
    : filtered;

  const slaTone = (status?: Ticket["slaStatus"]) =>
    status === "breached"
      ? "critical"
      : status === "due_soon"
        ? "high"
        : status === "resolved"
          ? "green"
          : "lime";

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>Priority</th>
            <th>SLA</th>
            <th>Assignee</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((t) => (
            <tr
              key={t.id}
              onClick={() => nav(`/tickets/${t.key}`)}
              style={{ cursor: "pointer" }}
            >
              <td>
                <small>{t.key}</small>
                <b>{t.title}</b>
                <LabelChips labels={t.labels} />
              </td>
              <td>
                <Badge tone={t.status.toLowerCase().replaceAll(" ", "")}>
                  {t.status}
                </Badge>
              </td>
              <td>
                <Badge tone={t.priority}>
                  <i className="dot" />
                  {fmt(t.priority)}
                </Badge>
              </td>
              <td>
                <Badge tone={slaTone(t.slaStatus)}>
                  {fmt(t.slaStatus || "healthy")}
                </Badge>
              </td>
              <td>
                <span className="person">
                  <Avatar name={t.assignee} />
                  {t.assignee}
                </span>
              </td>
              <td>{t.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TicketList() {
  const nav = useNavigate();
  const { role, labelOptions } = useWorkspace();
  const isLeader = role === "admin" || role === "manager";
  return (
    <>
      <PageHead
        title="Tickets"
        desc="Find and manage work across your organization."
      >
        {isLeader && (
          <button className="btn primary" onClick={() => nav("/tickets/new")}>
            <Icons.Plus />
            New ticket
          </button>
        )}
      </PageHead>
      <FilterBar
        placeholder="Search by key, title, or label…"
        labelOptions={labelOptions}
      />
      <section className="card no-pad">
        <TicketTable />
      </section>
    </>
  );
}
function Board({
  toast,
  projectFilter,
}: {
  toast: (s: string) => void;
  projectFilter?: string;
}) {
  const {
    tickets: wsTickets,
    people: wsPeople,
    dashboard,
    mutate,
    role,
    labelOptions,
  } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const selectedLabel = params.get("label") || "";
  const [view, setView] = useState<"board" | "list">("board");
  const [filters, setFilters] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);
  const [draggedTicket, setDraggedTicket] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Bulk actions fields
  const [bulkStatus, setBulkStatus] = useState("");
  const [bulkPriority, setBulkPriority] = useState("");
  const [bulkAssignee, setBulkAssignee] = useState("");
  const [bulkSprint, setBulkSprint] = useState("");

  const statuses: TicketStatus[] = [
    "Backlog",
    "To Do",
    "In Progress",
    "In Review",
    "Done",
  ];

  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";

  // Filter tickets
  const filteredTickets = wsTickets.filter((t) => {
    if (projectFilter && t.project !== projectFilter) return false;
    const matchesQ = matchesTicket(t, q, selectedLabel);
    const matchesFilter = filter === "open" ? t.status !== "Done" : true;
    return matchesQ && matchesFilter;
  });

  // Sort tickets
  const activeTickets = sort
    ? [...filteredTickets].sort((a, b) => {
        const valA = a.title.toLowerCase();
        const valB = b.title.toLowerCase();
        if (sort === "desc") {
          return valA > valB ? -1 : valA < valB ? 1 : 0;
        } else {
          return valA < valB ? -1 : valA > valB ? 1 : 0;
        }
      })
    : [...filteredTickets].sort((a, b) => (a.rank || 0) - (b.rank || 0));

  const dropTicket = async (
    ticketId: string,
    status: TicketStatus,
    beforeId?: string,
  ) => {
    const ticket = activeTickets.find((item) => item.id === ticketId);
    if (!ticket || beforeId === ticketId) return;

    const destination = activeTickets.filter(
      (item) => item.status === status && item.id !== ticketId,
    );
    const insertionIndex = beforeId
      ? Math.max(0, destination.findIndex((item) => item.id === beforeId))
      : destination.length;
    destination.splice(insertionIndex, 0, { ...ticket, status });

    const updates = destination.map((item, index) => ({
      id: item.id,
      status,
      rank: (index + 1) * 1000,
    }));

    try {
      await mutate(
        () =>
          Promise.all(
            updates.map((item) =>
              api(`/tickets/${item.id}/rank`, {
                method: "PATCH",
                body: JSON.stringify({
                  rank: item.rank,
                  ...(item.id === ticketId ? { status } : {}),
                }),
              }),
            ),
          ),
        (prev) => ({
          ...prev,
          tickets: prev.tickets.map((item: any) => {
            const update = updates.find((candidate) => candidate.id === item.id);
            return update ? { ...item, status: update.status, rank: update.rank } : item;
          }),
        }),
      );
      toast(`Ticket moved to ${status}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Move failed");
    } finally {
      setDraggedTicket(null);
      setDropTarget(null);
    }
  };

  const move = async (id: string, status: TicketStatus) => {
    try {
      await mutate(
        () =>
          api(`/tickets/${id}/status`, {
            method: "PATCH",
            body: JSON.stringify({ status }),
          }),
        (prev) => ({
          ...prev,
          tickets: prev.tickets.map((t: any) =>
            t.id === id ? { ...t, status } : t,
          ),
        }),
      );
      toast(`Ticket moved to ${status}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Move failed");
    }
  };

  const changeRank = async (
    id: string,
    currentRank: number,
    increment: number,
  ) => {
    const nextRank = (currentRank || 0) + increment;
    try {
      await mutate(
        () =>
          api(`/tickets/${id}/rank`, {
            method: "PATCH",
            body: JSON.stringify({ rank: nextRank }),
          }),
        (prev) => ({
          ...prev,
          tickets: prev.tickets.map((t: any) =>
            t.id === id ? { ...t, rank: nextRank } : t,
          ),
        }),
      );
      toast("Ticket rank updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Ranking failed");
    }
  };

  const handleBulkUpdate = async () => {
    if (!selectedTickets.length) return;
    const update: any = {};
    if (bulkStatus) update.status = bulkStatus;
    if (bulkPriority) update.priority = bulkPriority;
    if (bulkAssignee) update.assignee = bulkAssignee;
    if (bulkSprint) update.sprint = bulkSprint;
    if (!Object.keys(update).length) {
      toast("Choose at least one bulk change first");
      return;
    }

    try {
      await mutate(() =>
        api("/tickets/bulk", {
          method: "POST",
          body: JSON.stringify({ ids: selectedTickets, update }),
        }),
      );
      toast(`Bulk updated ${selectedTickets.length} tickets`);
      setSelectedTickets([]);
      setBulkStatus("");
      setBulkPriority("");
      setBulkAssignee("");
      setBulkSprint("");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk update failed");
    }
  };

  const isLeader = ["admin", "manager"].includes(role);

  return (
    <>
      <PageHead title="Sprint board" desc="Live delivery board.">
        <button
          className="btn"
          onClick={() => setFilters(!filters)}
          aria-pressed={filters}
        >
          <Icons.Filter />
          Filters
        </button>
        {isLeader && (
          <button className="btn primary" onClick={() => nav("/tickets/new")}>
            <Icons.Plus />
            Create ticket
          </button>
        )}
      </PageHead>
      {filters && (
        <FilterBar
          placeholder="Search tickets…"
          labelOptions={labelOptions}
        />
      )}
      <div className="board-toolbar">
        <div className="segmented">
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            Board
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            List
          </button>
        </div>
        <span>{activeTickets.length} tickets</span>
        <div className="avatar-stack">
          {wsPeople.map((p) => (
            <Avatar key={p.email} name={p.name} color={p.color} />
          ))}
        </div>
      </div>

      {selectedTickets.length > 0 && (
        <div
          className="card"
          style={{
            display: "flex",
            gap: "10px",
            alignItems: "center",
            padding: "10px",
            margin: "10px 0",
            background: "#f3f0fc",
            border: "1px solid #dcd3f9",
          }}
        >
          <span>
            <b>{selectedTickets.length}</b> selected:{" "}
          </span>
          <select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value)}
          >
            <option value="">(Change Status)</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={bulkPriority}
            onChange={(e) => setBulkPriority(e.target.value)}
          >
            <option value="">(Change Priority)</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <select
            value={bulkAssignee}
            onChange={(e) => setBulkAssignee(e.target.value)}
          >
            <option value="">(Change Assignee)</option>
            {(dashboard?.users || []).map((u: any) => (
              <option key={u._id} value={u._id}>
                {u.name}
              </option>
            ))}
          </select>
          <select
            value={bulkSprint}
            onChange={(e) => setBulkSprint(e.target.value)}
          >
            <option value="">(Change Sprint)</option>
            {(dashboard?.sprints || []).map((s: any) => (
              <option key={s._id} value={s._id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            className="btn primary"
            onClick={handleBulkUpdate}
            disabled={!bulkStatus && !bulkPriority && !bulkAssignee && !bulkSprint}
          >
            Apply
          </button>
          <button className="btn" onClick={() => setSelectedTickets([])}>
            Cancel
          </button>
        </div>
      )}

      {view === "list" ? (
        <section className="card no-pad">
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Ticket</th>
                  <th>Status</th>
                  <th>Priority</th>
                  <th>Assignee</th>
                  <th>Points</th>
                  <th>Rank</th>
                </tr>
              </thead>
              <tbody>
                {activeTickets.map((t) => (
                  <tr key={t.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedTickets.includes(t.id)}
                        onChange={() =>
                          setSelectedTickets((prev) =>
                            prev.includes(t.id)
                              ? prev.filter((x) => x !== t.id)
                              : [...prev, t.id],
                          )
                        }
                      />
                    </td>
                    <td
                      onClick={() => nav(`/tickets/${t.key}`)}
                      style={{ cursor: "pointer" }}
                    >
                      <small>{t.key}</small>
                      <b>{t.title}</b>
                      <LabelChips labels={t.labels} />
                    </td>
                    <td>
                      <Badge tone={t.status.toLowerCase().replaceAll(" ", "")}>
                        {t.status}
                      </Badge>
                    </td>
                    <td>
                      <Badge tone={t.priority}>{t.priority}</Badge>
                    </td>
                    <td>{t.assignee}</td>
                    <td>{t.points}</td>
                    <td>
                      <button
                        className="icon-btn"
                        onClick={() => changeRank(t.id, t.rank || 0, 1)}
                      >
                        <Icons.ChevronUp size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        onClick={() => changeRank(t.id, t.rank || 0, -1)}
                      >
                        <Icons.ChevronDown size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : (
        <div className="kanban">
          {statuses.map((s) => (
            <section
              key={s}
              className={dropTarget === `column:${s}` ? "drag-over" : ""}
              onDragOver={(event) => {
                event.preventDefault();
                if (event.target === event.currentTarget || !(event.target as HTMLElement).closest(".ticket-card")) {
                  setDropTarget(`column:${s}`);
                }
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedTicket) void dropTicket(draggedTicket, s);
              }}
            >
              <header>
                <i className={s.replaceAll(" ", "").toLowerCase()} />
                <b>{s}</b>
                <span>
                  {activeTickets.filter((t) => t.status === s).length}
                </span>
              </header>
              {activeTickets
                .filter((t) => t.status === s)
                .map((t) => (
                  <article
                    className={`ticket-card${draggedTicket === t.id ? " dragging" : ""}${dropTarget === `ticket:${t.id}` ? " drag-before" : ""}`}
                    key={t.id}
                    draggable
                    onDragStart={(event) => {
                      setDraggedTicket(t.id);
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", t.id);
                    }}
                    onDragEnd={() => {
                      setDraggedTicket(null);
                      setDropTarget(null);
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (draggedTicket !== t.id) setDropTarget(`ticket:${t.id}`);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (draggedTicket) void dropTicket(draggedTicket, s, t.id);
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                      }}
                    >
                      <label
                        style={{
                          display: "flex",
                          gap: "5px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedTickets.includes(t.id)}
                          onChange={() =>
                            setSelectedTickets((prev) =>
                              prev.includes(t.id)
                                ? prev.filter((x) => x !== t.id)
                                : [...prev, t.id],
                            )
                          }
                        />
                        <small>{t.key}</small>
                      </label>
                      {t.blocked && (
                        <Badge tone="red">
                          <Icons.CircleSlash2 />
                          Blocked
                        </Badge>
                      )}
                    </div>
                    <h3
                      onClick={() => nav(`/tickets/${t.key}`)}
                      style={{ cursor: "pointer" }}
                    >
                      {t.title}
                    </h3>
                    <LabelChips labels={t.labels} />
                    <div className="ticket-foot">
                      <Badge tone={t.priority}>
                        <i className="dot" />
                        {t.priority}
                      </Badge>
                      <span>{t.points} pts</span>
                      <Avatar name={t.assignee} />
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "8px",
                      }}
                    >
                      <select
                        value={t.status}
                        aria-label="Move ticket"
                        onChange={(e) =>
                          move(t.id, e.target.value as TicketStatus)
                        }
                      >
                        {statuses.map((x) => (
                          <option key={x}>{x}</option>
                        ))}
                      </select>
                      <div>
                        <button
                          className="icon-btn"
                          onClick={() => changeRank(t.id, t.rank || 0, 1)}
                        >
                          <Icons.ChevronUp size={14} />
                        </button>
                        <button
                          className="icon-btn"
                          onClick={() => changeRank(t.id, t.rank || 0, -1)}
                        >
                          <Icons.ChevronDown size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              {isLeader && (
                <button
                  className="add-card"
                  onClick={() => nav("/tickets/new")}
                >
                  <Icons.Plus />
                  Add ticket
                </button>
              )}
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function SprintDetail() {
  const { sprintId } = useParams();
  const { dashboard, tickets, mutate, role, toast } = useWorkspace();
  const nav = useNavigate();

  const s = (dashboard?.sprints || []).find((x: any) => x._id === sprintId);
  if (!s)
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint does not exist."
        action={{ label: "Back to sprints", to: "/sprints" }}
      />
    );

  const progress = s.plannedPoints
    ? Math.round((s.completedPoints / s.plannedPoints) * 100)
    : 0;

  // Time remaining
  let timeRemaining = "Planned";
  if (s.status === "active") {
    const diff = new Date(s.endDate).getTime() - Date.now();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    timeRemaining = days > 0 ? `${days} days` : "Ends today";
  } else if (s.status === "completed") {
    timeRemaining = "Completed";
  }

  // Sprint tickets
  const sprintTickets = tickets.filter((t) => t.sprintId === s._id);
  const cycle = (dashboard?.cycles || []).find((item: any) =>
    (item.sprints || []).some((sprint: any) => String(sprint._id || sprint) === String(s._id)),
  );

  const startSprint = async () => {
    try {
      await mutate(() => api(`/sprints/${s._id}/start`, { method: "POST" }));
      toast("Sprint started successfully");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to start sprint");
    }
  };

  const reopenSprint = async () => {
    try {
      await mutate(() => api(`/sprints/${s._id}/reopen`, { method: "POST" }));
      toast("Sprint reopened");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to reopen sprint");
    }
  };

  const deleteSprint = async () => {
    if (!window.confirm("Are you sure you want to delete this sprint?")) return;
    try {
      await mutate(() => api(`/sprints/${s._id}`, { method: "DELETE" }));
      toast("Sprint deleted");
      nav("/sprints");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete sprint");
    }
  };

  const isLeader = ["admin", "manager"].includes(role);

  // Status breakdown
  const statuses = ["Backlog", "To Do", "In Progress", "In Review", "Done"];
  const breakdownData = statuses.map((st) => ({
    name: st,
    v: sprintTickets.filter((t) => t.status === st).length,
  }));

  return (
    <>
      <PageHead
        eyebrow={s.status.toUpperCase()}
        title={s.name}
        desc={`${s.project?.name || "Project"} · ${new Date(s.startDate).toLocaleDateString()}–${new Date(s.endDate).toLocaleDateString()}`}
      >
        <button className="btn" onClick={() => nav(`/sprints/${s._id}/risk`)}>
          <Icons.Activity />
          View risk
        </button>
        {s.status === "planned" && isLeader && (
          <button className="btn lime" onClick={startSprint}>
            Start sprint
          </button>
        )}
        {s.status === "active" && isLeader && (
          <button
            className="btn primary"
            onClick={() => nav(`/sprints/${s._id}/complete`)}
          >
            Complete sprint
          </button>
        )}
        {s.status === "completed" && isLeader && (
          <button className="btn" onClick={reopenSprint}>
            Reopen sprint
          </button>
        )}
        {isLeader && (
          <button className="btn danger" onClick={deleteSprint}>
            Delete
          </button>
        )}
      </PageHead>
      <div className="metrics compact">
        <article className="metric">
          <div>
            <span>Progress</span>
            <strong>{progress}%</strong>
            <small>
              {s.completedPoints} of {s.plannedPoints} points
            </small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Status</span>
            <strong>{s.status}</strong>
            <small>{timeRemaining}</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Risk score</span>
            <strong>{s.riskScore}</strong>
            <small>Out of 100</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Cycle</span>
            <strong>{cycle?.name || "None"}</strong>
            <small>{cycle ? `${cycle.status} cycle` : "not grouped"}</small>
          </div>
        </article>
      </div>
      <div className="two-col">
        <section className="card">
          <CardTitle title="Sprint velocity / history" />
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart
                data={(s.velocityHistory || []).map(
                  (v: number, idx: number) => ({ n: `S${idx + 1}`, v }),
                )}
              >
                <XAxis dataKey="n" />
                <YAxis />
                <Tooltip />
                <Area dataKey="v" stroke="#A47BEF" fill="#A47BEF33" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <CardTitle title="Status breakdown" />
          <div className="donut">
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={breakdownData}
                  dataKey="v"
                  innerRadius={55}
                  outerRadius={78}
                >
                  {["#EAEAEA", "#4F86F7", "#F4C430", "#A47BEF", "#4CC38A"].map(
                    (c) => (
                      <Cell key={c} fill={c} />
                    ),
                  )}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <strong>
              {sprintTickets.length}
              <small>tickets</small>
            </strong>
          </div>
        </section>
      </div>
      <section className="card">
        <CardTitle title="Sprint work" />
        <TicketTable rows={sprintTickets} />
      </section>
    </>
  );
}

function CompleteSprint({ toast }: { toast: (s: string) => void }) {
  const { sprintId } = useParams();
  const { dashboard, tickets, mutate, role } = useWorkspace();
  const nav = useNavigate();
  const [destinationSprintId, setDestinationSprintId] = useState("");
  const isLeader = role === "admin" || role === "manager";

  const s = (dashboard?.sprints || []).find((x: any) => x._id === sprintId);
  if (!s)
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint does not exist."
        action={{ label: "Back to sprints", to: "/sprints" }}
      />
    );
  if (!isLeader) return <ErrorPage code="403" />;

  const sprintTickets = tickets.filter((t) => t.sprintId === s._id);
  const completedTickets = sprintTickets.filter((t) => t.status === "Done");
  const incompleteTickets = sprintTickets.filter((t) => t.status !== "Done");

  const completedPoints = completedTickets.reduce(
    (sum, t) => sum + (t.points || 0),
    0,
  );
  const incompletePoints = incompleteTickets.reduce(
    (sum, t) => sum + (t.points || 0),
    0,
  );
  const completionRate = s.plannedPoints
    ? Math.round((completedPoints / s.plannedPoints) * 100)
    : 0;

  // Get other sprints for moving work to
  const otherSprints = (dashboard?.sprints || []).filter(
    (x: any) => x._id !== s._id && x.status === "planned",
  );
  const handleComplete = async () => {
    try {
      await mutate(() =>
        api(`/sprints/${s._id}/complete`, {
          method: "POST",
          body: JSON.stringify({
            moveIncompleteToSprint: destinationSprintId || null,
          }),
        }),
      );
      toast("Sprint completed successfully");
      nav(`/sprints/${s._id}`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to complete sprint");
    }
  };

  return (
    <CenteredForm
      title={`Complete ${s.name}`}
      desc="Review the outcome and decide where incomplete work should move."
    >
      <div className="completion-summary">
        <div>
          <strong>{completedPoints}</strong>
          <span>Completed points</span>
        </div>
        <div>
          <strong>{incompletePoints}</strong>
          <span>Incomplete points</span>
        </div>
        <div>
          <strong>{completionRate}%</strong>
          <span>Completion rate</span>
        </div>
      </div>
      {incompleteTickets.length > 0 && (
        <label className="field">
          <span>Move incomplete work to</span>
          <select
            value={destinationSprintId}
            onChange={(e) => setDestinationSprintId(e.target.value)}
          >
            <option value="">Backlog</option>
            {otherSprints.map((os: any) => (
              <option key={os._id} value={os._id}>
                {os.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="callout warning">
        <Icons.AlertTriangle />
        <span>
          <b>{incompleteTickets.length} tickets will be moved.</b> This action
          updates their sprint assignment.
        </span>
      </div>
      <button className="btn primary wide" onClick={handleComplete}>
        Complete sprint
      </button>
    </CenteredForm>
  );
}

function RiskPage() {
  const { sprintId } = useParams();
  const { dashboard, tickets, mutate, toast, role } = useWorkspace();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const isLeader = role === "admin" || role === "manager";

  const s = sprintId
    ? (dashboard?.sprints || []).find((x: any) => String(x._id) === String(sprintId))
    : (dashboard?.sprints || []).find((x: any) => x.status === "active") || dashboard?.sprints?.[0];
  const sprintTickets = s ? tickets.filter((t) => t.sprintId === s._id) : [];

  const recalculateRisk = async () => {
    if (!s) return;
    setLoading(true);
    try {
      const plannedPoints = s.plannedPoints || 0;
      const capacity = s.capacity || 0;
      const blockedTickets = sprintTickets.filter((t) => t.blocked).length;
      const totalTickets = sprintTickets.length;

      const workload = sprintTickets.reduce(
        (sum: number, t: any) => sum + (t.points || 0),
        0,
      );

      const assigneePoints: Record<string, number> = {};
      sprintTickets.forEach((t: any) => {
        assigneePoints[t.assignee] =
          (assigneePoints[t.assignee] || 0) + (t.points || 0);
      });
      const focusLoad = Math.max(0, ...Object.values(assigneePoints));

      const uniqueLabels = new Set<string>();
      sprintTickets.forEach((t: any) =>
        t.labels.forEach((l: string) => uniqueLabels.add(l)),
      );
      const requiredSkills = uniqueLabels.size;

      const allSkills = new Set<string>();
      (dashboard?.users || []).forEach((u: any) =>
        (u.skills || []).forEach((sk: string) => allSkills.add(sk)),
      );
      const coveredSkills = allSkills.size;

      const velocityHistory = s.velocityHistory || [];

      const result = await api<any>("/analysis/sprint-risk", {
        method: "POST",
        body: JSON.stringify({
          plannedPoints,
          capacity,
          blockedTickets,
          totalTickets,
          workload,
          focusLoad,
          requiredSkills,
          coveredSkills,
          velocityHistory,
        }),
      });

      if (isLeader) {
        await mutate(() =>
          api(`/sprints/${s._id}`, {
            method: "PATCH",
            body: JSON.stringify({ riskScore: result.risk.finalScore }),
          }),
        );
      }

      setAnalysis(result);
      toast(
        isLeader
          ? "Sprint risk recalculated and saved successfully"
          : "Sprint risk recalculated",
      );
    } catch (err) {
      toast(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recalculateRisk();
  }, [sprintId, s?._id]);

  if (!s)
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint does not exist."
        action={{ label: "Back to sprints", to: "/sprints" }}
      />
    );

  const displayScore = analysis ? analysis.risk.finalScore : s.riskScore;
  let riskTone = "green";
  let riskLabel = "LOW RISK";
  if (displayScore > 75) {
    riskTone = "red";
    riskLabel = "CRITICAL RISK";
  } else if (displayScore > 50) {
    riskTone = "orange";
    riskLabel = "HIGH RISK";
  } else if (displayScore > 25) {
    riskTone = "yellow";
    riskLabel = "MEDIUM RISK";
  }

  const factors = [];
  if (analysis) {
    factors.push([
      "Sprint Utilisation",
      analysis.utilisation.explanation,
      `${analysis.utilisation.finalScore > 0 ? "+" : ""}${analysis.utilisation.finalScore}`,
      analysis.utilisation.finalScore > 50
        ? "red"
        : analysis.utilisation.finalScore > 25
          ? "orange"
          : "green",
    ]);
    factors.push([
      "Dependency Risk",
      analysis.dependency.explanation,
      `${analysis.dependency.finalScore > 0 ? "+" : ""}${analysis.dependency.finalScore}`,
      analysis.dependency.finalScore > 50
        ? "red"
        : analysis.dependency.finalScore > 25
          ? "orange"
          : "green",
    ]);
    factors.push([
      "Burnout & Workload",
      analysis.burnout.explanation,
      `${analysis.burnout.finalScore > 0 ? "+" : ""}${analysis.burnout.finalScore}`,
      analysis.burnout.finalScore > 50
        ? "red"
        : analysis.burnout.finalScore > 25
          ? "orange"
          : "green",
    ]);
    factors.push([
      "Skill Gap Risk",
      analysis.skillGap.explanation,
      `${analysis.skillGap.finalScore > 0 ? "+" : ""}${analysis.skillGap.finalScore}`,
      analysis.skillGap.finalScore > 50
        ? "red"
        : analysis.skillGap.finalScore > 25
          ? "orange"
          : "green",
    ]);
  } else {
    factors.push([
      "Sprint Utilisation",
      "Based on planned points vs capacity",
      "...",
      "yellow",
    ]);
  }

  return (
    <>
      <PageHead
        eyebrow="SPRINT INTELLIGENCE"
        title="Delivery risk"
        desc={`Explainable signals for ${s.name}.`}
      >
        <button className="btn" onClick={recalculateRisk} disabled={loading}>
          <Icons.RefreshCw className={loading ? "spin" : ""} />
          Recalculate
        </button>
      </PageHead>
      <div className="risk-hero">
        <div className="risk-score">
          <span>RISK SCORE</span>
          <strong>{displayScore}</strong>
          <Badge tone={riskTone}>{riskLabel}</Badge>
        </div>
        <div>
          <h2>
            {displayScore > 50
              ? "Delivery is at risk, but recoverable"
              : "Delivery is on track"}
          </h2>
          <p>
            {displayScore > 50
              ? "High utilization, skills constraints or blocked work are putting the sprint goal under pressure."
              : "Velocity is stable and capacity constraints are within healthy parameters."}
          </p>
          <Progress value={displayScore} tone={riskTone} />
          <div className="risk-scale">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
            <span>Critical</span>
          </div>
        </div>
      </div>
      <div className="two-col">
        <section className="card">
          <CardTitle
            title="Contributing factors"
            sub="Why the score was computed"
          />
          <div className="factor-list">
            {factors.map(([a, b, c, d]) => (
              <div key={a}>
                <i className={d} />
                <span>
                  <b>{a}</b>
                  <small>{b}</small>
                </span>
                <strong>{c}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="card recommendation">
          <Badge tone="lime">
            <Icons.Sparkles />
            RECOMMENDED ACTION
          </Badge>
          {displayScore > 50 ? (
            <>
              <h2>Review blocked tickets and load balance</h2>
              <p>
                Move blocked tickets back to backlog or reassign to
                unconstrained team members with matching skills.
              </p>
            </>
          ) : (
            <>
              <h2>Maintain current course</h2>
              <p>
                Sprint delivery is proceeding smoothly. No urgent capacity
                rebalancing required.
              </p>
            </>
          )}
        </section>
      </div>
    </>
  );
}

function MyWork() {
  const [view, setView] = useState("list");
  const [summary, setSummary] = useState<any>(null);
  const { tickets, labelOptions, dashboard, user } = useWorkspace();
  const currentUserId = String(user?._id || user?.id || "");
  useEffect(() => {
    api<any>("/my-work").then(setSummary).catch(() => setSummary(null));
  }, [dashboard]);
  const formatHours = (hours: number) => `${Number.isInteger(hours) ? hours : hours.toFixed(1)}h`;
  return (
    <>
      <PageHead
        title="My work"
        desc="Everything assigned to you, in one place."
      >
        <div className="segmented">
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <Icons.List />
            List
          </button>
          <button
            className={view === "board" ? "active" : ""}
            onClick={() => setView("board")}
          >
            <Icons.Columns3 />
            Board
          </button>
        </div>
      </PageHead>
      <div className="metrics compact">
        <article className="metric">
          <div>
            <span>Assigned to me</span>
            <strong>{summary?.assigned ?? 0}</strong>
            <small>Across {summary?.projects ?? 0} projects</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Due this week</span>
            <strong>{summary?.dueThisWeek ?? 0}</strong>
            <small>{summary?.dueThisWeekHighPriority ?? 0} high priority</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Logged this sprint</span>
            <strong>{formatHours(summary?.loggedHours ?? 0)}</strong>
            <small>Of {summary?.capacity ?? user?.capacity ?? 0}h capacity</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Watched</span>
            <strong>{summary?.watched ?? 0}</strong>
            <small>{summary?.watchedUpdatedToday ?? 0} updated today</small>
          </div>
        </article>
      </div>
      <FilterBar placeholder="Search my work…" labelOptions={labelOptions} />
      {view === "list" ? (
        <section className="card no-pad">
          <TicketTable
            rows={tickets.filter(
              (t) => t.assigneeId === currentUserId || t.watched,
            )}
          />
        </section>
      ) : (
        <Board toast={() => {}} />
      )}
    </>
  );
}

function Notifications({ toast }: { toast: (s: string) => void }) {
  const { notifications = [], mutate } = useWorkspace();
  const [unreadOnly, setUnreadOnly] = useState(false);

  const markAll = async () => {
    try {
      await mutate(() => api("/notifications/read-all", { method: "POST" }));
      toast("All notifications marked as read");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to mark all read");
    }
  };

  const markRead = async (id: string) => {
    try {
      await mutate(() => api(`/notifications/${id}/read`, { method: "PATCH" }));
      toast("Notification marked read");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Failed to mark notification read",
      );
    }
  };

  const displayList = notifications.filter(
    (item: any) => !unreadOnly || !item.readAt,
  );
  const unreadCount = notifications.filter((item: any) => !item.readAt).length;

  return (
    <>
      <PageHead title="Notifications" desc="Updates that need your attention.">
        <button className="btn" onClick={markAll}>
          <Icons.CheckCheck />
          Mark all read
        </button>
      </PageHead>
      <div className="tabs">
        <button
          className={!unreadOnly ? "active" : ""}
          onClick={() => setUnreadOnly(false)}
        >
          All <Badge tone="purple">{notifications.length}</Badge>
        </button>
        <button
          className={unreadOnly ? "active" : ""}
          onClick={() => setUnreadOnly(true)}
        >
          Unread{" "}
          <Badge tone={unreadCount > 0 ? "orange" : "neutral"}>
            {unreadCount}
          </Badge>
        </button>
      </div>
      <section className="card notification-list">
        {displayList.length ? (
          displayList.map((item: any) => {
            const Icon =
              item.type === "risk"
                ? Icons.Activity
                : item.type === "mention"
                  ? Icons.AtSign
                  : item.type === "webhook"
                    ? Icons.Webhook
                    : Icons.Ticket;
            return (
              <div className={!item.readAt ? "unread" : ""} key={item._id}>
                <span className={`notif-icon ${item.type}`}>
                  <Icon />
                </span>
                <span>
                  <b>{item.title}</b>
                  <p>{item.body}</p>
                  <small>{new Date(item.createdAt).toLocaleString()}</small>
                </span>
                {!item.readAt && (
                  <button
                    className="icon-btn"
                    aria-label={`Mark ${item.title} read`}
                    onClick={() => markRead(item._id)}
                  >
                    <Icons.Check />
                  </button>
                )}
              </div>
            );
          })
        ) : (
          <Empty title="No notifications" body="You’re all caught up." />
        )}
      </section>
    </>
  );
}

function Team() {
  const { dashboard, organization, role, refetch, toast } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const users = dashboard?.users || [];

  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";

  // Filter
  const filtered = users.filter((u: any) => {
    const matchesQ =
      u.name.toLowerCase().includes(q.toLowerCase()) ||
      u.email.toLowerCase().includes(q.toLowerCase()) ||
      (u.skills || []).some((s: string) =>
        s.toLowerCase().includes(q.toLowerCase()),
      );
    const matchesFilter = filter === "open" ? u.inviteStatus !== "disabled" : true;
    return matchesQ && matchesFilter;
  });

  // Sort
  const sorted = sort
    ? [...filtered].sort((a: any, b: any) => {
        const valA = a.name.toLowerCase();
        const valB = b.name.toLowerCase();
        if (sort === "desc") {
          return valA > valB ? -1 : valA < valB ? 1 : 0;
        } else {
          return valA < valB ? -1 : valA > valB ? 1 : 0;
        }
      })
    : filtered;

  const isAdmin = role === "admin";

  const resendInvite = async (userId: string) => {
    try {
      const res = await api<any>(`/invitations/${userId}/resend`, {
        method: "POST",
      });
      toast(
        "Invitation link resent: " +
          (res.inviteUrl
            ? res.inviteUrl
            : "Success"),
      );
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to resend invite");
    }
  };

  const cancelInvite = async (userId: string) => {
    if (!window.confirm("Cancel this invitation?")) return;
    try {
      await api(`/invitations/${userId}`, { method: "DELETE" });
      toast("Invitation cancelled");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to cancel invite");
    }
  };


  return (
    <>
      <PageHead
        title="Team"
        desc="Balance capacity and help everyone do their best work."
      >
        {isAdmin && (
          <button className="btn primary" onClick={() => nav("/team/invite")}>
            <Icons.UserPlus />
            Invite member
          </button>
        )}
      </PageHead>
      <FilterBar placeholder="Search people or skills…" />
      <div className="team-grid">
        {sorted.map((u: any) => {
          const weeklyCapacity = organization?.settings?.weeklyCapacityHours ?? 40;
          const workload = u.capacity
            ? Math.min(100, Math.round(((u.capacity || 0) / weeklyCapacity) * 100))
            : 0;
          return (
            <article
              className="card person-card"
              key={u._id}
              onClick={() => nav(`/team/${u._id}`)}
              style={{ cursor: "pointer" }}
            >
              <Avatar name={u.name} color={u.avatarColor || "#A47BEF"} />
              <div>
                <h2>{u.name}</h2>
                <p>{u.email}</p>
                <div style={{ display: "flex", gap: "5px", marginTop: "5px" }}>
                  <Badge tone={u.role === "admin" ? "purple" : "neutral"}>
                    {u.role}
                  </Badge>
                  <Badge
                    tone={
                      u.inviteStatus === "invited"
                        ? "orange"
                        : u.inviteStatus === "disabled"
                          ? "red"
                          : "green"
                    }
                  >
                    {u.inviteStatus}
                  </Badge>
                </div>
              </div>
              {isAdmin && u.inviteStatus === "invited" && (
                <div
                  style={{ display: "flex", justifyContent: "flex-end" }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div style={{ display: "flex", gap: "5px" }}>
                    <button
                      className="btn text-btn"
                      onClick={() => resendInvite(u._id)}
                    >
                      Resend
                    </button>
                    <button
                      className="btn text-btn danger"
                      onClick={() => cancelInvite(u._id)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              <div className="skills">
                {(u.skills || []).map((s: string) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
              <div className="capacity">
                <span>
                  <b>Capacity load</b>
                  <strong>{workload}%</strong>
                </span>
                <Progress
                  value={workload}
                  tone={workload > 80 ? "orange" : "purple"}
                />
                <small>{u.capacity || 0} of {weeklyCapacity} hours available</small>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}

function UserDetail() {
  const { userId } = useParams();
  const {
    dashboard,
    tickets,
    refetch,
    toast,
    role,
    user: currentUser,
  } = useWorkspace();
  const [editing, setEditing] = useState(false);

  const u = (dashboard?.users || []).find((x: any) => x._id === userId);
  if (!u)
    return (
      <Empty
        title="User not found"
        body="The requested team member does not exist."
        action={{ label: "Back to team", to: "/team" }}
      />
    );

  // Edit fields
  const [name, setName] = useState(u.name);
  const [userRole, setUserRole] = useState(u.role);
  const [availability, setAvailability] = useState(u.availability ?? 1);
  const [capacity, setCapacity] = useState(u.capacity ?? 40);
  const [skillsStr, setSkillsStr] = useState((u.skills || []).join(", "));
  const [avatarColor, setAvatarColor] = useState(u.avatarColor || "#A47BEF");

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const skills = skillsStr
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      await api(`/users/${u._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name,
          ...(isAdmin ? { role: userRole } : {}),
          availability: Number(availability),
          capacity: Number(capacity),
          skills,
          avatarColor,
        }),
      });
      toast("Profile updated successfully");
      setEditing(false);
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed");
    }
  };

  const isAdmin = role === "admin";
  const isSelf = currentUser?.id === u._id;
  const canEdit = isAdmin || isSelf;

  const workload = u.capacity
    ? Math.min(100, Math.round(((u.capacity || 0) / 40) * 100))
    : 0;
  const userTickets = tickets.filter((t) => t.assignee === u.name);

  return (
    <>
      <PageHead title={u.name} desc={`${fmt(u.role)} · ${u.email}`}>
        {canEdit && !editing && (
          <button className="btn" onClick={() => setEditing(true)}>
            <Icons.Pencil />
            Edit profile
          </button>
        )}
      </PageHead>

      {editing ? (
        <section
          className="card form-card"
          style={{ maxWidth: "600px", margin: "20px 0" }}
        >
          <CardTitle title="Edit profile details" />
          <form onSubmit={save} className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select
                value={userRole}
                onChange={(e) => setUserRole(e.target.value)}
                disabled={!isAdmin}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="engineer">Engineer</option>
                <option value="designer">Designer</option>
              </select>
            </label>
            <label className="field">
              <span>Availability (0.0 to 1.0)</span>
              <input
                type="number"
                step="0.1"
                min="0"
                max="1"
                value={availability}
                onChange={(e) => setAvailability(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Capacity (hours per week)</span>
              <input
                type="number"
                min="0"
                max="168"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Avatar color</span>
              <input
                type="color"
                value={avatarColor}
                onChange={(e) => setAvatarColor(e.target.value)}
              />
            </label>
            <label className="field full">
              <span>Skills (comma separated)</span>
              <input
                value={skillsStr}
                onChange={(e) => setSkillsStr(e.target.value)}
                placeholder="React, Node.js, Mongoose"
              />
            </label>
            <div style={{ display: "flex", gap: "10px", marginTop: "1rem" }}>
              <button className="btn primary" type="submit">
                Save changes
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setEditing(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : (
        <>
          <div className="profile-hero card">
            <Avatar name={u.name} color={u.avatarColor || "#A47BEF"} />
            <div>
              <h2>{u.name}</h2>
              <p>
                Team member status: <b>{u.inviteStatus}</b>
              </p>
              <div className="skills">
                {(u.skills || []).map((s: string) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
            <div className="profile-stats">
              <span>
                <strong>
                  {userTickets.filter((t) => t.status !== "Done").length}
                </strong>
                Open tickets
              </span>
              <span>
                <strong>{u.capacity || 0}h</strong>Capacity
              </span>
              <span>
                <strong>{workload}%</strong>Allocation
              </span>
            </div>
          </div>
          <div className="two-col">
            <section className="card">
              <CardTitle title="Current workload" />
              <TicketTable rows={userTickets} />
            </section>
            <section className="card">
              <CardTitle title="Capacity" />
              <div className="big-progress">
                <strong>{workload}%</strong>
                <Progress value={workload} />
                <p>{u.capacity || 0} of 40 available hours allocated</p>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}

function Reports() {
  const { dashboard, reports: report, tickets } = useWorkspace();
  const [tab, setTab] = useState("Overview");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedMember, setSelectedMember] = useState("All");
  const [startDateStr, setStartDateStr] = useState("");

  const sprints = dashboard?.sprints || [];
  const users = dashboard?.users || [];

  // Filter sprints/tickets dynamically
  const filteredTickets = tickets.filter((t) => {
    if (selectedProject !== "All" && t.project !== selectedProject)
      return false;
    if (selectedMember !== "All" && t.assignee !== selectedMember) return false;
    return true;
  });

  const filteredSprints = sprints.filter((s: any) => {
    if (selectedProject !== "All" && s.project?.name !== selectedProject)
      return false;
    if (startDateStr && new Date(s.startDate) < new Date(startDateStr))
      return false;
    return true;
  });

  // Calculate metrics
  const doneCount = filteredTickets.filter((t) => t.status === "Done").length;
  const completionRate = filteredTickets.length
    ? Math.round((doneCount / filteredTickets.length) * 100)
    : 0;
  const blockedCount = filteredTickets.filter((t) => t.blocked).length;

  const chartVelocityData = filteredSprints.map((s: any, i: number) => ({
    n: s.name,
    v: s.completedPoints || 0,
  }));

  const chartRiskData = filteredSprints.map((s: any) => ({
    n: s.name,
    v: s.riskScore || 0,
  }));

  const avgVelocity = chartVelocityData.length
    ? Math.round(
        chartVelocityData.reduce((sum: number, item: any) => sum + item.v, 0) /
          chartVelocityData.length,
      )
    : 0;
  const statusSummary = (["Backlog", "To Do", "In Progress", "In Review", "Done"] as const).map((status) => ({
    status,
    count: filteredTickets.filter((ticket) => ticket.status === status).length,
  }));
  const blockedTickets = filteredTickets.filter((ticket) => ticket.blocked);

  const downloadJSON = () => {
    const dataToDownload = {
      project: selectedProject,
      member: selectedMember,
      startDate: startDateStr,
      metrics: {
        avgVelocity,
        completionRate,
        blockedTickets: blockedCount,
        cycleTime: report?.cycleTime ?? 0,
        leadTime: report?.leadTime ?? 0,
      },
    };
    const blob = new Blob([JSON.stringify(dataToDownload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "itrack-report.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadCSV = () => {
    const headers = ["Metric", "Value"];
    const rows = [
      ["Project", selectedProject],
      ["Member", selectedMember],
      ["Start Date Limit", startDateStr || "None"],
      ["Average Velocity", String(avgVelocity)],
      ["Completion Rate", `${completionRate}%`],
      ["Blocked Tickets", String(blockedCount)],
      ["Cycle Time (days)", String(report?.cycleTime ?? 0)],
      ["Lead Time (days)", String(report?.leadTime ?? 0)],
    ];
    const csvContent = [
      headers.join(","),
      ...rows.map((r) => r.map((x) => `"${x}"`).join(",")),
    ].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "itrack-report.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead
        title="Reports"
        desc="Understand delivery trends and make better planning decisions."
      >
        <div style={{ display: "flex", gap: "10px" }}>
          <button className="btn" onClick={downloadJSON}>
            <Icons.Download />
            Export JSON
          </button>
          <button className="btn" onClick={downloadCSV}>
            <Icons.Download />
            Export CSV
          </button>
        </div>
      </PageHead>
      <div className="tabs">
        {["Overview", "Velocity", "Delivery", "Workload", "Risk"].map((x) => (
          <button
            className={tab === x ? "active" : ""}
            key={x}
            onClick={() => setTab(x)}
          >
            {x}
          </button>
        ))}
      </div>
      <div className="report-filters">
        <select
          value={selectedProject}
          onChange={(e) => setSelectedProject(e.target.value)}
        >
          <option value="All">All projects</option>
          {(dashboard?.projects || []).map((p: any) => (
            <option key={p._id} value={p.name}>
              {p.name}
            </option>
          ))}
        </select>
        <select
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
        >
          <option value="All">All members</option>
          {users.map((u: any) => (
            <option key={u._id} value={u.name}>
              {u.name}
            </option>
          ))}
        </select>
        <label className="btn">
          <Icons.CalendarDays />
          <input
            type="date"
            aria-label="Report start date"
            value={startDateStr}
            onChange={(e) => setStartDateStr(e.target.value)}
          />
        </label>
      </div>

      {tab === "Overview" && (
        <>
          <div className="metrics compact">
            <article className="metric"><div><span>Avg. velocity</span><strong>{avgVelocity}</strong><small>points completed</small></div></article>
            <article className="metric"><div><span>Completion rate</span><strong>{completionRate}%</strong><small>of total scope</small></div></article>
            <article className="metric"><div><span>Cycle time</span><strong>{report?.cycleTime ?? 0}d</strong><small>average duration</small></div></article>
            <article className="metric"><div><span>Blocked duration</span><strong>{blockedCount * 3}d</strong><small>estimated delay</small></div></article>
          </div>
          <section className="card">
            <CardTitle title="Missing Jira-like features" sub="Prioritized product gaps still outside this prototype" />
            <div className="missing-feature-grid">
              {(report?.missingFeatures || []).map((feature: any) => (
                <article key={feature.name} className="missing-feature">
                  <span><Badge tone={feature.priority}>{fmt(feature.priority)}</Badge><small>{feature.area}</small></span>
                  <b>{feature.name}</b>
                  <p>{fmt(feature.status)}</p>
                </article>
              ))}
            </div>
          </section>
          <div className="two-col">
            <section className="card">
              <CardTitle title="Sprint velocity" sub="Completed story points per sprint" />
              <div className="chart"><ResponsiveContainer><BarChart data={chartVelocityData}><CartesianGrid vertical={false} /><XAxis dataKey="n" /><YAxis /><Tooltip /><Bar dataKey="v" fill="#A47BEF" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </section>
            <section className="card">
              <CardTitle title="Risk trend" sub="Sprint risk score over time" />
              <div className="chart"><ResponsiveContainer><AreaChart data={chartRiskData}><XAxis dataKey="n" /><YAxis /><Tooltip /><Area dataKey="v" stroke="#F28C28" fill="#F28C2833" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
            </section>
          </div>
        </>
      )}

      {tab === "Velocity" && (
        <div className="two-col">
          <section className="card">
            <CardTitle title="Velocity by sprint" sub="Completed story points" />
            <div className="chart"><ResponsiveContainer><BarChart data={chartVelocityData}><CartesianGrid vertical={false} /><XAxis dataKey="n" /><YAxis /><Tooltip /><Bar dataKey="v" fill="#A47BEF" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </section>
          <section className="card">
            <CardTitle title="Velocity detail" sub={`${filteredSprints.length} sprints in the selected range`} />
            <div className="timeline">
              {filteredSprints.length ? filteredSprints.map((s: any) => (
                <div key={s._id}><i className="done" /><span><b>{s.name}</b><small>{s.completedPoints || 0} completed of {s.plannedPoints || 0} points</small></span></div>
              )) : <p>No sprints match the selected filters.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "Delivery" && (
        <>
          <div className="metrics compact">
            <article className="metric"><div><span>Total tickets</span><strong>{filteredTickets.length}</strong><small>in selected scope</small></div></article>
            <article className="metric"><div><span>Completed</span><strong>{doneCount}</strong><small>marked done</small></div></article>
            <article className="metric"><div><span>Completion rate</span><strong>{completionRate}%</strong><small>of selected tickets</small></div></article>
            <article className="metric"><div><span>Cycle time</span><strong>{report?.cycleTime ?? 0}d</strong><small>average duration</small></div></article>
          </div>
          <div className="two-col">
            <section className="card">
              <CardTitle title="Delivery status" sub="Current ticket distribution" />
              <div className="timeline">{statusSummary.map(({ status, count }) => <div key={status}><i className={status === "Done" ? "done" : ""} /><span><b>{status}</b><small>{count} tickets</small></span></div>)}</div>
            </section>
            <section className="card no-pad"><CardTitle title="Delivery queue" sub="Filtered tickets in the selected scope" /><TicketTable rows={filteredTickets} /></section>
          </div>
        </>
      )}

      {tab === "Workload" && (
        <section className="card">
          <CardTitle title="Team workload" sub="Capacity signals for workspace members" />
          <div className="workloads">
            {users.length ? users.map((user: any) => {
              const load = user.capacity ? Math.min(100, Math.round((user.capacity / 40) * 100)) : 0;
              return <div key={user._id}><Avatar name={user.name} color={user.avatarColor} /><span><b>{user.name}</b><small>{user.role}</small></span><Progress value={load} tone={load > 80 ? "orange" : "purple"} /><strong>{load}%</strong></div>;
            }) : <p>No team members match the selected filters.</p>}
          </div>
        </section>
      )}

      {tab === "Risk" && (
        <div className="two-col">
          <section className="card">
            <CardTitle title="Risk trend" sub="Sprint risk score over time" />
            <div className="chart"><ResponsiveContainer><AreaChart data={chartRiskData}><XAxis dataKey="n" /><YAxis /><Tooltip /><Area dataKey="v" stroke="#F28C28" fill="#F28C2833" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
          </section>
          <section className="card no-pad"><CardTitle title="Blocked work" sub={`${blockedTickets.length} blocked ticket${blockedTickets.length === 1 ? "" : "s"}`} /><TicketTable rows={blockedTickets} /></section>
        </div>
      )}
    </>
  );
}

const aiWorkspacePrompts = [
  { icon: Icons.Ticket, title: "Triage my work", text: "Show my tickets and prioritize what I should work on next." },
  { icon: Icons.Timer, title: "Review the sprint", text: "Summarize the current sprint, blockers, risks, and recommended next steps." },
  { icon: Icons.FilePlus2, title: "Create work", text: "Help me create a ticket. Ask me for any missing details first." },
  { icon: Icons.ChartNoAxesCombined, title: "Surface insights", text: "Analyze delivery, workload, velocity, and risk across this workspace." },
];

function AIPage() {
  const { user } = useWorkspace();
  const {
    messages,
    input,
    setInput,
    loading,
    toolActivities,
    sendMessage,
    confirmMessage,
    denyMessage,
    clearChat,
  } = useAiAgent();
  const conversationRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const firstName = user?.name?.split(" ")[0] || "there";

  useEffect(() => {
    if (conversationRef.current) conversationRef.current.scrollTop = conversationRef.current.scrollHeight;
  }, [messages, loading, toolActivities]);

  const submit = () => void sendMessage(input);

  return (
    <section className="ai-workspace">
      <div className="ai-workspace-topline">
        <div>
          <span className="ai-workspace-kicker"><Icons.Sparkles size={14} /> AI WORKSPACE</span>
          <h1>Your work, one conversation away.</h1>
          <p>Plan, investigate, and take action across I-TRACK with the same AI Agent available throughout your workspace.</p>
        </div>
        <div className="ai-agent-status"><i /><span><b>AI Agent</b><small>Online and workspace-aware</small></span></div>
      </div>

      <div className="ai-workspace-grid">
        <div className="ai-workspace-main">
          <div className="ai-workspace-chat-head">
            <div className="ai-workspace-avatar"><Icons.Bot size={20} /></div>
            <span><b>I-TRACK AI Agent</b><small>Ask, review, then approve actions</small></span>
            {messages.length > 0 && <button className="icon-btn" onClick={clearChat} title="Start a new conversation" aria-label="Start a new conversation"><Icons.RotateCcw size={16} /></button>}
          </div>

          <div className={cx("ai-workspace-conversation", messages.length === 0 && "empty")} ref={conversationRef}>
            {messages.length === 0 ? (
              <div className="ai-workspace-welcome">
                <span className="ai-workspace-orb"><Icons.Sparkles size={27} /></span>
                <span className="ai-workspace-overline">READY WHEN YOU ARE</span>
                <h2>Hi {firstName}, what can I move forward?</h2>
                <p>Give me an outcome or a question. I can inspect live workspace data, create and update work, and ask before sensitive actions.</p>
                <div className="ai-workspace-prompts">
                  {aiWorkspacePrompts.map(({ icon: Icon, title, text }) => (
                    <button key={title} onClick={() => void sendMessage(text)}>
                      <span><Icon size={17} /></span>
                      <b>{title}</b>
                      <small>{text}</small>
                      <Icons.ArrowUpRight size={15} />
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="ai-workspace-messages">
                {messages.map((message) => (
                  <div className={cx("ai-msg", message.role)} key={message.id}>
                    <div className="ai-msg-avatar">{message.role === "assistant" ? <Icons.Bot size={16} /> : <Icons.User size={16} />}</div>
                    <div>
                      <div className="ai-msg-bubble">{message.role === "assistant" ? <CustomMarkdown content={message.content} /> : message.content}</div>
                      {message.requiresConfirmation && message.pendingAction && (
                        <div className="ai-confirm-bar">
                          <p><Icons.ShieldAlert size={14} /> Confirmation required</p>
                          <span>{message.pendingAction.description}</span>
                          <div><button className="btn-confirm" onClick={() => confirmMessage(message)}>Yes, proceed</button><button className="btn-deny" onClick={denyMessage}>Cancel</button></div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {loading && (
                  <div className="ai-typing">
                    <div className="ai-msg-avatar ai-workspace-thinking"><Icons.Bot size={16} /></div>
                    {toolActivities.length ? (
                      <div className="ai-request-activity" aria-live="polite">
                        {toolActivities.map((activity) => (
                          <div className={cx("ai-request-row", activity.status)} key={activity.id}>
                            <span className="ai-request-indicator">{activity.status === "complete" && <Icons.Check size={13} />}{activity.status === "error" && <Icons.AlertCircle size={13} />}</span>
                            <span>{aiActivityLabel(activity)}</span>
                            {activity.status === "running" && <span className="ai-request-ellipsis" aria-hidden="true">...</span>}
                          </div>
                        ))}
                      </div>
                    ) : <div className="ai-typing-dots"><span /><span /><span /></div>}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="ai-workspace-composer">
            <div>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); submit(); } }}
                placeholder="Ask about your work, or tell the agent what to do…"
                rows={2}
              />
              <button className="ai-workspace-send" onClick={submit} disabled={!input.trim() || loading} aria-label="Send message"><Icons.ArrowUp size={18} /></button>
            </div>
            <span><Icons.ShieldCheck size={13} /> Actions that need approval will always ask first</span>
          </div>
        </div>

        <aside className="ai-workspace-side">
          <div className="ai-side-card ai-side-capabilities">
            <span className="ai-side-icon purple"><Icons.WandSparkles size={18} /></span>
            <h3>One agent, full context</h3>
            <p>This is the same agent in the header. Your conversation follows you between this page and the side panel.</p>
            <div><span><Icons.Search size={15} /> Inspect workspace data</span><span><Icons.PencilLine size={15} /> Create and update work</span><span><Icons.ChartNoAxesCombined size={15} /> Summarize delivery signals</span></div>
          </div>
          <div className="ai-side-card">
            <span className="ai-side-label">TRY ASKING</span>
            {["What needs my attention today?", "Find blockers in the active sprint", "Draft a release plan", "Show what you can do"].map((prompt) => (
              <button className="ai-side-prompt" key={prompt} onClick={() => void sendMessage(prompt)}><span>{prompt}</span><Icons.ArrowRight size={14} /></button>
            ))}
          </div>
          <div className="ai-side-card ai-side-safety">
            <span className="ai-side-icon lime"><Icons.ShieldCheck size={18} /></span>
            <div><h3>You stay in control</h3><p>The agent previews sensitive changes and waits for explicit confirmation.</p></div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SettingsNav({ active }: { active: string }) {
  const navigate = useNavigate();
  const routes: Record<string, string> = {
    Profile: "/settings/profile",
    Preferences: "/settings/preferences",
    Organization: "/organization",
    "Workspace defaults": "/settings",
    Security: "/change-password",
    Sessions: "/sessions",
  };
  return (
    <aside className="settings-nav">
      {[
        "Profile",
        "Preferences",
        "Organization",
        "Workspace defaults",
        "Security",
        "Sessions",
      ].map((x) => (
        <button
          className={x === active ? "active" : ""}
          key={x}
          onClick={() => navigate(routes[x])}
        >
          {x}
        </button>
      ))}
    </aside>
  );
}
function Settings({
  density,
  setDensity,
  toast,
}: {
  density: string;
  setDensity: (s: string) => void;
  toast: (s: string) => void;
}) {
  const {
    user: currentUser,
    organization,
    mutate,
    refetch,
    role,
  } = useWorkspace();
  const loc = useLocation();
  const nav = useNavigate();

  const tab = loc.pathname.endsWith("/profile")
    ? "Profile"
    : loc.pathname.endsWith("/preferences")
      ? "Preferences"
      : "Workspace defaults";

  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Profile fields state
  const [profName, setProfName] = useState(currentUser?.name || "");
  const [profSkills, setProfSkills] = useState(
    (currentUser?.skills || []).join(", "),
  );
  const [profCapacity, setProfCapacity] = useState(currentUser?.capacity || 40);
  const [profColor, setProfColor] = useState(
    currentUser?.avatarColor || "#A47BEF",
  );
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
    ...(currentUser?.notificationPreferences || {}),
  });

  // Workspace settings defaults state
  const [riskThreshold, setRiskThreshold] = useState(
    organization?.settings?.riskThreshold ?? 50,
  );
  const [sprintLengthDays, setSprintLengthDays] = useState(
    organization?.settings?.sprintLengthDays ?? 14,
  );
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(
    organization?.settings?.weeklyCapacityHours ?? 40,
  );
  const [timezone, setTimezone] = useState(
    organization?.settings?.timezone ?? "UTC",
  );
  const [aiEnabled, setAiEnabled] = useState(
    organization?.settings?.aiEnabled ?? true,
  );

  // Sync profile fields if currentUser finishes loading later
  useEffect(() => {
    if (currentUser) {
      setProfName(currentUser.name);
      setProfSkills((currentUser.skills || []).join(", "));
      setProfCapacity(currentUser.capacity || 40);
      setProfColor(currentUser.avatarColor || "#A47BEF");
      setNotificationPreferences({
        ...defaultNotificationPreferences,
        ...(currentUser.notificationPreferences || {}),
      });
    }
  }, [currentUser]);

  // Sync workspace settings if organization finishes loading later
  useEffect(() => {
    if (organization?.settings) {
      setRiskThreshold(organization.settings.riskThreshold ?? 50);
      setSprintLengthDays(organization.settings.sprintLengthDays ?? 14);
      setWeeklyCapacityHours(organization.settings.weeklyCapacityHours ?? 40);
      setTimezone(organization.settings.timezone ?? "UTC");
      setAiEnabled(organization.settings.aiEnabled ?? true);
    }
  }, [organization]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?._id) return;
    try {
      const skills = profSkills
        .split(",")
        .map((s: string) => s.trim())
        .filter(Boolean);
      await api(`/users/${currentUser._id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: profName,
          skills,
          capacity: Number(profCapacity),
          avatarColor: profColor,
        }),
      });
      toast("Profile updated successfully");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Profile update failed");
    }
  };

  const saveWorkspaceSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await mutate(async () => {
        const response = await api<any>("/settings", {
          method: "PATCH",
          body: JSON.stringify({
            riskThreshold: Number(riskThreshold),
            sprintLengthDays: Number(sprintLengthDays),
            weeklyCapacityHours: Number(weeklyCapacityHours),
            timezone,
            aiEnabled,
          }),
        });
        return response;
      });
      toast("Workspace settings updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Settings save failed");
    }
  };

  const savePreferences = async () => {
    try {
      await api("/auth/preferences", {
        method: "PATCH",
        body: JSON.stringify({ notificationPreferences }),
      });
      toast("Preferences saved");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Preferences save failed");
    }
  };

  const isAdmin = role === "admin";

  return (
    <>
      <PageHead
        title="Settings"
        desc="Manage your profile and workspace preferences."
      />
      <div className="settings-layout">
        <SettingsNav active={tab} />
        <div>
          {tab === "Profile" && (
            <section className="card form-card">
              <CardTitle
                title="Profile settings"
                sub="Manage your personal details"
              />
              <form onSubmit={saveProfile} className="form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input
                    value={profName}
                    onChange={(e) => setProfName(e.target.value)}
                    required
                  />
                </label>
                <label className="field">
                  <span>Capacity (hours per week)</span>
                  <input
                    type="number"
                    min="0"
                    max="168"
                    value={profCapacity}
                    onChange={(e) => setProfCapacity(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Avatar color</span>
                  <input
                    type="color"
                    value={profColor}
                    onChange={(e) => setProfColor(e.target.value)}
                  />
                </label>
                <label className="field full">
                  <span>Skills (comma separated)</span>
                  <input
                    value={profSkills}
                    onChange={(e) => setProfSkills(e.target.value)}
                    placeholder="React, Node.js, Mongoose"
                  />
                </label>
                <button className="btn primary" type="submit">
                  Save profile
                </button>
              </form>
            </section>
          )}

          {tab === "Preferences" && (
            <>
              <section className="card form-card">
                <CardTitle
                  title="Appearance"
                  sub="Choose how I-Track looks for you"
                />
                <div className="theme-options">
                  {["light", "dark", "system"].map((x) => (
                    <button
                      className={theme === x ? "active" : ""}
                      onClick={() => {
                        setTheme(x);
                        localStorage.setItem("theme", x);
                        document.documentElement.dataset.theme =
                          x === "system"
                            ? matchMedia("(prefers-color-scheme: dark)").matches
                              ? "dark"
                              : "light"
                            : x;
                      }}
                      key={x}
                    >
                      <span className={`theme-preview ${x}`}>
                        <i />
                        <i />
                        <i />
                      </span>
                      <b>{fmt(x)}</b>
                      <small>
                        {x === "system"
                          ? "Match your device"
                          : `${fmt(x)} surfaces`}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
              <section className="card form-card">
                <CardTitle title="Display density" />
                <div className="radio-list">
                  {[
                    [
                      "comfortable",
                      "Comfortable",
                      "More space between content",
                    ],
                    ["compact", "Compact", "Show more information at once"],
                  ].map(([v, l, d]) => (
                    <label key={v}>
                      <input
                        type="radio"
                        checked={density === v}
                        onChange={() => setDensity(v)}
                      />
                      <span>
                        <b>{l}</b>
                        <small>{d}</small>
                      </span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="card form-card">
                <CardTitle title="Notifications" />
                <div className="toggle-list">
                  {notificationPreferenceOptions.map(({ key, label }) => (
                    <label key={key}>
                      <span>
                        <b>{label}</b>
                        <small>Receive updates about {label.toLowerCase()}.</small>
                      </span>
                      <input
                        type="checkbox"
                        checked={notificationPreferences[key]}
                        onChange={(event) =>
                          setNotificationPreferences((current) => ({
                            ...current,
                            [key]: event.target.checked,
                          }))
                        }
                      />
                    </label>
                  ))}
                </div>
                <button
                  className="btn primary"
                  onClick={savePreferences}
                >
                  Save preferences
                </button>
              </section>
            </>
          )}

          {tab === "Workspace defaults" && (
            <section className="card form-card">
              <CardTitle
                title="Workspace defaults"
                sub="Organization-wide settings"
              />
              <form onSubmit={saveWorkspaceSettings} className="form-grid">
                <label className="field">
                  <span>Sprint length (days)</span>
                  <input
                    type="number"
                    min="1"
                    max="60"
                    value={sprintLengthDays}
                    onChange={(e) => setSprintLengthDays(e.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="field">
                  <span>Weekly capacity (hours)</span>
                  <input type="number" min="1" max="168" value={weeklyCapacityHours} onChange={(e) => setWeeklyCapacityHours(e.target.value)} disabled={!isAdmin} />
                </label>
                <label className="field">
                  <span>Risk threshold (0 - 100)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={riskThreshold}
                    onChange={(e) => setRiskThreshold(e.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={!isAdmin}
                  />
                </label>
                <label
                  className="check"
                  style={{
                    gridColumn: "span 2",
                    display: "flex",
                    gap: "8px",
                    alignItems: "center",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={aiEnabled}
                    onChange={(e) => setAiEnabled(e.target.checked)}
                    disabled={!isAdmin}
                  />
                  <span>Enable AI Workspace and generative ticket tools</span>
                </label>
                {isAdmin && (
                  <button
                    className="btn primary"
                    type="submit"
                    style={{ marginTop: "1rem" }}
                  >
                    Save workspace settings
                  </button>
                )}
              </form>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function Sessions({ toast }: { toast: (s: string) => void }) {
  const { sessions = [], mutate } = useWorkspace();
  const revoke = async (id: string) => {
    try {
      await mutate(() => api(`/auth/sessions/${id}`, { method: "DELETE" }));
      toast("Session revoked");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Revocation failed");
    }
  };
  return (
    <>
      <PageHead
        title="Active sessions"
        desc="Review and revoke devices signed in to your account."
      />
      <div className="settings-layout">
        <SettingsNav active="Sessions" />
        <div>
          <section className="card session-list">
            {sessions.length ? (
              sessions.map((s: any, i: number) => (
                <div
                  key={s._id}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderBottom: "1px solid #eee",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "center",
                    }}
                  >
                    <span>
                      <Icons.Monitor />
                    </span>
                    <div>
                      <b>{s.userAgent || "Unknown device"}</b>
                      <small style={{ display: "block" }}>
                        Created {new Date(s.createdAt).toLocaleString()}
                      </small>
                    </div>
                  </div>
                  {i === 0 ? (
                    <Badge tone="green">Current</Badge>
                  ) : (
                    <button
                      className="btn danger"
                      onClick={() => revoke(s._id)}
                    >
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <Empty
                title="No active sessions"
                body="Sign in to create a new session."
              />
            )}
          </section>
        </div>
      </div>
    </>
  );
}

function FormPage({
  type,
  toast,
}: {
  type: "project" | "sprint" | "ticket" | "invite";
  toast: (s: string) => void;
}) {
  const { dashboard, refetch, role, labelOptions } = useWorkspace();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [ticketLabels, setTicketLabels] = useState<string[]>([]);
  const canCreate =
    type === "invite"
      ? role === "admin"
      : role === "admin" || role === "manager";
  if (!canCreate) return <ErrorPage code="403" />;
  const spec = {
    project: ["Create project", "Set up a new space for focused delivery."],
    sprint: [
      "Plan a sprint",
      "Define the goal, timeline, and available capacity.",
    ],
    ticket: ["Create ticket", "Capture clear, actionable work for your team."],
    invite: [
      "Invite team member",
      "Add someone to the workspace.",
    ],
  }[type];

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    const values = new FormData(event.currentTarget);
    try {
      if (type === "project")
        await api("/projects", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            key: values.get("key"),
            status: values.get("status"),
            description: values.get("description"),
            progress: 0,
            riskLevel: "medium",
            activeSprint: "Planning",
            members: [],
          }),
        });
      if (type === "sprint")
        await api("/sprints", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            project: values.get("project"),
            status: "planned",
            capacity: Number(values.get("capacity")),
            plannedPoints: Number(values.get("capacity")),
            completedPoints: 0,
            startDate: values.get("startDate"),
            endDate: values.get("endDate"),
            velocityHistory: [],
            riskScore: 0,
          }),
        });
      if (type === "ticket")
        await api("/tickets", {
          method: "POST",
          body: JSON.stringify({
            title: values.get("title"),
            description: values.get("description"),
            project: values.get("project"),
            sprint: values.get("sprint"),
            assignee: values.get("assignee"),
            priority: values.get("priority"),
            storyPoints: Number(values.get("storyPoints")),
            dueDate: values.get("dueDate"),
            status: "Backlog",
            acceptanceCriteria: [],
            epic: "Product backlog",
            labels: ticketLabels,
            blocked: false,
            dependencies: [],
          }),
        });
      if (type === "invite") {
        const res = await api<any>("/invitations", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            email: values.get("email"),
            role: values.get("role"),
            capacity: Number(values.get("capacity")),
          }),
        });
        if (res.inviteUrl) {
          window.prompt(
            "Send this invitation link to the user:",
            res.inviteUrl
          );
        }
      }
      toast(`${fmt(type)} saved`);
      await refetch();
      nav(
        type === "ticket"
          ? "/tickets"
          : type === "project"
            ? "/projects"
            : type === "sprint"
              ? "/sprints"
              : "/team",
      );
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  const projects = dashboard?.projects || [];
  const sprints = dashboard?.sprints || [];
  const users = dashboard?.users || [];

  return (
    <CenteredForm title={spec[0]} desc={spec[1]}>
      <form onSubmit={submit}>
        {type === "ticket" && (
          <div className="form-grid">
            <label className="field full">
              <span>Title</span>
              <input
                name="title"
                placeholder="e.g. Implement user login flow"
                autoFocus
                required
              />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea
                name="description"
                placeholder="Add context, constraints, and expected outcome…"
                required
              />
            </label>
            <label className="field">
              <span>Project</span>
              <select name="project" required>
                {projects.map((project: any) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Sprint</span>
              <select name="sprint" required>
                <option value="">Backlog</option>
                {sprints.map((sprint: any) => (
                  <option key={sprint._id} value={sprint._id}>
                    {sprint.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Assignee</span>
              <select name="assignee" required>
                <option value="">Unassigned</option>
                {users.map((user: any) => (
                  <option key={user._id} value={user._id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select name="priority" defaultValue="medium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label className="field">
              <span>Story points</span>
              <input
                name="storyPoints"
                type="number"
                defaultValue="3"
                min="1"
                max="21"
              />
            </label>
            <label className="field">
              <span>Due date</span>
              <input name="dueDate" type="date" required />
            </label>
            <div className="field full">
              <LabelPicker
                labels={ticketLabels}
                suggestions={labelOptions}
                onChange={setTicketLabels}
              />
            </div>
          </div>
        )}
        {type === "project" && (
          <div className="form-grid">
            <label className="field full">
              <span>Project name</span>
              <input
                name="name"
                placeholder="e.g. Mobile application"
                autoFocus
                required
              />
            </label>
            <label className="field">
              <span>Project key</span>
              <input name="key" placeholder="MOB" maxLength={6} required />
            </label>
            <label className="field">
              <span>Status</span>
              <select name="status">
                <option value="planning">Planning</option>
                <option value="active">Active</option>
              </select>
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea
                name="description"
                placeholder="What is this project responsible for?"
                required
              />
            </label>
          </div>
        )}
        {type === "sprint" && (
          <div className="form-grid">
            <label className="field full">
              <span>Sprint name</span>
              <input name="name" placeholder="Sprint name" autoFocus required />
            </label>
            <label className="field">
              <span>Project</span>
              <select name="project" required>
                {projects.map((project: any) => (
                  <option key={project._id} value={project._id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Capacity</span>
              <input name="capacity" type="number" defaultValue="40" min="0" />
            </label>
            <label className="field">
              <span>Start date</span>
              <input name="startDate" type="date" required />
            </label>
            <label className="field">
              <span>End date</span>
              <input name="endDate" type="date" required />
            </label>
          </div>
        )}
        {type === "invite" && (
          <div className="form-grid">
            <label className="field full">
              <span>Full name</span>
              <input name="name" placeholder="Full name" autoFocus required />
            </label>
            <label className="field full">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                placeholder="name@company.com"
                required
              />
            </label>
            <label className="field">
              <span>Role</span>
              <select name="role" defaultValue="engineer">
                <option value="engineer">Engineer</option>
                <option value="designer">Designer</option>
                <option value="manager">Manager</option>
              </select>
            </label>
            <label className="field">
              <span>Capacity</span>
              <input name="capacity" type="number" defaultValue="32" />
            </label>
          </div>
        )}
        {formError && <div className="auth-message">{formError}</div>}
        <div className="form-actions">
          <button type="button" className="btn" onClick={() => nav(-1)}>
            Cancel
          </button>
          <button type="submit" className="btn primary" disabled={busy}>
            {type === "invite" ? "Send invitation" : `Create ${type}`}
          </button>
        </div>
      </form>
    </CenteredForm>
  );
}
function CenteredForm({
  title,
  desc,
  children,
}: {
  title: string;
  desc: string;
  children: React.ReactNode;
}) {
  return (
    <div className="center-form">
      <button className="back-btn" onClick={() => history.back()}>
        <Icons.ArrowLeft />
        Back
      </button>
      <section className="card">
        <PageHead title={title} desc={desc} />
        {children}
      </section>
    </div>
  );
}

function ErrorPage({ code }: { code: string }) {
  return (
    <div className="error-page">
      <span>{code}</span>
      <h1>
        {code === "404"
          ? "This page wandered off"
          : code === "403"
            ? "You don’t have access"
            : code === "Offline"
              ? "You’re offline"
              : "Something went wrong"}
      </h1>
      <p>
        We couldn’t complete this request. Return to a familiar place and try
        again.
      </p>
      <NavLink className="btn primary" to="/dashboard">
        <Icons.ArrowLeft />
        Back to dashboard
      </NavLink>
    </div>
  );
}

function ChangePasswordLive({ toast }: { toast: (s: string) => void }) {
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: values.get("currentPassword"),
          newPassword: values.get("newPassword"),
        }),
      });
      clearSession();
      toast("Password changed. Sign in again.");
      window.location.href = "/login";
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "Password change failed",
      );
    }
  };
  return (
    <CenteredForm
      title="Change password"
      desc="Update your password and revoke existing sessions."
    >
      <form onSubmit={submit}>
        <label className="field">
          <span>Current password</span>
          <PasswordInput name="currentPassword" required />
        </label>
        <label className="field">
          <span>New password</span>
          <PasswordInput name="newPassword" minLength={8} required />
        </label>
        {error && <div className="auth-message">{error}</div>}
        <div className="form-actions">
          <button className="btn primary" type="submit">
            Change password
          </button>
        </div>
      </form>
    </CenteredForm>
  );
}

function ImportExportLive({ toast }: { toast: (s: string) => void }) {
  const { organization, refetch } = useWorkspace();
  const [json, setJson] = useState("");

  const submit = async () => {
    try {
      const parsed = JSON.parse(json);
      const resources = Array.isArray(parsed) ? parsed : parsed.resources;
      await api("/import/resources", {
        method: "POST",
        body: JSON.stringify({ resources }),
      });
      toast(`${resources.length} resources imported`);
      setJson("");
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Import failed");
    }
  };

  const download = async () => {
    try {
      const data = await api<any>("/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `itrack-${organization?.slug || "workspace"}.json`;
      link.click();
      URL.revokeObjectURL(url);
      toast("Export downloaded");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Export failed");
    }
  };

  return (
    <>
      <PageHead
        title="Import & export"
        desc="Move workspace data using authenticated APIs."
      />
      <div className="two-col">
        <section className="card">
          <CardTitle
            title="Import resources"
            sub="Paste a JSON array or an object containing resources."
          />
          <textarea
            className="comment"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder='[{"kind":"label","name":"Example"}]'
          />
          <button
            className="btn primary wide"
            onClick={submit}
            disabled={!json.trim()}
          >
            Validate and import
          </button>
        </section>
        <section className="card">
          <CardTitle
            title="Export organization"
            sub="Download organization, users, projects, sprints, tickets, and resources."
          />
          <button className="btn dark wide" onClick={download}>
            <Icons.Download />
            Download JSON export
          </button>
        </section>
      </div>
    </>
  );
}

function TicketDetailLive({ toast }: { toast: (s: string) => void }) {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const {
    dashboard,
    mutate,
    refetch,
    role,
    user: currentUser,
    labelOptions,
  } = useWorkspace();
  const [tab, setTab] = useState("comments");

  const raw = (dashboard?.tickets || []).find(
    (item: any) => item.ticketId === ticketId,
  );

  const [title, setTitle] = useState(raw?.title || "");
  const [desc, setDesc] = useState(raw?.description || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);
  const acceptanceCriteria = raw?.acceptanceCriteria || [];
  const [acceptanceCriteriaDone, setAcceptanceCriteriaDone] = useState<boolean[]>(
    acceptanceCriteria.map((_: string, index: number) =>
      Boolean(raw?.acceptanceCriteriaDone?.[index]),
    ),
  );
  const [ticketLabels, setTicketLabels] = useState<string[]>(raw?.labels || []);

  // Sync state if ticket changes
  useEffect(() => {
    if (!raw) return;
    setTitle(raw.title);
    setDesc(raw.description || "");
    setTicketLabels(raw.labels || []);
    setAcceptanceCriteriaDone(
      (raw.acceptanceCriteria || []).map((_: string, index: number) =>
        Boolean(raw.acceptanceCriteriaDone?.[index]),
      ),
    );
  }, [raw]);

  if (!raw)
    return (
      <Empty
        title="Ticket not found"
        body="This ticket does not exist in the current workspace."
        action={{ label: "Back to tickets", to: "/tickets" }}
      />
    );

  const updateField = async (fields: any) => {
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}`, {
          method: "PATCH",
          body: JSON.stringify(fields),
        }),
      );
      toast("Ticket updated successfully");
      return true;
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed");
      return false;
    }
  };

  const updateLabels = async (next: string[]) => {
    const previous = ticketLabels;
    setTicketLabels(next);
    if (!(await updateField({ labels: next }))) setTicketLabels(previous);
  };

  const toggleAcceptanceCriterion = async (index: number) => {
    const previous = acceptanceCriteriaDone;
    const next = acceptanceCriteria.map((_: string, criterionIndex: number) =>
      criterionIndex === index ? !Boolean(previous[criterionIndex]) : Boolean(previous[criterionIndex]),
    );
    setAcceptanceCriteriaDone(next);
    if (!(await updateField({ acceptanceCriteriaDone: next }))) {
      setAcceptanceCriteriaDone(previous);
    }
  };

  const copy = async () => {
    await navigator.clipboard.writeText(raw.ticketId);
    toast("Ticket key copied");
  };

  const watch = async () => {
    const watched = (raw.watchers || []).some(
      (w: any) => String(w._id || w) === String(currentUser?.id),
    );
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/watch`, {
          method: watched ? "DELETE" : "POST",
        }),
      );
      toast(watched ? "Ticket unwatched" : "Ticket watched");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed");
    }
  };

  const clone = async () => {
    try {
      const result = await api<any>(`/tickets/${raw._id}/clone`, {
        method: "POST",
      });
      await refetch();
      navigate(`/tickets/${result.ticket.ticketId}`);
      toast("Ticket cloned");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Clone failed");
    }
  };

  const toggleArchive = async () => {
    const isArchived = !!raw.archivedAt;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/${isArchived ? "restore" : "archive"}`, {
          method: "POST",
        }),
      );
      toast(isArchived ? "Ticket restored" : "Ticket archived");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Action failed");
    }
  };

  const remove = async () => {
    if (
      window.prompt(`Type ${raw.ticketId} to delete this ticket`) !==
      raw.ticketId
    )
      return;
    try {
      await api(`/tickets/${raw._id}`, { method: "DELETE" });
      await refetch();
      toast("Ticket deleted");
      navigate("/tickets");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const addComment = async () => {
    const body = window.prompt("Enter comment body:");
    if (!body) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body }),
        }),
      );
      toast("Comment added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add comment");
    }
  };

  const editComment = async (commentId: string, currentBody: string) => {
    const body = window.prompt("Edit comment body:", currentBody);
    if (!body) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/comments/${commentId}`, {
          method: "PATCH",
          body: JSON.stringify({ body }),
        }),
      );
      toast("Comment updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update comment");
    }
  };

  const deleteComment = async (commentId: string) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/comments/${commentId}`, {
          method: "DELETE",
        }),
      );
      toast("Comment deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete comment");
    }
  };

  const addWorkLog = async () => {
    const note = window.prompt("Work log note:");
    const hours = Number(window.prompt("Hours worked:", "1"));
    if (!note || !hours) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/work-logs`, {
          method: "POST",
          body: JSON.stringify({ note, hours }),
        }),
      );
      toast("Work log added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add work log");
    }
  };

  const editWorkLog = async (
    logId: string,
    currentNote: string,
    currentHours: number,
  ) => {
    const note = window.prompt("Edit note:", currentNote);
    const hours = Number(window.prompt("Edit hours:", String(currentHours)));
    if (!note || !hours) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/work-logs/${logId}`, {
          method: "PATCH",
          body: JSON.stringify({ note, hours }),
        }),
      );
      toast("Work log updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to update work log");
    }
  };

  const deleteWorkLog = async (logId: string) => {
    if (!window.confirm("Delete this work log?")) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/work-logs/${logId}`, {
          method: "DELETE",
        }),
      );
      toast("Work log deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete work log");
    }
  };

  const addAttachment = async () => {
    const name = window.prompt("Attachment display name:");
    const url = window.prompt("Attachment URL:");
    if (!name || !url) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/attachments`, {
          method: "POST",
          body: JSON.stringify({ name, url }),
        }),
      );
      toast("Attachment added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add attachment");
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!window.confirm("Delete this attachment?")) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/attachments/${attachmentId}`, {
          method: "DELETE",
        }),
      );
      toast("Attachment deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to delete attachment");
    }
  };

  const tabItems =
    tab === "comments"
      ? raw.comments || []
      : tab === "workLogs"
        ? raw.workLogs || []
        : tab === "attachments"
          ? raw.attachments || []
          : raw.history || [];

  const isLeader = ["admin", "manager"].includes(role);

  return (
    <>
      <PageHead
        eyebrow={`${raw.ticketId}${raw.archivedAt ? " [ARCHIVED]" : ""}`}
        title={
          isLeader && isEditingTitle ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => {
                setIsEditingTitle(false);
                if (title !== raw.title) updateField({ title });
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  setIsEditingTitle(false);
                  if (title !== raw.title) updateField({ title });
                }
              }}
              autoFocus
              style={{ fontSize: "2rem", width: "100%" }}
            />
          ) : (
            <span
              onClick={isLeader ? () => setIsEditingTitle(true) : undefined}
              style={isLeader ? { cursor: "pointer", borderBottom: "1px dashed #ccc" } : undefined}
            >
              {raw.title}
            </span>
          )
        }
        desc={
          <>
            <LabelChips labels={ticketLabels} />
            {isLeader && isEditingDesc ? (
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                onBlur={() => {
                  setIsEditingDesc(false);
                  if (desc !== raw.description)
                    updateField({ description: desc });
                }}
                autoFocus
                style={{ width: "100%", height: "80px" }}
              />
            ) : (
              <p
                onClick={isLeader ? () => setIsEditingDesc(true) : undefined}
                style={isLeader ? { cursor: "pointer", borderBottom: "1px dashed #ccc" } : undefined}
              >
                {raw.description || "(No description, click to add)"}
              </p>
            )}
          </>
        }
      >
        <button className="btn" onClick={copy}>
          <Icons.Copy />
          Copy key
        </button>
        <button className="btn" onClick={watch}>
          <Icons.Eye />
          Watch
        </button>
        {isLeader && (
          <button className="btn" onClick={clone}>
            <Icons.CopyPlus />
            Clone
          </button>
        )}
        {isLeader && (
          <button className="btn warning" onClick={toggleArchive}>
            {raw.archivedAt ? "Restore" : "Archive"}
          </button>
        )}
        {isLeader && (
          <button className="btn danger" onClick={remove}>
            <Icons.Trash2 />
            Delete
          </button>
        )}
      </PageHead>
      <div className="ticket-layout">
        <section className="ticket-main">
          <div className="card">
            <CardTitle title="Acceptance criteria" />
            {acceptanceCriteria.map((item: string, index: number) => (
              <label className="check" key={item}>
                <input
                  type="checkbox"
                  checked={Boolean(acceptanceCriteriaDone[index])}
                  onChange={() => void toggleAcceptanceCriterion(index)}
                />
                {item}
              </label>
            ))}
          </div>
          <div className="card">
            <div className="tabs">
              {[
                ["comments", "Comments"],
                ["workLogs", "Work logs"],
                ["attachments", "Attachments"],
                ["history", "History"],
              ].map(([value, label]) => (
                <button
                  key={value}
                  className={tab === value ? "active" : ""}
                  onClick={() => setTab(value)}
                >
                  {label}
                </button>
              ))}
            </div>
            {tab !== "history" && (
              <button
                className="btn primary"
                onClick={
                  tab === "comments"
                    ? addComment
                    : tab === "workLogs"
                      ? addWorkLog
                      : addAttachment
                }
                style={{ marginBottom: "1rem" }}
              >
                <Icons.Plus />
                Add {tab === "workLogs" ? "work log" : tab.slice(0, -1)}
              </button>
            )}
            <div className="timeline">
              {tabItems.length ? (
                tabItems.map((item: any, index: number) => (
                  <div
                    key={item._id || index}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: "10px",
                        alignItems: "center",
                      }}
                    >
                      <i className="done" />
                      <span>
                        <b>
                          {item.body || item.note || item.name || item.event}
                        </b>
                        <small style={{ marginLeft: "10px" }}>
                          {item.hours ? `${item.hours} hours · ` : ""}
                          {item.createdAt
                            ? new Date(item.createdAt).toLocaleString()
                            : ""}
                        </small>
                      </span>
                    </div>
                    {tab !== "history" && (
                      <div style={{ display: "flex", gap: "5px" }}>
                        {tab === "comments" && (
                          <>
                            <button
                              className="btn text-btn"
                              onClick={() => editComment(item._id, item.body)}
                            >
                              Edit
                            </button>
                            <button
                              className="btn text-btn danger"
                              onClick={() => deleteComment(item._id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {tab === "workLogs" && (
                          <>
                            <button
                              className="btn text-btn"
                              onClick={() =>
                                editWorkLog(item._id, item.note, item.hours)
                              }
                            >
                              Edit
                            </button>
                            <button
                              className="btn text-btn danger"
                              onClick={() => deleteWorkLog(item._id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                        {tab === "attachments" && (
                          <button
                            className="btn text-btn danger"
                            onClick={() => deleteAttachment(item._id)}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <p>No {tab.toLowerCase()} yet.</p>
              )}
            </div>
          </div>
        </section>
        <aside className="ticket-aside card">
          <h3>Details</h3>
          <div className="detail-row">
            <span>Status</span>
            <select
              value={raw.status}
              onChange={(e) => updateField({ status: e.target.value })}
            >
              {["Backlog", "To Do", "In Progress", "In Review", "Done"].map(
                (value) => (
                  <option key={value}>{value}</option>
                ),
              )}
            </select>
          </div>
          <div className="detail-row">
            <span>Priority</span>
            <select
              value={raw.priority}
              onChange={(e) => updateField({ priority: e.target.value })}
            >
              {["low", "medium", "high", "critical"].map((value) => (
                <option key={value} value={value}>
                  {fmt(value)}
                </option>
              ))}
            </select>
          </div>
          <div className="detail-row">
            <span>Assignee</span>
            <select
              value={
                raw.assignee?._id ||
                (typeof raw.assignee === "string" ? raw.assignee : "")
              }
              onChange={(e) =>
                updateField({ assigneeId: e.target.value || null })
              }
            >
              <option value="">Unassigned</option>
              {(dashboard?.users || []).map((u: any) => (
                <option key={u._id} value={u._id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
          <div className="detail-row">
            <span>Story points</span>
            <input
              type="number"
              value={raw.storyPoints || 0}
              onChange={(e) =>
                updateField({ storyPoints: Number(e.target.value) })
              }
              style={{ width: "80px" }}
            />
          </div>
          <div className="detail-labels">
            <LabelPicker
              labels={ticketLabels}
              suggestions={labelOptions}
              onChange={(next) => void updateLabels(next)}
              disabled={!isLeader}
            />
          </div>
        </aside>
      </div>
    </>
  );
}

function OrganizationLive({ toast }: { toast: (s: string) => void }) {
  const {
    organization: org,
    dashboard,
    resources,
    mutate,
    role,
  } = useWorkspace();
  const [name, setName] = useState(org?.name || "");

  const resourceCount = Object.values(resources || {}).reduce(
    (sum: number, items: any) => sum + (items?.length || 0),
    0,
  );

  const save = async () => {
    try {
      await mutate(async () => {
        const response = await api<any>("/organization", {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        return response;
      });
      toast("Organization updated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed");
    }
  };

  const remove = async () => {
    const confirmation = window.prompt(
      `Type ${org.name} to permanently delete this organization.`,
    );
    if (confirmation !== org.name) return;
    try {
      await api("/organization", {
        method: "DELETE",
        body: JSON.stringify({ confirmationName: confirmation }),
      });
      clearSession();
      window.location.href = "/login";
    } catch (err) {
      toast(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  const isAdmin = role === "admin";

  const usage = [
    ["Team members", dashboard?.users?.length || 0],
    ["Projects", dashboard?.projects?.length || 0],
    ["Tickets", dashboard?.tickets?.length || 0],
    ["Workspace resources", resourceCount],
  ];

  return (
    <>
      <PageHead
        title="Organization"
        desc={`Manage ${org?.name || "Organization"} and monitor live usage.`}
      >
        <Badge tone="purple">{fmt(org?.plan || "starter")} plan</Badge>
      </PageHead>
      <div className="settings-layout">
        <SettingsNav active="Organization" />
        <div>
          <section className="card form-card">
            <CardTitle
              title="Organization details"
              sub="Loaded from the organization API"
            />
            <div className="form-grid">
              <label className="field">
                <span>Organization name</span>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={!isAdmin}
                />
              </label>
              <label className="field">
                <span>Workspace slug</span>
                <div className="input-prefix">
                  <span>itrack.app/</span>
                  <input value={org?.slug || ""} readOnly />
                </div>
              </label>
            </div>
            {isAdmin && (
              <button className="btn primary" onClick={save}>
                Save changes
              </button>
            )}
          </section>
          <section className="card">
            <CardTitle
              title="Current usage"
              sub="Live organization record counts"
            />
            <div className="usage-list">
              {usage.map(([label, value]) => (
                <div key={String(label)}>
                  <span>
                    <b>{label}</b>
                    <strong>{value}</strong>
                  </span>
                  <Progress value={Math.min(100, Number(value) * 5)} />
                </div>
              ))}
            </div>
          </section>
          {isAdmin && (
            <section className="card danger-zone">
              <CardTitle
                title="Danger zone"
                sub="Permanently delete this organization and all workspace data."
              />
              <button className="btn danger" onClick={remove}>
                Delete organization
              </button>
            </section>
          )}
        </div>
      </div>
    </>
  );
}

function BacklogLive({
  toast,
  projectFilter,
}: {
  toast: (s: string) => void;
  projectFilter?: string;
}) {
  const navigate = useNavigate();
  const { tickets: wsTickets, role, labelOptions } = useWorkspace();
  const isLeader = role === "admin" || role === "manager";
  const backlog = wsTickets.filter((ticket) => {
    if (ticket.status !== "Backlog") return false;
    if (projectFilter && ticket.project !== projectFilter) return false;
    return true;
  });
  return (
    <>
      <PageHead
        title="Backlog"
        desc="Live unplanned work from the workspace API."
      >
        {isLeader && (
          <button
            className="btn primary"
            onClick={() => navigate("/tickets/new")}
          >
            <Icons.Plus />
            Create ticket
          </button>
        )}
      </PageHead>
      <FilterBar placeholder="Search backlog…" labelOptions={labelOptions} />
      <section className="sprint-group">
        <div className="sprint-group-head">
          <div>
            <Icons.ChevronDown />
            <h2>Backlog</h2>
            <span>{backlog.length} tickets</span>
          </div>
        </div>
        {backlog.length ? (
          <TicketTable rows={backlog} />
        ) : (
          <Empty
            title="Backlog is empty"
            body="There is no unplanned work in this workspace."
            action={
              isLeader
                ? { label: "Create ticket", to: "/tickets/new" }
                : undefined
            }
          />
        )}
      </section>
    </>
  );
}

function SlaPage({ toast }: { toast: (s: string) => void }) {
  const { sla, tickets, organization, refetch, role } = useWorkspace();
  const [saving, setSaving] = useState(false);
  const isLeader = ["admin", "manager"].includes(role);
  const policy = sla?.policy || organization?.settings?.slaPolicy || {
    critical: { firstResponseHours: 1, resolutionHours: 8 },
    high: { firstResponseHours: 4, resolutionHours: 24 },
    medium: { firstResponseHours: 8, resolutionHours: 72 },
    low: { firstResponseHours: 24, resolutionHours: 120 },
  };
  const slaTickets = (sla?.tickets || tickets).map((ticket: any) => ({
    id: ticket._id || ticket.id,
    key: ticket.ticketId || ticket.key,
    title: ticket.title,
    status: ticket.status,
    priority: ticket.priority,
    points: ticket.storyPoints || ticket.points || 0,
    assignee: ticket.assignee?.name || ticket.assignee || "Unassigned",
    project: ticket.project?.name || ticket.project || "",
    labels: ticket.labels || [],
    blocked: ticket.blocked,
    slaStatus: ticket.slaStatus,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
  }));
  const summary = sla?.summary || {
    breached: slaTickets.filter((ticket: Ticket) => ticket.slaStatus === "breached").length,
    dueSoon: slaTickets.filter((ticket: Ticket) => ticket.slaStatus === "due_soon").length,
    healthy: slaTickets.filter((ticket: Ticket) => !ticket.slaStatus || ticket.slaStatus === "healthy").length,
    resolved: slaTickets.filter((ticket: Ticket) => ticket.slaStatus === "resolved").length,
  };

  const savePolicy = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    const values = new FormData(event.currentTarget);
    const nextPolicy = Object.fromEntries(
      ["critical", "high", "medium", "low"].map((priority) => [
        priority,
        {
          firstResponseHours: Number(values.get(`${priority}-firstResponseHours`)),
          resolutionHours: Number(values.get(`${priority}-resolutionHours`)),
        },
      ]),
    );
    try {
      await api("/sla/policy", { method: "PATCH", body: JSON.stringify(nextPolicy) });
      toast("SLA policy updated");
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to update SLA policy");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <PageHead title="SLA" desc="Track response and resolution commitments by ticket priority." />
      <div className="metrics compact">
        <article className="metric"><div><span>Breached</span><strong>{summary.breached}</strong><small>needs attention</small></div></article>
        <article className="metric"><div><span>Due soon</span><strong>{summary.dueSoon}</strong><small>inside 4 hours</small></div></article>
        <article className="metric"><div><span>Healthy</span><strong>{summary.healthy}</strong><small>on target</small></div></article>
        <article className="metric"><div><span>Resolved</span><strong>{summary.resolved}</strong><small>completed</small></div></article>
      </div>
      <div className="two-col">
        <section className="card">
          <CardTitle title="SLA policy" sub="Hours by ticket priority" />
          <form className="sla-policy-grid" onSubmit={savePolicy}>
            {(["critical", "high", "medium", "low"] as const).map((priority) => (
              <div className="sla-policy-row" key={priority}>
                <b>{fmt(priority)}</b>
                <label className="field">
                  <span>First response</span>
                  <input name={`${priority}-firstResponseHours`} type="number" min="0.25" step="0.25" defaultValue={policy[priority]?.firstResponseHours} disabled={!isLeader} />
                </label>
                <label className="field">
                  <span>Resolution</span>
                  <input name={`${priority}-resolutionHours`} type="number" min="0.25" step="0.25" defaultValue={policy[priority]?.resolutionHours} disabled={!isLeader} />
                </label>
              </div>
            ))}
            {isLeader && <button className="btn primary" disabled={saving}>{saving ? "Saving..." : "Save policy"}</button>}
          </form>
        </section>
        <section className="card">
          <CardTitle title="SLA queue" sub="Breached and due-soon tickets appear first" />
          <TicketTable rows={slaTickets} />
        </section>
      </div>
    </>
  );
}

function CyclesLive({ toast }: { toast: (s: string) => void }) {
  const { dashboard, refetch, role } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const cycles = dashboard?.cycles || [];
  const sprints = dashboard?.sprints || [];
  const isLeader = ["admin", "manager"].includes(role);

  const createCycle = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const values = new FormData(form);
    setCreating(true);
    try {
      await api("/cycles", {
        method: "POST",
        body: JSON.stringify({
          name: values.get("name"),
          goal: values.get("goal"),
          status: values.get("status"),
          startDate: values.get("startDate"),
          endDate: values.get("endDate"),
          sprints: values.getAll("sprints"),
        }),
      });
      form.reset();
      toast("Cycle created");
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create cycle");
    } finally {
      setCreating(false);
    }
  };

  const deleteCycle = async (cycleId: string) => {
    if (!window.confirm("Delete this cycle? Sprints will remain intact.")) return;
    try {
      await api(`/cycles/${cycleId}`, { method: "DELETE" });
      toast("Cycle deleted");
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete cycle");
    }
  };

  return (
    <>
      <PageHead title="Cycles" desc="Group multiple sprints under a larger planning goal." />
      <div className="two-col">
        {isLeader && (
          <section className="card">
            <CardTitle title="New cycle" sub="Create a planning container for related sprints" />
            <form className="form-grid" onSubmit={createCycle}>
              <label className="field full"><span>Name</span><input name="name" placeholder="Cycle 2026-Q3" required /></label>
              <label className="field full"><span>Goal</span><textarea name="goal" placeholder="What should this cycle achieve?" /></label>
              <label className="field"><span>Status</span><select name="status" defaultValue="planned"><option value="planned">Planned</option><option value="active">Active</option><option value="completed">Completed</option></select></label>
              <label className="field"><span>Start date</span><input name="startDate" type="date" required /></label>
              <label className="field"><span>End date</span><input name="endDate" type="date" required /></label>
              <div className="field full">
                <span>Sprints</span>
                <div className="check-list">
                  {sprints.map((sprint: any) => (
                    <label key={sprint._id}><input type="checkbox" name="sprints" value={sprint._id} /> {sprint.name}</label>
                  ))}
                </div>
              </div>
              <button className="btn primary" disabled={creating}>{creating ? "Creating..." : "Create cycle"}</button>
            </form>
          </section>
        )}
        <section className="card">
          <CardTitle title="Cycle plan" sub={`${cycles.length} cycle${cycles.length === 1 ? "" : "s"} in this workspace`} />
          <div className="cycle-list">
            {cycles.length ? cycles.map((cycle: any) => {
              const planned = (cycle.sprints || []).reduce((sum: number, sprint: any) => sum + (sprint.plannedPoints || 0), 0);
              const completed = (cycle.sprints || []).reduce((sum: number, sprint: any) => sum + (sprint.completedPoints || 0), 0);
              const progress = planned ? Math.round((completed / planned) * 100) : 0;
              return (
                <article className="cycle-row" key={cycle._id}>
                  <div>
                    <span><b>{cycle.name}</b><Badge tone={cycle.status === "active" ? "lime" : cycle.status === "completed" ? "green" : "neutral"}>{cycle.status}</Badge></span>
                    <p>{cycle.goal || "No cycle goal set"}</p>
                    <small>{new Date(cycle.startDate).toLocaleDateString()} - {new Date(cycle.endDate).toLocaleDateString()}</small>
                  </div>
                  <div><small>Sprints</small><strong>{cycle.sprints?.length || 0}</strong></div>
                  <div><small>Progress</small><strong>{progress}%</strong><Progress value={progress} /></div>
                  {isLeader && <button className="icon-btn" onClick={() => deleteCycle(cycle._id)} aria-label={`Delete ${cycle.name}`}><Icons.Trash2 /></button>}
                </article>
              );
            }) : <Empty title="No cycles" body={isLeader ? "Create a cycle to group related sprints." : "No cycles have been created yet."} />}
          </div>
        </section>
      </div>
    </>
  );
}

function SprintsLive({
  toast,
  projectFilter,
}: {
  toast: (s: string) => void;
  projectFilter?: string;
}) {
  const navigate = useNavigate();
  const { dashboard, role } = useWorkspace();
  const isLeader = role === "admin" || role === "manager";
  const rawSprints = dashboard?.sprints || [];
  const items = rawSprints.filter((s: any) => {
    if (projectFilter && s.project?.name !== projectFilter) return false;
    return true;
  });

  return (
    <>
      <PageHead title="Sprints" desc="Live sprint plans and delivery status.">
        {isLeader && (
          <button
            className="btn primary"
            onClick={() => navigate("/sprints/new")}
          >
            <Icons.Plus />
            New sprint
          </button>
        )}
      </PageHead>
      <div className="sprint-list">
        {items.length ? (
          items.map((s: any) => {
            const progress = s.plannedPoints
              ? Math.round((s.completedPoints / s.plannedPoints) * 100)
              : 0;
            return (
              <article
                className="card sprint-row"
                key={s._id}
                onClick={() => navigate(`/sprints/${s._id}`)}
                style={{ cursor: "pointer" }}
              >
                <div className={`sprint-status ${s.status}`}>
                  <Icons.Timer />
                </div>
                <div>
                  <span>
                    <h2>{s.name}</h2>
                    <Badge
                      tone={
                        s.status === "active"
                          ? "lime"
                          : s.status === "completed"
                            ? "green"
                            : "neutral"
                      }
                    >
                      {s.status}
                    </Badge>
                  </span>
                  <p>
                    {s.project?.name || "Project"} ·{" "}
                    {new Date(s.startDate).toLocaleDateString()}–
                    {new Date(s.endDate).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <small>Progress</small>
                  <b>{progress}%</b>
                  <Progress value={progress} />
                </div>
                <div>
                  <small>Story points</small>
                  <b>
                    {s.completedPoints} / {s.plannedPoints}
                  </b>
                </div>
                <div>
                  <small>Risk score</small>
                  <b className="risk-value">{s.riskScore}</b>
                </div>
                {isLeader && (
                  <button
                    className="icon-btn"
                    aria-label={`${s.status === "planned" ? "Start" : s.status === "active" ? "Complete" : "Reopen"} ${s.name}`}
                    onClick={async (event) => {
                      event.stopPropagation();
                      if (s.status === "active") {
                        navigate(`/sprints/${s._id}/complete`);
                        return;
                      }
                      await api(
                        `/sprints/${s._id}/${s.status === "planned" ? "start" : "reopen"}`,
                        { method: "POST" },
                      );
                      toast(
                        `Sprint ${s.status === "planned" ? "started" : "reopened"}`,
                      );
                      window.location.reload();
                    }}
                  >
                    {s.status === "planned" ? (
                      <Icons.Play />
                    ) : s.status === "active" ? (
                      <Icons.CheckCircle2 />
                    ) : (
                      <Icons.RotateCcw />
                    )}
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <Empty
            title="No sprints"
            body={
              isLeader
                ? "Create the first sprint for this workspace."
                : "No sprints have been created yet."
            }
            action={
              isLeader
                ? { label: "Create sprint", to: "/sprints/new" }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
}

function ResourcesLive({ toast }: { toast: (s: string) => void }) {
  const { resources, mutate, role } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const kind = location.pathname.split("/")[2];

  const isLeader = ["admin", "manager"].includes(role);

  if (kind) {
    const rawRows = resources[kind] || [];
    const [params] = useSearchParams();
    const q = params.get("q") || "";
    const filter = params.get("filter") || "";
    const sort = params.get("sort") || "";

    // Filter
    const filtered = rawRows.filter((item: any) => {
      const matchesQ = q
        ? item.name.toLowerCase().includes(q.toLowerCase()) ||
          (item.description || "").toLowerCase().includes(q.toLowerCase())
        : true;
      const matchesFilter = filter === "open" ? item.status === "active" : true;
      return matchesQ && matchesFilter;
    });

    // Sort
    const rows = sort
      ? [...filtered].sort((a: any, b: any) => {
          const valA = a.name.toLowerCase();
          const valB = b.name.toLowerCase();
          if (sort === "desc") {
            return valA > valB ? -1 : valA < valB ? 1 : 0;
          } else {
            return valA < valB ? -1 : valA > valB ? 1 : 0;
          }
        })
      : filtered;

    const create = async () => {
      const name = window.prompt(`Name for the new ${fmt(kind)}`);
      if (!name) return;
      try {
        await mutate(() =>
          api(`/resources/${kind}`, {
            method: "POST",
            body: JSON.stringify({
              name,
              description: "",
              status: "active",
              order: rows.length,
              config: {},
            }),
          }),
        );
        toast(`${fmt(kind)} created`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Creation failed");
      }
    };

    const rename = async (item: any) => {
      const name = window.prompt(`Rename ${fmt(kind)}`, item.name);
      if (!name) return;
      try {
        await mutate(() =>
          api(`/resources/${kind}/${item._id}`, {
            method: "PATCH",
            body: JSON.stringify({ name }),
          }),
        );
        toast(`${fmt(kind)} updated`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Rename failed");
      }
    };

    const remove = async (item: any) => {
      if (!window.confirm(`Are you sure you want to delete ${item.name}?`))
        return;
      try {
        await mutate(() =>
          api(`/resources/${kind}/${item._id}`, {
            method: "DELETE",
          }),
        );
        toast(`${fmt(kind)} deleted`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Deletion failed");
      }
    };

    return (
      <>
        <PageHead
          title={fmt(kind)}
          desc={`Live ${fmt(kind).toLowerCase()} resources from the API.`}
        >
          {isLeader && (
            <button className="btn primary" onClick={create}>
              <Icons.Plus />
              New {fmt(kind)}
            </button>
          )}
        </PageHead>
        <FilterBar />
        <section className="card no-pad">
          {rows.length ? (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Key</th>
                  <th>Updated</th>
                  {isLeader && <th>Actions</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((item: any) => (
                  <tr key={item._id}>
                    <td>
                      <b>{item.name}</b>
                    </td>
                    <td>
                      <Badge tone="green">{item.status}</Badge>
                    </td>
                    <td>{item.key || "—"}</td>
                    <td>{new Date(item.updatedAt).toLocaleString()}</td>
                    {isLeader && (
                      <td>
                        <div style={{ display: "flex", gap: "10px" }}>
                          <button
                            className="btn text-btn"
                            onClick={() => rename(item)}
                          >
                            Rename
                          </button>
                          <button
                            className="btn text-btn danger"
                            onClick={() => remove(item)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <Empty
              title={`No ${fmt(kind).toLowerCase()}`}
            />
          )}
        </section>
      </>
    );
  }

  return (
    <>
      <PageHead
        title="Workspace resources"
        desc="Live reusable workspace configuration."
      />
      <div className="resource-grid">
        {resourceKinds.map((resourceKind, index) => {
          const Icon = [
            Icons.Layers3,
            Icons.Tags,
            Icons.Boxes,
            Icons.Rocket,
            Icons.TicketCheck,
            Icons.Signal,
            Icons.GitBranch,
            Icons.Braces,
            Icons.LayoutTemplate,
            Icons.Columns3,
            Icons.Flag,
          ][index];
          return (
            <article
              className="card resource-card"
              key={resourceKind}
              onClick={() => navigate(`/resources/${resourceKind}`)}
            >
              <span>
                <Icon />
              </span>
              <div>
                <h2>{fmt(resourceKind)}</h2>
                <p>Manage {fmt(resourceKind).toLowerCase()} definitions.</p>
              </div>
              <Badge>{(resources[resourceKind] || []).length}</Badge>
              <Icons.ChevronRight />
            </article>
          );
        })}
      </div>
    </>
  );
}

function IntegrationsLive({ toast }: { toast: (s: string) => void }) {
  const { integrations: rows, mutate, role } = useWorkspace();
  const isAdmin = role === "admin";

  const create = async () => {
    if (!isAdmin) return toast("Only admins can create integrations");
    const kind = window.prompt(
      "Integration type: webhook or api-token",
      "webhook",
    );
    if (!kind || !["webhook", "api-token"].includes(kind)) return;
    const name = window.prompt("Integration name");
    if (!name) return;
    const url =
      kind === "webhook"
        ? window.prompt("Webhook URL") || undefined
        : undefined;
    try {
      let createdToken = "";
      await mutate(async () => {
        const result = await api<any>(`/integrations/${kind}`, {
          method: "POST",
          body: JSON.stringify({ name, url, events: [] }),
        });
        if (result.token) createdToken = result.token;
        return result;
      });

      if (createdToken) {
        window.prompt(
          "Copy this token now. It will not be shown again.",
          createdToken,
        );
      }
      toast("Integration created");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Creation failed");
    }
  };

  const remove = async (item: any) => {
    if (!isAdmin) return toast("Only admins can delete integrations");
    if (!window.confirm(`Delete ${item.name}?`)) return;
    try {
      await mutate(() =>
        api(`/integrations/${item.kind}/${item._id}`, { method: "DELETE" }),
      );
      toast("Integration deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  return (
    <>
      <PageHead
        title="Integrations"
        desc="Live API tokens and webhooks for this organization."
      >
        {isAdmin && (
          <button className="btn primary" onClick={create}>
            <Icons.Plus />
            New integration
          </button>
        )}
      </PageHead>
      <div className="integration-grid">
        {rows.length ? (
          rows.map((item: any) => (
            <article className="card integration" key={item._id}>
              <span className={`integration-icon ${item.kind}`}>
                {item.kind === "webhook" ? (
                  <Icons.Webhook />
                ) : (
                  <Icons.KeyRound />
                )}
              </span>
              <div>
                <h2>{item.name}</h2>
                <Badge>{item.kind}</Badge>
              </div>
              {isAdmin && (
                <button
                  className="icon-btn"
                  aria-label={`Delete ${item.name}`}
                  onClick={() => remove(item)}
                >
                  <Icons.Trash2 />
                </button>
              )}
              <p>{item.url || "Secure token"}</p>
              <div>
                <Badge tone={item.active ? "green" : "neutral"}>
                  {item.active ? "Active" : "Inactive"}
                </Badge>
                <span>
                  {item.lastUsedAt
                    ? `Last used ${new Date(item.lastUsedAt).toLocaleString()}`
                    : "Never used"}
                </span>
              </div>
            </article>
          ))
        ) : (
          <Empty
            title="No integrations"
            body="Connect a webhook or create an API token."
          />
        )}
      </div>
    </>
  );
}

function AuditLogsLive() {
  const { auditLogs: rows = [] } = useWorkspace();
  const [params] = useSearchParams();
  const q = params.get("q") || "";

  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";

  const filtered = rows.filter((item: any) => {
    const matchesQ =
      item.action.toLowerCase().includes(q.toLowerCase()) ||
      (item.actor?.name || "System").toLowerCase().includes(q.toLowerCase()) ||
      (item.entityType || "").toLowerCase().includes(q.toLowerCase());
    return matchesQ;
  });

  const sorted = sort
    ? [...filtered].sort((a: any, b: any) => {
        const valA = new Date(a.createdAt).getTime();
        const valB = new Date(b.createdAt).getTime();
        if (sort === "desc") {
          return valB - valA;
        } else {
          return valA - valB;
        }
      })
    : filtered;

  return (
    <>
      <PageHead
        title="Audit logs"
        desc="Live organization activity from the audit API."
      />
      <FilterBar placeholder="Search actions or entities…" />
      <section className="card no-pad">
        {filtered.length ? (
          <table>
            <thead>
              <tr>
                <th>Event</th>
                <th>Actor</th>
                <th>Entity</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((item: any) => (
                <tr key={item._id}>
                  <td>
                    <Badge tone="purple">{item.action}</Badge>
                  </td>
                  <td>
                    <b>{item.actor?.name || "System"}</b>
                  </td>
                  <td>
                    {item.entityType || "—"} {item.entityId || ""}
                  </td>
                  <td>{new Date(item.createdAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <Empty
            title="No audit events"
            body="Workspace activity will appear here."
          />
        )}
      </section>
    </>
  );
}

function DashboardLive() {
  const { dashboard: d = {}, user: currentUser, organization, projects, tickets, people, risk, role } = useWorkspace();
  const isLeader = role === "admin" || role === "manager";
  const summary = d.summary || {};
  const active =
    (d.sprints || []).find((s: any) => s.status === "active") || d.sprints?.[0];
  const planned = active?.plannedPoints || 0;
  const completed = active?.completedPoints || 0;
  const progress = planned ? Math.round((completed / planned) * 100) : 0;
  const recommendation = d.recommendation || {};
  const metrics = [
    [
      "Blocked tasks",
      summary.blockedTasks ?? 0,
      `${tickets.filter((t: any) => t.blocked && t.priority === "critical").length} critical`,
      "CircleSlash2",
      "red",
    ],
    [
      "At-risk sprints",
      summary.atRiskSprints ?? 0,
      "Risk threshold exceeded",
      "Activity",
      "orange",
    ],
    [
      "Sprint health",
      `${summary.sprintHealth ?? 0}%`,
      active?.name || "No active sprint",
      "HeartPulse",
      "green",
    ],
    [
      "Active projects",
      summary.activeProjects ?? 0,
      `${projects.length} total`,
      "FolderKanban",
      "blue",
    ],
    [
      "Sprints in progress",
      summary.sprintsInProgress ?? 0,
      `${planned} points planned`,
      "Timer",
      "purple",
    ],
  ];
  return (
    <>
      <PageHead
        eyebrow={new Date()
          .toLocaleDateString(undefined, {
            weekday: "long",
            day: "numeric",
            month: "long",
          })
          .toUpperCase()}
        title={`Good morning, ${currentUser?.name?.split(" ")[0] || "there"}`}
        desc={`Live delivery data from ${organization?.name || "Workspace"}. Start with risks and blocked work.`}
      >
        <NavLink className="btn" to="/my-work">
          <Icons.CircleUserRound />
          View my work
        </NavLink>
        {isLeader && (
          <NavLink className="btn primary" to="/tickets/new">
            <Icons.Plus />
            New ticket
          </NavLink>
        )}
      </PageHead>
      <div className="metrics">
        {metrics.map(([label, value, sub, icon, tone]) => {
          const Icon = (Icons as any)[String(icon)];
          return (
            <article className="metric" key={String(label)}>
              <div>
                <span>{label}</span>
                <strong>{value}</strong>
                <small>{sub}</small>
              </div>
              <b className={String(tone)}>
                <Icon />
              </b>
            </article>
          );
        })}
      </div>
      <div className="dashboard-grid">
        <section className="card span-2">
          <CardTitle title="Sprint risk" sub="Risk score by sprint" />
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart data={risk}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="n" />
                <YAxis />
                <Tooltip />
                <Area
                  type="monotone"
                  dataKey="v"
                  stroke="#A47BEF"
                  strokeWidth={3}
                  fill="#A47BEF33"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <CardTitle
            title="Active sprint"
            sub={
              active
                ? `${active.name} · ends ${new Date(active.endDate).toLocaleDateString()}`
                : "No active sprint"
            }
          />
          <div className="ring-wrap">
            <div
              className="score-ring"
              style={{
                background: `conic-gradient(var(--lime) 0 ${progress}%,var(--border) ${progress}%)`,
              }}
            >
              <strong>{progress}%</strong>
              <span>complete</span>
            </div>
          </div>
          <Progress value={progress} />
          <div className="split">
            <span>
              <b>{completed}</b> completed
            </span>
            <span>
              <b>{Math.max(0, planned - completed)}</b> remaining
            </span>
          </div>
        </section>
        <section className="card span-2">
          <CardTitle
            title="Team workload"
            sub="Capacity from workspace users"
          />
          <div className="workloads">
            {people.map((p: any) => (
              <div key={p.email}>
                <Avatar name={p.name} color={p.color} />
                <span>
                  <b>{p.name}</b>
                  <small>{p.role}</small>
                </span>
                <Progress
                  value={p.load}
                  tone={p.load > 80 ? "orange" : "purple"}
                />
                <strong>{p.load}%</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="card insight">
          <div className="insight-icon">
            <Icons.Sparkles />
          </div>
          <Badge tone="lime">LIVE RECOMMENDATION</Badge>
          <h2>{recommendation.title || "No recommendation available"}</h2>
          <p>
            {recommendation.body ||
              "Delivery signals will appear when workspace activity is available."}
          </p>
          <div className="confidence">
            <span>Confidence</span>
            <b>{recommendation.confidence ?? 0}%</b>
          </div>
        </section>
      </div>
    </>
  );
}

function LandingPage() {
  const marketing = {
    preview: {
      sprintHealth: 84,
      completed: 32,
      planned: 41,
      velocityChange: 18,
      risk: 12,
      blockersResolved: 3,
    },
    proof: { avatars: ["AK", "JM", "RL"], additional: "+2k" },
    logos: ["northstar", "Vertex", "APERTURE", "lumon", "QUANTUM"],
    testimonial: {
      quote: "I-TRACK gave us back the one thing our team was missing: a shared sense of what matters.",
      name: "Maya Chen",
      title: "VP of Product at Northstar",
      initials: "MC",
    },
  };
  const [menuOpen, setMenuOpen] = useState(false);
  const isLoggedIn = Boolean(getToken());
  const year = new Date().getFullYear();
  const features = [
    { icon: Icons.Gauge, title: "See risk before it slips", text: "Live sprint health, workload signals, and delivery forecasts give every team an honest view of what happens next." },
    { icon: Icons.Sparkles, title: "Turn updates into action", text: "Ask I-TRACK what changed, where work is blocked, and what deserves attention—without another status meeting." },
    { icon: Icons.Route, title: "Keep work moving", text: "Plan, prioritize, and ship from one focused workspace built for product, design, and engineering teams." },
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-logo" href="#top" aria-label="I-TRACK home"><span><img src="/logo-mark.png" alt="" /></span>I-TRACK</a>
        <button className="landing-menu" onClick={() => setMenuOpen(!menuOpen)} aria-label="Toggle navigation" aria-expanded={menuOpen}>
          {menuOpen ? <Icons.X /> : <Icons.Menu />}
        </button>
        <nav className={menuOpen ? "open" : ""} aria-label="Main navigation">
          <a href="#features" onClick={() => setMenuOpen(false)}>Product</a>
          <a href="#workflow" onClick={() => setMenuOpen(false)}>How it works</a>
          <a href="#customers" onClick={() => setMenuOpen(false)}>Customers</a>
          <a href="#pricing" onClick={() => setMenuOpen(false)}>Pricing</a>
        </nav>
        <div className="landing-actions">
          <a href={isLoggedIn ? "/dashboard" : "/login"}>
            {isLoggedIn ? "Dashboard" : "Log in"}
          </a>
          <a className="landing-button small" href="/register">Start free <Icons.ArrowUpRight /></a>
        </div>
      </header>

      <main id="top">
        <section className="landing-hero">
          <div className="hero-copy">
            <div className="eyebrow"><span></span>Built for teams that ship</div>
            <h1>Keep every sprint<br/><em>on track.</em></h1>
            <p>I-TRACK brings planning, delivery signals, and AI-powered insight into one calm workspace—so your team can move with clarity.</p>
            <div className="hero-actions">
              <a className="landing-button" href="/register">Start tracking for free <Icons.ArrowRight /></a>
              <a className="text-link" href="#workflow"><Icons.PlayCircle /> See how it works</a>
            </div>
              <div className="hero-proof">
              <div className="proof-avatars">{(marketing?.proof?.avatars || []).map((avatar: string) => <span key={avatar}>{avatar}</span>)}{marketing?.proof?.additional && <span>{marketing.proof.additional}</span>}</div>
              <p><b>Trusted by ambitious teams</b><br/>No credit card · Free to get started</p>
            </div>
          </div>
          <div className="hero-visual" aria-label="I-TRACK sprint dashboard preview">
            <div className="visual-glow"></div>
            <div className="mini-app">
              <div className="mini-sidebar">
                <div className="mini-brand"><img src="/logo-mark.png" alt="" /></div>
                {[Icons.LayoutDashboard, Icons.FolderKanban, Icons.Columns3, Icons.ChartNoAxesCombined].map((Icon, i) => <span className={i === 0 ? "active" : ""} key={i}><Icon /></span>)}
              </div>
              <div className="mini-main">
                <div className="mini-top"><span>SPRINT OVERVIEW</span><div><Icons.Search/><b>AK</b></div></div>
                <div className="mini-heading"><div><small>Current sprint</small><h3>Momentum is building.</h3></div><button disabled>+ Create issue</button></div>
                <div className="mini-stats">
                  <article><small>SPRINT HEALTH</small><strong>{marketing?.preview?.sprintHealth ?? "—"}<span>{marketing ? "%" : ""}</span></strong><i>On track</i></article>
                  <article><small>COMPLETED</small><strong>{marketing?.preview?.completed ?? "—"}<span>{marketing ? ` / ${marketing.preview.planned}` : ""}</span></strong><div className="mini-bar"><i></i></div></article>
                  <article><small>TEAM VELOCITY</small><strong>{marketing ? `+${marketing.preview.velocityChange}` : "—"}<span>{marketing ? "%" : ""}</span></strong><svg viewBox="0 0 120 30"><path d="M0 25 C22 23 24 11 42 17 S70 24 82 8 S105 11 120 2"/></svg></article>
                </div>
                <div className="mini-board"><div className="mini-board-empty">Connect your workspace to see live tickets</div></div>
              </div>
            </div>
            <div className="floating-card risk-card"><span><Icons.ShieldCheck /></span><div><small>SPRINT RISK</small><b>Low risk</b></div><strong>{marketing?.preview?.risk ?? "—"}</strong></div>
            <div className="floating-card ai-card"><Icons.Sparkles /><div><small>I-TRACK AI</small><b>{marketing ? `${marketing.preview.blockersResolved} blockers resolved this week` : "Loading workspace insight"}</b></div></div>
          </div>
        </section>

        <section className="logo-strip" id="customers"><p>Helping modern teams build what matters</p><div>{(marketing?.logos || []).map((logo: string) => <b key={logo}>{logo}</b>)}</div></section>

        <section className="landing-section" id="features">
          <div className="section-intro"><div><span className="section-kicker">ONE WORKSPACE. TOTAL CLARITY.</span><h2>Less tracking.<br/>More momentum.</h2></div><p>Your team shouldn't have to chase updates across five tools. I-TRACK puts the signal front and center, so everyone knows what matters now.</p></div>
          <div className="feature-grid">{features.map(({icon: Icon,title,text}, i) => <article key={title}><span className={`feature-icon f${i}`}><Icon /></span><h3>{title}</h3><p>{text}</p><a href="/register">Learn more <Icons.ArrowUpRight /></a></article>)}</div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-card"><div className="workflow-copy"><span className="section-kicker">FROM PLAN TO PROGRESS</span><h2>A clearer way to move work forward.</h2><p>Turn goals into focused sprints, spot trouble early, and help every teammate do their best work.</p>{["Plan around real team capacity","Catch blockers before standup","Share progress without the status chase"].map(x=><div className="workflow-point" key={x}><Icons.Check />{x}</div>)}<a className="landing-button" href="/register">Explore I-TRACK <Icons.ArrowRight/></a></div><div className="workflow-visual"><div className="pulse-ring"><span><Icons.Activity/></span></div><div className="signal signal-one"><small>SPRINT CONFIDENCE</small><b>92%</b><i></i></div><div className="signal signal-two"><Icons.Zap/><span><b>2 risks caught early</b><small>AI sprint analysis</small></span></div><div className="signal signal-three"><small>DELIVERY TREND</small><svg viewBox="0 0 180 65"><path d="M0 56 C30 53 30 40 55 44 S86 42 105 25 S143 30 180 5"/></svg></div></div></div>
        </section>

        <section className="quote-section"><Icons.Quote/><blockquote>{marketing?.testimonial?.quote ? `“${marketing.testimonial.quote}”` : ""}</blockquote><div className="quote-person"><span>{marketing?.testimonial?.initials || ""}</span><p><b>{marketing?.testimonial?.name || ""}</b><small>{marketing?.testimonial?.title || ""}</small></p></div></section>

        <section className="cta-section" id="pricing"><div><span className="section-kicker">YOUR NEXT SPRINT STARTS HERE</span><h2>Ready to move<br/>with clarity?</h2></div><div><p>Bring your team, your work, and your ambition. I-TRACK will help you keep the rest on track.</p><a className="landing-button dark" href="/register">Start for free <Icons.ArrowRight/></a><small>Free forever for teams up to 10</small></div></section>
      </main>
      <footer className="landing-footer"><a className="landing-logo" href="#top"><span><img src="/logo-mark.png" alt="" /></span>I-TRACK</a><p>© {year} I-TRACK. Built for momentum.</p><div><a href="#features">Product</a><a href="#pricing">Pricing</a><a href="/login">Log in</a></div></footer>
    </div>
  );
}

function OnboardingFlow({ toast }: { toast: (message: string) => void }) {
  const { step = "workspace" } = useParams();
  const nav = useNavigate();
  const { organization, pendingInvitations = [], refetch } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [inviteUrl, setInviteUrl] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true); setError(""); const values = new FormData(form);
    try {
      if (step === "workspace") {
        const session = await api<any>("/workspaces", { method: "POST", body: JSON.stringify({ name: values.get("name") }) });
        saveSession(session); await refetch(); nav("/onboarding/project");
      } else if (step === "project") {
        await api("/projects", { method: "POST", body: JSON.stringify({ name: values.get("name"), key: values.get("key"), description: values.get("description"), status: "active", progress: 0, riskLevel: "medium", activeSprint: "Planning", members: [] }) });
        nav("/onboarding/invite");
      } else {
        const result = await api<any>("/invitations", { method: "POST", body: JSON.stringify({ name: values.get("name"), email: values.get("email"), role: values.get("role"), capacity: Number(values.get("capacity")) }) });
        setInviteUrl(result.inviteUrl); toast("Invitation created"); form.reset();
      }
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : "Unable to continue"); } finally { setBusy(false); }
  };
  const acceptInvitation = async (invitationId: string) => { const session = await api<any>("/auth/accept-invite", { method: "POST", body: JSON.stringify({ invitationId }) }); saveSession(session); window.location.assign("/dashboard"); };
  const finish = async () => { if (!organization) return; await api(`/workspaces/${organization.id || organization._id}/onboarding/complete`, { method: "POST" }); window.location.assign("/dashboard"); };
  const headings: Record<string, [string, string]> = { workspace: ["Create or join a workspace", "A workspace keeps each team’s projects, people, and permissions separate."], project: ["Create your first project", "Give your team a clear place to start planning work."], invite: ["Invite your team", "Create invitation links now, or skip and invite teammates later."] };
  const heading = headings[step] || headings.workspace;
  const currentStep = step === "project" ? 3 : step === "invite" ? 4 : 2;
  const steps = ["Account", "Workspace", "Project", "Team"];
  const onboardingDetails = step === "project"
    ? { icon: Icons.FolderKanban, title: "Give work a home", text: "Projects keep goals, tickets, and delivery updates together.", items: ["Plan work in one place", "Track progress clearly", "Keep the team focused"] }
    : step === "invite"
      ? { icon: Icons.UsersRound, title: "Better with your team", text: "Bring the people who will plan, build, and deliver with you.", items: ["Assign clear roles", "Plan around capacity", "Share progress easily"] }
      : { icon: Icons.Building2, title: "Your team’s shared space", text: "Set up one secure home for everything your team plans and delivers.", items: ["Organize projects and tickets", "Manage people and permissions", "Keep delivery updates together"] };
  const DetailIcon = onboardingDetails.icon;
  return <div className="onboarding-shell">
    <header className="onboarding-header">
      <a className="brand" href="/" aria-label="I-TRACK home"><span className="brand-mark"><img src="/logo-mark.png" alt="" /></span><span>I-TRACK</span></a>
      <span className="onboarding-save"><Icons.CloudCheck /> Your progress is saved</span>
    </header>
    <nav className="onboarding-progress" aria-label="Onboarding progress">
      {steps.map((label, index) => {
        const number = index + 1;
        const state = number < currentStep ? "done" : number === currentStep ? "active" : "";
        return <React.Fragment key={label}><span className={state}><i>{number < currentStep ? <Icons.Check /> : number}</i><b>{label}</b></span>{index < steps.length - 1 && <em className={number < currentStep ? "done" : ""} />}</React.Fragment>;
      })}
    </nav>
    <main className="onboarding-layout">
      <aside className="onboarding-context">
        <div className="onboarding-context-icon"><DetailIcon /></div>
        <Badge tone="lime">SET UP IN MINUTES</Badge>
        <h2>{onboardingDetails.title}</h2>
        <p>{onboardingDetails.text}</p>
        <ul>{onboardingDetails.items.map((item) => <li key={item}><Icons.CheckCircle2 />{item}</li>)}</ul>
        <div className="onboarding-tip"><Icons.Sparkles /><span><b>You can change this later</b><small>Workspace settings stay fully editable.</small></span></div>
      </aside>
      <section className="card onboarding-card"><Badge tone="blue">GET STARTED</Badge><PageHead title={heading[0]} desc={heading[1]} />{step === "workspace" && pendingInvitations.length > 0 && <div className="pending-onboarding"><h3>Pending invitations</h3>{pendingInvitations.map((invitation: any) => <article key={invitation.id}><div><b>{invitation.organization?.name}</b><small>Join as {fmt(invitation.role)}</small></div><button className="btn" onClick={() => acceptInvitation(invitation.id)}>Review and join</button></article>)}<div className="or-divider">or create a new workspace</div></div>}<form onSubmit={submit}>{step === "workspace" && <label className="field"><span>Workspace name</span><input name="name" placeholder="Acme Product" minLength={2} autoFocus required /><small>This is usually your company or team name.</small></label>}{step === "project" && <div className="form-grid"><label className="field full"><span>Project name</span><input name="name" placeholder="Product launch" autoFocus required /></label><label className="field"><span>Project key</span><input name="key" placeholder="PL" minLength={2} maxLength={12} required /></label><label className="field full"><span>Description</span><textarea name="description" placeholder="What will this project deliver?" minLength={5} required /></label></div>}{step === "invite" && <div className="form-grid"><label className="field full"><span>Full name</span><input name="name" required /></label><label className="field full"><span>Email address</span><input name="email" type="email" required /></label><label className="field"><span>Role</span><select name="role" defaultValue="engineer"><option value="engineer">Engineer</option><option value="designer">Designer</option><option value="manager">Manager</option></select></label><label className="field"><span>Weekly capacity</span><input name="capacity" type="number" min="0" defaultValue="32" /></label></div>}{error && <div className="auth-message">{error}</div>}{inviteUrl && <div className="invite-link"><span>Invitation link</span><input readOnly value={inviteUrl} /><button type="button" className="btn" onClick={() => navigator.clipboard.writeText(inviteUrl)}>Copy</button></div>}<div className="form-actions">{step === "invite" && <button type="button" className="btn" onClick={finish}>Skip for now</button>}<button className="btn primary" disabled={busy}>{busy ? "Please wait…" : step === "workspace" ? "Create workspace" : step === "project" ? "Create project" : "Create invitation"}</button>{step === "invite" && inviteUrl && <button type="button" className="btn primary" onClick={finish}>Finish onboarding</button>}</div></form></section>
    </main>
  </div>;
}

function InvitationAcceptPage() {
  const [params] = useSearchParams(); const token = params.get("token") || ""; const nav = useNavigate();
  const [preview, setPreview] = useState<any>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  useEffect(() => { if (token) api<any>(`/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setError(e.message)); else setError("Invitation token is missing"); }, [token]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => { event.preventDefault(); setBusy(true); setError(""); const values = new FormData(event.currentTarget); try { if (preview.accountExists && !getToken()) await login(preview.invitation.email, String(values.get("password"))); const password = String(values.get("password") || ""); if (!preview.accountExists && password !== String(values.get("confirmPassword") || "")) throw new Error("Passwords do not match"); const session = await api<any>("/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, ...(!preview.accountExists ? { name: values.get("name"), password } : {}) }) }); saveSession(session); window.location.assign("/dashboard"); } catch (e) { setError(e instanceof Error ? e.message : "Unable to accept invitation"); } finally { setBusy(false); } };
  return <div className="auth"><section className="auth-brand"><div className="brand big"><div className="brand-mark"><img src="/logo-mark.png" alt="" /></div><span>I-TRACK</span></div><div><Badge tone="lime">WORKSPACE INVITATION</Badge><h1>Work together.<br />Stay aligned.</h1><p>Review the workspace and your role before joining.</p></div></section><section className="auth-form">{!preview ? <div className="auth-message">{error || "Loading invitation…"}</div> : <form onSubmit={submit}><span className="eyebrow">INVITED WORKSPACE</span><h1>Join {preview.invitation.organization?.name}</h1><p>{preview.invitation.invitedBy?.name || "A workspace admin"} invited you as <b>{fmt(preview.invitation.role)}</b>.</p><div className="invite-summary"><span>Email <b>{preview.invitation.email}</b></span><span>Role <b>{fmt(preview.invitation.role)}</b></span></div>{!preview.accountExists && <label className="field"><span>Full name</span><input name="name" defaultValue={preview.invitation.name} required /></label>}<label className="field"><span>{preview.accountExists ? "Password to sign in" : "Create password"}</span><PasswordInput name="password" minLength={8} required /></label>{!preview.accountExists && <label className="field"><span>Confirm password</span><PasswordInput name="confirmPassword" minLength={8} required /></label>}{error && <div className="auth-message">{error}</div>}<button className="btn primary wide" disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</button>{preview.accountExists && <button type="button" className="btn wide" onClick={() => nav("/login")}>Use another account</button>}</form>}</section></div>;
}

function PasswordInput(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password">
      <input {...props} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        onClick={() => setVisible((current) => !current)}
      >
        {visible ? <Icons.EyeOff /> : <Icons.Eye />}
      </button>
    </div>
  );
}

function AuthPageLive({ type }: { type: string }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [busy, setBusy] = useState(false);
  const token = searchParams.get("token") || "";
  const tokenFlow = type === "reset-password" || type === "accept-invite";
  const titles: Record<string, string> = {
    login: "Welcome back",
    register: "Create your account",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
    "accept-invite": "Join your workspace",
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResetLink("");
    const data = new FormData(e.currentTarget);
    try {
      if (type === "login") {
        const session = await login(String(data.get("email")), String(data.get("password")));
        nav(session.next || "/dashboard");
        location.reload();
        return;
      }
      if (type === "register") {
        const session = await api<any>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        saveSession(session);
        nav(session.next || "/onboarding/workspace");
        location.reload();
        return;
      }
      if (type === "forgot-password") {
        const result = await api<{ resetToken?: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: data.get("email") }),
        });
        setError("If the account exists, reset instructions were created.");
        if (result.resetToken) {
          setResetLink(`${window.location.origin}/reset-password?token=${encodeURIComponent(result.resetToken)}`);
        }
        return;
      }
      if (!token) throw new Error("Open this page using the token from your invitation or password-reset link.");
      const password = String(data.get("password") || "");
      if (password !== String(data.get("confirmPassword") || "")) {
        throw new Error("Passwords do not match");
      }
      if (type === "reset-password") {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        nav("/login");
        return;
      }
      const session = await api<any>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, password, name: data.get("name") || undefined }),
      });
      localStorage.setItem("itrack_token", session.token);
      localStorage.setItem("itrack_refresh_token", session.refreshToken);
      nav("/dashboard");
      location.reload();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand big">
          <div className="brand-mark"><img src="/logo-mark.png" alt="" /></div>
          <span>I-TRACK</span>
        </div>
        <div>
          <Badge tone="lime">
            <Icons.Sparkles />
            EXPLAINABLE DELIVERY INTELLIGENCE
          </Badge>
          <h1>
            Build momentum.
            <br />
            See risk sooner.
          </h1>
          <p>
            Plan focused work, protect capacity, and turn delivery signals into
            confident decisions.
          </p>
        </div>
        <div className="auth-quote">
          <p>Live workspace data, secured by your organization account.</p>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <span className="eyebrow">I-TRACK WORKSPACE</span>
          <h1>{titles[type]}</h1>
          <p>
            {type === "login"
              ? "Sign in to load your workspace data."
              : tokenFlow
                ? "Use the secure link you received to finish setup."
                : type === "register"
                  ? "Start with your identity. You’ll create a workspace next."
                  : "Complete the details below to continue."}
          </p>
          {type === "register" && (
            <>
              <label className="field">
                <span>Full name</span>
                <input name="name" required />
              </label>
            </>
          )}
          {type === "accept-invite" && (
            <label className="field">
              <span>Full name</span>
              <input name="name" minLength={2} required />
            </label>
          )}
          {!tokenFlow && (
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                required
              />
            </label>
          )}
          {type !== "forgot-password" && (
            <label className="field">
              <span>Password</span>
              <PasswordInput
                name="password"
                minLength={8}
                required
              />
            </label>
          )}
          {tokenFlow && (
            <label className="field">
              <span>Confirm password</span>
              <PasswordInput name="confirmPassword" minLength={8} required />
            </label>
          )}
          {tokenFlow && !token && (
            <div className="auth-message">
              Open this page using the token from your invitation or password-reset link.
            </div>
          )}
          {error && (
            <div
              className={cx(
                "auth-message",
                error.startsWith("If") && "success",
              )}
            >
              {error}
            </div>
          )}
          {resetLink && (
            <a className="auth-switch" href={resetLink}>
              Open password reset page
            </a>
          )}
          <button className="btn primary wide" disabled={busy || (tokenFlow && !token)}>
            {busy
              ? "Please wait…"
              : type === "login"
                ? "Sign in"
                : type === "forgot-password"
                  ? "Send reset instructions"
                  : type === "reset-password"
                    ? "Set new password"
                    : type === "accept-invite"
                      ? "Accept invitation"
                  : "Continue"}
          </button>
          {type === "login" && (
            <p className="auth-switch">
              <NavLink to="/forgot-password">Forgot password?</NavLink> ·{" "}
              <NavLink to="/register">Create account</NavLink>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
