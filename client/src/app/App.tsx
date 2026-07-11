import React, { useEffect, useMemo, useState } from "react";
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
import { api, clearSession, login } from "../api";
import { resourceKinds } from "../constants/resources";
import type { Role, Ticket, TicketStatus, Toast } from "../types/domain";
import { ApiGate, useWorkspace } from "./workspace";
import { nav } from "./navigation";
import {
  Avatar,
  Badge,
  CardTitle,
  Empty,
  FilterBar,
  PageHead,
  Progress,
} from "./components/ui";
import { cx, fmt } from "../utils/ui";

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
            element={<AuthPageLive type="accept-invite" />}
          />
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
        <div className="toast-stack">
          {toasts.map((t) => (
            <div className="toast" key={t.id}>
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
  } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false),
    [mobile, setMobile] = useState(false),
    [search, setSearch] = useState(false),
    [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const label =
    nav
      .flatMap((g) => g.items)
      .find((i) => loc.pathname.startsWith(i[0]))?.[2] ||
    fmt(loc.pathname.split("/").filter(Boolean).at(-1) || "Dashboard");
  const effectiveRole = (currentUser?.role || role) as Role;

  const unreadCount = notifications.filter((n: any) => !n.readAt).length;

  return (
    <div className={cx("app", collapsed && "collapsed")}>
      <aside className={cx("sidebar", mobile && "open")}>
        <div className="brand">
          <div className="brand-mark">I</div>
          <span>I-TRACK</span>
          <button
            className="icon-btn collapse"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Icons.PanelLeftClose size={19} />
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
              <p>WORKSPACE</p>
              <button
                className="selected"
                role="menuitem"
                onClick={() => {
                  setWorkspaceMenu(false);
                  toast(`${organization?.name} selected`);
                }}
              >
                <span className="avatar square">
                  {(organization?.name || "W").slice(0, 2).toUpperCase()}
                </span>
                <span>
                  <b>{organization?.name}</b>
                  <small>Current workspace</small>
                </span>
                <Icons.Check size={16} />
              </button>
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
        <div className="sidebar-user">
          <Avatar
            name={currentUser?.name || "User"}
            color={currentUser?.avatarColor}
          />
          <span>
            <b>{currentUser?.name || "User"}</b>
            <small>{fmt(currentUser?.role || role)}</small>
          </span>
          <Icons.MoreHorizontal size={18} />
        </div>
      </aside>
      <header className="topbar">
        <button
          className="icon-btn mobile-menu"
          onClick={() => setMobile(true)}
        >
          <Icons.Menu />
        </button>
        <div className="crumb">
          <span>{organization?.name || "Workspace"}</span>
          <Icons.ChevronRight size={15} />
          <b>{label}</b>
        </div>
        <div className="top-actions">
          <button className="search-trigger" onClick={() => setSearch(true)}>
            <Icons.Search size={17} />
            <span>Search anything</span>
            <kbd>⌘ K</kbd>
          </button>
          <button
            className="btn primary"
            onClick={() => navigate("/tickets/new")}
          >
            <Icons.Plus size={17} />
            Create
          </button>
          <button className="ai-agent-toggle" onClick={() => setAiPanel(!aiPanel)}>
              <span className="pulse-dot" />
              <Icons.Bot size={16} />
              <span>AI Agent</span>
            </button>
          <button
            className="icon-btn"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
          </button>
          <button
            className="icon-btn"
            onClick={() => navigate("/notifications")}
          >
            <Icons.Bell />
            {unreadCount > 0 && <i />}
          </button>
        </div>
      </header>
      <main>{children}</main>
      <nav className="bottom-nav">
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
      {mobile && <div className="scrim" onClick={() => setMobile(false)} />}{" "}
      {search && <Command close={() => setSearch(false)} navigate={navigate} />}
      <button className="fab" onClick={() => navigate("/tickets/new")}>
        <Icons.Plus />
      </button>
      <AiAgentPanel open={aiPanel} onClose={() => setAiPanel(false)} toast={toast} />
    </div>
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
  const all = nav.flatMap((g) => g.items);
  return (
    <div className="modal-wrap" onMouseDown={close}>
      <div className="command" onMouseDown={(e) => e.stopPropagation()}>
        <div>
          <Icons.Search />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search pages, tickets and projects…"
          />
          <kbd>ESC</kbd>
        </div>
        <p>QUICK NAVIGATION</p>
        {all
          .filter((x) => x[2].toLowerCase().includes(q.toLowerCase()))
          .slice(0, 8)
          .map(([p, i, l]) => {
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
      </div>
    </div>
  );
}

type AiChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  toolCalls?: { name: string; args: any; result: any; error?: boolean }[];
  requiresConfirmation?: boolean;
  pendingAction?: { method: string; path: string; body?: any; description: string };
};

function AiAgentPanel({ open, onClose, toast }: { open: boolean; onClose: () => void; toast: (s: string) => void }) {
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Set<number>>(new Set());
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);
  const { user } = useWorkspace();

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "j") { e.preventDefault(); onClose(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const sendMessage = async (text: string, confirmed?: { action: string }) => {
    if (!text.trim() && !confirmed) return;
    const userMsg: AiChatMessage = { id: Date.now(), role: "user", content: text };
    if (!confirmed) setMessages((m) => [...m, userMsg]);
    setInput("");
    setLoading(true);
    try {
      const history = messages.filter((m) => !m.requiresConfirmation).map((m) => ({ role: m.role, content: m.content }));
      const res = await api<any>("/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: text, history, ...(confirmed ? { confirmed } : {}) }),
      });
      const assistantMsg: AiChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content: res.reply || "I couldn't process that request.",
        toolCalls: res.toolCalls,
        requiresConfirmation: res.requiresConfirmation,
        pendingAction: res.pendingAction,
      };
      setMessages((m) => [...m, assistantMsg]);
    } catch (e) {
      setMessages((m) => [...m, {
        id: Date.now() + 1,
        role: "assistant",
        content: e instanceof Error ? `Sorry, something went wrong: ${e.message}` : "An unexpected error occurred.",
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = (msg: AiChatMessage) => {
    if (!msg.pendingAction) return;
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    sendMessage(lastUserMsg?.content || "confirm", { action: msg.pendingAction.description });
  };

  const handleDeny = (msg: AiChatMessage) => {
    setMessages((m) => [...m, { id: Date.now(), role: "assistant", content: "Understood — action cancelled. How else can I help?" }]);
  };

  const toggleTool = (id: number) => setExpandedTools((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const clearChat = () => { setMessages([]); setExpandedTools(new Set()); };

  const quickActions = ["Show my tickets", "Sprint status", "Create a ticket", "Team overview", "Show backlog"];

  if (!open) return null;

  return (
    <>
      <div className="ai-panel-backdrop" onClick={onClose} />
      <aside className="ai-panel">
        <div className="ai-panel-head">
          <div className="ai-panel-icon"><Icons.Bot size={20} /></div>
          <div>
            <b>I-TRACK AI Agent</b>
            <small>Powered by AI · Ready to help</small>
          </div>
          <div className="ai-panel-actions">
            <button className="icon-btn" onClick={clearChat} title="Clear chat"><Icons.Trash2 size={16} /></button>
            <button className="icon-btn" onClick={onClose} title="Close (Ctrl+J)"><Icons.X size={18} /></button>
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
                <div className="ai-msg-bubble">{msg.content}</div>
                {msg.toolCalls?.map((tc, i) => (
                  <div key={i}>
                    <div className={cx("ai-tool-badge", tc.error && "error")} onClick={() => toggleTool(msg.id * 100 + i)}>
                      {tc.error ? <Icons.AlertCircle size={12} /> : <Icons.Zap size={12} />}
                      {tc.name.replace("execute_itrack_api", "API Call")}: {tc.args?.method} {tc.args?.path}
                    </div>
                    {expandedTools.has(msg.id * 100 + i) && (
                      <div className="ai-tool-detail">{JSON.stringify(tc.result, null, 2)}</div>
                    )}
                  </div>
                ))}
                {msg.requiresConfirmation && msg.pendingAction && (
                  <div className="ai-confirm-bar">
                    <p><Icons.ShieldAlert size={14} /> Confirmation Required</p>
                    <span>{msg.pendingAction.description}</span>
                    <div>
                      <button className="btn-confirm" onClick={() => handleConfirm(msg)}>Yes, proceed</button>
                      <button className="btn-deny" onClick={() => handleDeny(msg)}>Cancel</button>
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
              <div className="ai-typing-dots"><span /><span /><span /></div>
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
      <Route path="/sprints" element={<SprintsLive toast={toast} />} />
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
      <Route path="/ai/*" element={<AIPage toast={toast} />} />
      <Route path="/resources/*" element={<ResourcesLive toast={toast} />} />
      <Route
        path="/organization"
        element={<OrganizationLive toast={toast} />}
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
        element={<IntegrationsLive toast={toast} />}
      />
      <Route path="/audit-logs" element={<AuditLogsLive />} />
      <Route path="/import" element={<ImportExportLive toast={toast} />} />
      <Route path="/export" element={<ImportExportLive toast={toast} />} />
      <Route path="/403" element={<ErrorPage code="403" />} />
      <Route path="/500" element={<ErrorPage code="500" />} />
      <Route path="/offline" element={<ErrorPage code="Offline" />} />
      <Route path="*" element={<ErrorPage code="404" />} />
    </Routes>
  );
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
        <button className="btn primary" onClick={() => nav("/tickets/new")}>
          <Icons.Plus />
          Add ticket
        </button>
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

function TicketTable({ rows }: { rows?: Ticket[] }) {
  const { tickets: wsTickets } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";

  const data = rows || wsTickets;

  // Filter
  const filtered = data.filter((t) => {
    const matchesQ = q
      ? t.title.toLowerCase().includes(q.toLowerCase()) ||
        t.key.toLowerCase().includes(q.toLowerCase())
      : true;
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

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Status</th>
            <th>Priority</th>
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
  return (
    <>
      <PageHead
        title="Tickets"
        desc="Find and manage work across your organization."
      >
        <button className="btn primary" onClick={() => nav("/tickets/new")}>
          <Icons.Plus />
          New ticket
        </button>
      </PageHead>
      <FilterBar placeholder="Search by key or title…" />
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
  } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const [view, setView] = useState<"board" | "list">("board");
  const [filters, setFilters] = useState(false);
  const [selectedTickets, setSelectedTickets] = useState<string[]>([]);

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
    const matchesQ =
      t.title.toLowerCase().includes(q.toLowerCase()) ||
      t.key.toLowerCase().includes(q.toLowerCase());
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
    : filteredTickets;

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
      {filters && <FilterBar placeholder="Search tickets…" />}
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
          <button className="btn primary" onClick={handleBulkUpdate}>
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
            <section key={s}>
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
                  <article className="ticket-card" key={t.id}>
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
                    <div className="labels">
                      {t.labels.map((l: string) => (
                        <Badge key={l}>{l}</Badge>
                      ))}
                    </div>
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
            <span>Capacity</span>
            <strong>{s.capacity}</strong>
            <small>Story points</small>
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
  const { dashboard, tickets, mutate } = useWorkspace();
  const nav = useNavigate();

  const s = (dashboard?.sprints || []).find((x: any) => x._id === sprintId);
  if (!s)
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint does not exist."
      />
    );

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
  const [destinationSprintId, setDestinationSprintId] = useState("");

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
  const { dashboard, tickets, mutate, toast } = useWorkspace();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const s = (dashboard?.sprints || []).find((x: any) => x._id === sprintId);
  if (!s)
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint does not exist."
      />
    );

  const sprintTickets = tickets.filter((t) => t.sprintId === s._id);

  const recalculateRisk = async () => {
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

      await mutate(() =>
        api(`/sprints/${s._id}`, {
          method: "PATCH",
          body: JSON.stringify({ riskScore: result.risk.finalScore }),
        }),
      );

      setAnalysis(result);
      toast("Sprint risk recalculated and saved successfully");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Recalculation failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    recalculateRisk();
  }, [sprintId]);

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
  const { tickets } = useWorkspace();
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
            <strong>12</strong>
            <small>Across 3 projects</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Due this week</span>
            <strong>5</strong>
            <small>2 high priority</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Logged this sprint</span>
            <strong>26h</strong>
            <small>Of 32h capacity</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Watched</span>
            <strong>8</strong>
            <small>3 updated today</small>
          </div>
        </article>
      </div>
      <FilterBar placeholder="Search my work…" />
      {view === "list" ? (
        <section className="card no-pad">
          <TicketTable
            rows={tickets.filter(
              (t) => t.assignee === "Maya Chen" || t.watched,
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
  const { dashboard, role, refetch, toast } = useWorkspace();
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

  const isLeader = ["admin", "manager"].includes(role);

  const resendInvite = async (userId: string) => {
    try {
      const res = await api<any>(`/invitations/${userId}/resend`, {
        method: "POST",
      });
      toast(
        "Invitation link resent: " +
          (res.inviteToken
            ? `itrack.app/accept-invite?token=${res.inviteToken}`
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
        {isLeader && (
          <button className="btn primary" onClick={() => nav("/team/invite")}>
            <Icons.UserPlus />
            Invite member
          </button>
        )}
      </PageHead>
      <FilterBar placeholder="Search people or skills…" />
      <div className="team-grid">
        {sorted.map((u: any) => {
          const workload = u.capacity
            ? Math.min(100, Math.round(((u.capacity || 0) / 40) * 100))
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
              {isLeader && u.inviteStatus === "invited" && (
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
                <small>{u.capacity || 0} of 40 hours available</small>
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
          role: userRole,
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

  const isLeader = ["admin", "manager"].includes(role);
  const isSelf = currentUser?.id === u._id;
  const canEdit = isLeader || isSelf;

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
                disabled={!isLeader}
              >
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="contributor">Contributor</option>
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

  const downloadJSON = () => {
    const dataToDownload = {
      project: selectedProject,
      member: selectedMember,
      startDate: startDateStr,
      metrics: {
        avgVelocity,
        completionRate,
        blockedTickets: blockedCount,
        cycleTime: report?.cycleTime ?? 4.8,
        leadTime: report?.leadTime ?? 7.2,
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
      ["Cycle Time (days)", String(report?.cycleTime ?? 4.8)],
      ["Lead Time (days)", String(report?.leadTime ?? 7.2)],
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

      <div className="metrics compact">
        <article className="metric">
          <div>
            <span>Avg. velocity</span>
            <strong>{avgVelocity}</strong>
            <small>points completed</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Completion rate</span>
            <strong>{completionRate}%</strong>
            <small>of total scope</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Cycle time</span>
            <strong>{report?.cycleTime ?? 4.8}d</strong>
            <small>average duration</small>
          </div>
        </article>
        <article className="metric">
          <div>
            <span>Blocked duration</span>
            <strong>{blockedCount * 3}d</strong>
            <small>estimated delay</small>
          </div>
        </article>
      </div>

      <div className="two-col">
        <section className="card">
          <CardTitle
            title="Sprint velocity"
            sub="Completed story points per sprint"
          />
          <div className="chart">
            <ResponsiveContainer>
              <BarChart data={chartVelocityData}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="n" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="v" fill="#A47BEF" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
        <section className="card">
          <CardTitle title="Risk trend" sub="Sprint risk score over time" />
          <div className="chart">
            <ResponsiveContainer>
              <AreaChart data={chartRiskData}>
                <XAxis dataKey="n" />
                <YAxis />
                <Tooltip />
                <Area
                  dataKey="v"
                  stroke="#F28C28"
                  fill="#F28C2833"
                  strokeWidth={3}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </>
  );
}

function AIPage({ toast }: { toast: (s: string) => void }) {
  const { dashboard, refetch } = useWorkspace();
  const navigate = useNavigate();
  const [plan, setPlan] = useState<any>(null),
    [prompt, setPrompt] = useState(""),
    [busy, setBusy] = useState(false),
    [models, setModels] = useState<string[]>([]),
    [selectedModel, setSelectedModel] = useState(""),
    [loadingModels, setLoadingModels] = useState(true);

  useEffect(() => {
    let active = true;
    const loadModels = async () => {
      try {
        const result = await api<{ models: string[] }>("/ai/models");
        if (!active) return;
        setModels(result.models);
        setSelectedModel((current) => current || result.models[0] || "");
      } catch (error) {
        if (active) {
          toast(error instanceof Error ? error.message : "Unable to load provider models");
        }
      } finally {
        if (active) setLoadingModels(false);
      }
    };
    void loadModels();
    return () => {
      active = false;
    };
  }, [toast]);

  const generate = async () => {
    setBusy(true);
    try {
      const result = await api<any>("/ai/generate-tickets", {
        method: "POST",
        body: JSON.stringify({ prompt, ...(selectedModel ? { model: selectedModel } : {}) }),
      });
      setPlan(result.plan);
      toast("Ticket plan generated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Generation failed");
    } finally {
      setBusy(false);
    }
  };
  const confirm = async () => {
    const project = dashboard?.projects?.[0],
      sprint = dashboard?.sprints?.[0],
      assignee = dashboard?.users?.[0];
    if (!project || !sprint || !assignee)
      return toast("Create a project, sprint, and user first");
    await api("/ai/confirm-ticket-plan", {
      method: "POST",
      body: JSON.stringify({
        plan,
        projectId: project._id,
        sprintId: sprint._id,
        assigneeId: assignee._id,
      }),
    });
    toast("Ticket plan created");
    await refetch();
    navigate("/tickets");
  };
  return (
    <>
      <PageHead
        eyebrow="AI WORKSPACE"
        title="Plan faster with I-Track AI"
        desc="Turn product requirements into structured, reviewable work."
      >
        <Badge tone="lime">
          <Icons.Sparkles />
          AI ENABLED
        </Badge>
      </PageHead>
      <div className="ai-layout">
        <section className="card ai-compose">
          <div className="model-select">
            <span className="insight-icon">
              <Icons.Bot />
            </span>
            <div>
              <small>MODEL</small>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                disabled={loadingModels || models.length === 0}
              >
                <option value="" disabled>
                  {loadingModels ? "Loading provider models…" : "Select a provider model"}
                </option>
                {models.map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
            </div>
            <Icons.ChevronDown />
          </div>
          <h2>What are you planning?</h2>
          <p>
            Describe a feature, initiative, or outcome. Include constraints and
            acceptance criteria when useful.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: Add enterprise SSO with SAML, organization discovery, audit events, and a safe migration for existing users…"
          />
          <div className="prompt-actions">
            <span>{prompt.length} / 4,000</span>
            <button
              className="btn lime"
              onClick={generate}
              disabled={prompt.trim().length < 20 || busy}
            >
              <Icons.Sparkles />
              Generate ticket plan
            </button>
          </div>
          <div className="prompt-chips">
            {[
              "Break down an epic",
              "Plan a migration",
              "Create test coverage",
            ].map((x) => (
              <button key={x} onClick={() => setPrompt(x)}>
                {x}
              </button>
            ))}
          </div>
        </section>
        <aside className="card ai-side">
          <CardTitle title="How it works" />
          <ol>
            <li>
              <span>1</span>
              <p>
                <b>Describe the outcome</b>Give AI enough context to plan well.
              </p>
            </li>
            <li>
              <span>2</span>
              <p>
                <b>Review every ticket</b>Edit priorities, points and
                dependencies.
              </p>
            </li>
            <li>
              <span>3</span>
              <p>
                <b>Confirm the plan</b>Nothing is created without approval.
              </p>
            </li>
          </ol>
          <div className="safe-note">
            <Icons.ShieldCheck />
            <p>
              <b>You stay in control</b>Destructive AI actions always require
              explicit confirmation.
            </p>
          </div>
        </aside>
      </div>
      {plan && (
        <section className="generated">
          <div className="generated-head">
            <div>
              <Badge tone="lime">{plan.stories.length} TICKETS GENERATED</Badge>
              <h2>Review your ticket plan</h2>
            </div>
            <button className="btn primary" onClick={confirm}>
              Confirm and create {plan.stories.length} tickets
            </button>
          </div>
          {plan.stories.map((t: any, i: number) => (
            <article className="generated-ticket" key={`${t.title}-${i}`}>
              <span>{i + 1}</span>
              <div>
                <input defaultValue={t.title} />
                <textarea defaultValue="Implementation details and acceptance criteria generated from your requirement." />
                <div>
                  <Badge tone={t.priority}>{t.priority}</Badge>
                  <Badge>{t.storyPoints} points</Badge>
                  <Badge>{t.labels[0]}</Badge>
                </div>
              </div>
              <button
                className="icon-btn"
                aria-label={`Remove ${t.title}`}
                onClick={() =>
                  setPlan({
                    ...plan,
                    stories: plan.stories.filter(
                      (_: any, index: number) => index !== i,
                    ),
                  })
                }
              >
                <Icons.Trash2 />
              </button>
            </article>
          ))}
        </section>
      )}
    </>
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

  // Workspace settings defaults state
  const [riskThreshold, setRiskThreshold] = useState(
    organization?.settings?.riskThreshold ?? 50,
  );
  const [sprintLengthDays, setSprintLengthDays] = useState(
    organization?.settings?.sprintLengthDays ?? 14,
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
    }
  }, [currentUser]);

  // Sync workspace settings if organization finishes loading later
  useEffect(() => {
    if (organization?.settings) {
      setRiskThreshold(organization.settings.riskThreshold ?? 50);
      setSprintLengthDays(organization.settings.sprintLengthDays ?? 14);
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

  const isLeader = ["admin", "manager"].includes(role);

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
                  {[
                    "Ticket assignments",
                    "Mentions and comments",
                    "Sprint risk alerts",
                    "Weekly summary",
                  ].map((x, i) => (
                    <label key={x}>
                      <span>
                        <b>{x}</b>
                        <small>Receive updates about {x.toLowerCase()}.</small>
                      </span>
                      <input type="checkbox" defaultChecked={i < 3} />
                    </label>
                  ))}
                </div>
                <button
                  className="btn primary"
                  onClick={() => toast("Preferences saved")}
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
                    disabled={!isLeader}
                  />
                </label>
                <label className="field">
                  <span>Risk threshold (0 - 100)</span>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={riskThreshold}
                    onChange={(e) => setRiskThreshold(e.target.value)}
                    disabled={!isLeader}
                  />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    disabled={!isLeader}
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
                    disabled={!isLeader}
                  />
                  <span>Enable AI Workspace and generative ticket tools</span>
                </label>
                {isLeader && (
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

function ImportExport({ toast }: { toast: (s: string) => void }) {
  const [file, setFile] = useState(false);
  return (
    <>
      <PageHead
        title="Import & export"
        desc="Move workspace data safely and predictably."
      />
      <div className="two-col">
        <section className="card import-card">
          <span className="big-icon">
            <Icons.ArrowDownToLine />
          </span>
          <h2>Import resources</h2>
          <p>Upload a JSON file containing up to 1,000 workspace resources.</p>
          <div
            className={cx("dropzone", file && "ready")}
            onClick={() => setFile(true)}
          >
            {file ? (
              <>
                <Icons.FileCheck2 />
                <b>northstar-resources.json</b>
                <span>248 records · 84 KB</span>
              </>
            ) : (
              <>
                <Icons.UploadCloud />
                <b>Drop a JSON file here</b>
                <span>or click to browse</span>
              </>
            )}
          </div>
          {file && (
            <button
              className="btn primary wide"
              onClick={() => toast("248 resources imported")}
            >
              Review and import 248 records
            </button>
          )}
        </section>
        <section className="card export-card">
          <span className="big-icon purple">
            <Icons.ArrowUpFromLine />
          </span>
          <h2>Export organization</h2>
          <p>Create a portable JSON export of all supported workspace data.</p>
          {[
            "Organization settings",
            "18 users",
            "12 projects and 684 tickets",
            "46 workspace resources",
          ].map((x) => (
            <div className="export-row" key={x}>
              <Icons.CheckCircle2 />
              {x}
            </div>
          ))}
          <button
            className="btn dark wide"
            onClick={() => toast("Export prepared successfully")}
          >
            <Icons.Download />
            Prepare export
          </button>
        </section>
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
  const { dashboard, refetch } = useWorkspace();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
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
            labels: [],
            blocked: false,
            dependencies: [],
          }),
        });
      if (type === "invite") {
        const res = await api<any>("/users/invite", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            email: values.get("email"),
            role: values.get("role"),
            capacity: Number(values.get("capacity")),
          }),
        });
        if (res.inviteToken) {
          window.prompt(
            "Send this invitation link to the user:",
            `itrack.app/accept-invite?token=${res.inviteToken}`
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
                  <option key={project._id} value={project.name}>
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
                  <option key={sprint._id} value={sprint.name}>
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
                  <option key={user._id} value={user.name}>
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
          <input name="currentPassword" type="password" required />
        </label>
        <label className="field">
          <span>New password</span>
          <input name="newPassword" type="password" minLength={8} required />
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
  } = useWorkspace();
  const [tab, setTab] = useState("comments");

  const raw = (dashboard?.tickets || []).find(
    (item: any) => item.ticketId === ticketId,
  );

  if (!raw)
    return (
      <Empty
        title="Ticket not found"
        body="This ticket does not exist in the current workspace."
      />
    );

  const [title, setTitle] = useState(raw.title);
  const [desc, setDesc] = useState(raw.description || "");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [isEditingDesc, setIsEditingDesc] = useState(false);

  // Sync state if ticket changes
  useEffect(() => {
    setTitle(raw.title);
    setDesc(raw.description || "");
  }, [raw]);

  const updateField = async (fields: any) => {
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}`, {
          method: "PATCH",
          body: JSON.stringify(fields),
        }),
      );
      toast("Ticket updated successfully");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed");
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
          isEditingTitle ? (
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
              onClick={() => setIsEditingTitle(true)}
              style={{ cursor: "pointer", borderBottom: "1px dashed #ccc" }}
            >
              {raw.title}
            </span>
          )
        }
        desc={
          isEditingDesc ? (
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
              onClick={() => setIsEditingDesc(true)}
              style={{ cursor: "pointer", borderBottom: "1px dashed #ccc" }}
            >
              {raw.description || "(No description, click to add)"}
            </p>
          )
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
        <button className="btn" onClick={clone}>
          <Icons.CopyPlus />
          Clone
        </button>
        {isLeader && (
          <button className="btn warning" onClick={toggleArchive}>
            {raw.archivedAt ? "Restore" : "Archive"}
          </button>
        )}
        <button className="btn danger" onClick={remove}>
          <Icons.Trash2 />
          Delete
        </button>
      </PageHead>
      <div className="ticket-layout">
        <section className="ticket-main">
          <div className="card">
            <CardTitle title="Acceptance criteria" />
            {(raw.acceptanceCriteria || []).map((item: string) => (
              <label className="check" key={item}>
                <input type="checkbox" />
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

  const isLeader = ["admin", "manager"].includes(role);

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
                  disabled={!isLeader}
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
            {isLeader && (
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
          {isLeader && (
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
  const { tickets: wsTickets } = useWorkspace();
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
        <button
          className="btn primary"
          onClick={() => navigate("/tickets/new")}
        >
          <Icons.Plus />
          Create ticket
        </button>
      </PageHead>
      <FilterBar placeholder="Search backlog…" />
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
          />
        )}
      </section>
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
  const { dashboard } = useWorkspace();
  const rawSprints = dashboard?.sprints || [];
  const items = rawSprints.filter((s: any) => {
    if (projectFilter && s.project?.name !== projectFilter) return false;
    return true;
  });

  return (
    <>
      <PageHead title="Sprints" desc="Live sprint plans and delivery status.">
        <button
          className="btn primary"
          onClick={() => navigate("/sprints/new")}
        >
          <Icons.Plus />
          New sprint
        </button>
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
              </article>
            );
          })
        ) : (
          <Empty
            title="No sprints"
            body="Create the first sprint for this workspace."
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
              body="No resources of this type exist yet."
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
  const isLeader = ["admin", "manager"].includes(role);

  const create = async () => {
    if (!isLeader)
      return toast("Only admins and managers can create integrations");
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
    if (!isLeader)
      return toast("Only admins and managers can delete integrations");
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
        {isLeader && (
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
              {isLeader && (
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
  const { dashboard: d = {}, user: currentUser, organization, projects, tickets, people, risk } = useWorkspace();
  const summary = d.summary || {};
  const active =
    (d.sprints || []).find((s: any) => s.status === "active") || d.sprints?.[0];
  const planned = active?.plannedPoints || 0;
  const completed = active?.completedPoints || 0;
  const progress = planned ? Math.round((completed / planned) * 100) : 0;
  const recommendation = d.recommendation || {};
  const metrics = [
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
    [
      "At-risk sprints",
      summary.atRiskSprints ?? 0,
      "Risk threshold exceeded",
      "Activity",
      "orange",
    ],
    [
      "Blocked tasks",
      summary.blockedTasks ?? 0,
      `${tickets.filter((t: any) => t.blocked && t.priority === "critical").length} critical`,
      "CircleSlash2",
      "red",
    ],
    [
      "Sprint health",
      `${summary.sprintHealth ?? 0}%`,
      active?.name || "No active sprint",
      "HeartPulse",
      "green",
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
        desc={`Live delivery data from ${organization?.name || "Workspace"}.`}
      />
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
  const [menuOpen, setMenuOpen] = useState(false);
  const year = new Date().getFullYear();
  const features = [
    { icon: Icons.Gauge, title: "See risk before it slips", text: "Live sprint health, workload signals, and delivery forecasts give every team an honest view of what happens next." },
    { icon: Icons.Sparkles, title: "Turn updates into action", text: "Ask I-TRACK what changed, where work is blocked, and what deserves attention—without another status meeting." },
    { icon: Icons.Route, title: "Keep work moving", text: "Plan, prioritize, and ship from one focused workspace built for product, design, and engineering teams." },
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <a className="landing-logo" href="#top" aria-label="I-TRACK home"><span>I</span>I-TRACK</a>
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
          <a href="/login">Log in</a>
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
              <div className="proof-avatars"><span>AK</span><span>JM</span><span>RL</span><span>+2k</span></div>
              <p><b>Trusted by ambitious teams</b><br/>No credit card · Free to get started</p>
            </div>
          </div>
          <div className="hero-visual" aria-label="I-TRACK sprint dashboard preview">
            <div className="visual-glow"></div>
            <div className="mini-app">
              <div className="mini-sidebar">
                <div className="mini-brand">I</div>
                {[Icons.LayoutDashboard, Icons.FolderKanban, Icons.Columns3, Icons.ChartNoAxesCombined].map((Icon, i) => <span className={i === 0 ? "active" : ""} key={i}><Icon /></span>)}
              </div>
              <div className="mini-main">
                <div className="mini-top"><span>SPRINT OVERVIEW</span><div><Icons.Search/><b>AK</b></div></div>
                <div className="mini-heading"><div><small>Current sprint</small><h3>Momentum is building.</h3></div><button disabled>+ Create issue</button></div>
                <div className="mini-stats">
                  <article><small>SPRINT HEALTH</small><strong>84<span>%</span></strong><i>On track</i></article>
                  <article><small>COMPLETED</small><strong>32<span>/ 41</span></strong><div className="mini-bar"><i></i></div></article>
                  <article><small>TEAM VELOCITY</small><strong>+18<span>%</span></strong><svg viewBox="0 0 120 30"><path d="M0 25 C22 23 24 11 42 17 S70 24 82 8 S105 11 120 2"/></svg></article>
                </div>
                <div className="mini-board">
                  <div><small>TO DO <b>4</b></small><article><i></i><p>Refine onboarding flow</p><span>WEB-241 <b>JM</b></span></article><article><i></i><p>Mobile empty states</p><span>APP-88 <b>RL</b></span></article></div>
                  <div><small>IN PROGRESS <b>3</b></small><article className="purple"><i></i><p>Workspace analytics</p><span>WEB-238 <b>AK</b></span></article><article><i></i><p>API rate limits</p><span>API-104 <b>DS</b></span></article></div>
                  <div><small>DONE <b>12</b></small><article><i className="done"></i><p>Search command</p><span>WEB-233 <b>JM</b></span></article><article><i className="done"></i><p>Sprint summary</p><span>APP-82 <b>AK</b></span></article></div>
                </div>
              </div>
            </div>
            <div className="floating-card risk-card"><span><Icons.ShieldCheck /></span><div><small>SPRINT RISK</small><b>Low risk</b></div><strong>12</strong></div>
            <div className="floating-card ai-card"><Icons.Sparkles /><div><small>I-TRACK AI</small><b>3 blockers resolved this week</b></div></div>
          </div>
        </section>

        <section className="logo-strip" id="customers"><p>Helping modern teams build what matters</p><div><b>northstar</b><b>Vertex</b><b>APERTURE</b><b>lumon</b><b>QUANTUM</b></div></section>

        <section className="landing-section" id="features">
          <div className="section-intro"><div><span className="section-kicker">ONE WORKSPACE. TOTAL CLARITY.</span><h2>Less tracking.<br/>More momentum.</h2></div><p>Your team shouldn't have to chase updates across five tools. I-TRACK puts the signal front and center, so everyone knows what matters now.</p></div>
          <div className="feature-grid">{features.map(({icon: Icon,title,text}, i) => <article key={title}><span className={`feature-icon f${i}`}><Icon /></span><h3>{title}</h3><p>{text}</p><a href="/register">Learn more <Icons.ArrowUpRight /></a></article>)}</div>
        </section>

        <section className="workflow-section" id="workflow">
          <div className="workflow-card"><div className="workflow-copy"><span className="section-kicker">FROM PLAN TO PROGRESS</span><h2>A clearer way to move work forward.</h2><p>Turn goals into focused sprints, spot trouble early, and help every teammate do their best work.</p>{["Plan around real team capacity","Catch blockers before standup","Share progress without the status chase"].map(x=><div className="workflow-point" key={x}><Icons.Check />{x}</div>)}<a className="landing-button" href="/register">Explore I-TRACK <Icons.ArrowRight/></a></div><div className="workflow-visual"><div className="pulse-ring"><span><Icons.Activity/></span></div><div className="signal signal-one"><small>SPRINT CONFIDENCE</small><b>92%</b><i></i></div><div className="signal signal-two"><Icons.Zap/><span><b>2 risks caught early</b><small>AI sprint analysis</small></span></div><div className="signal signal-three"><small>DELIVERY TREND</small><svg viewBox="0 0 180 65"><path d="M0 56 C30 53 30 40 55 44 S86 42 105 25 S143 30 180 5"/></svg></div></div></div>
        </section>

        <section className="quote-section"><Icons.Quote/><blockquote>“I-TRACK gave us back the one thing our team was missing: a shared sense of what matters. We plan less, unblock faster, and ship with confidence.”</blockquote><div className="quote-person"><span>MC</span><p><b>Maya Chen</b><small>VP of Product at Northstar</small></p></div></section>

        <section className="cta-section" id="pricing"><div><span className="section-kicker">YOUR NEXT SPRINT STARTS HERE</span><h2>Ready to move<br/>with clarity?</h2></div><div><p>Bring your team, your work, and your ambition. I-TRACK will help you keep the rest on track.</p><a className="landing-button dark" href="/register">Start for free <Icons.ArrowRight/></a><small>Free forever for teams up to 10</small></div></section>
      </main>
      <footer className="landing-footer"><a className="landing-logo" href="#top"><span>I</span>I-TRACK</a><p>© {year} I-TRACK. Built for momentum.</p><div><a href="#features">Product</a><a href="#pricing">Pricing</a><a href="/login">Log in</a></div></footer>
    </div>
  );
}

function AuthPageLive({ type }: { type: string }) {
  const nav = useNavigate();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const titles: Record<string, string> = {
    login: "Welcome back",
    register: "Create your workspace",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
    "accept-invite": "Join your workspace",
  };
  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    const data = new FormData(e.currentTarget);
    try {
      if (type === "login") {
        await login(String(data.get("email")), String(data.get("password")));
        nav("/dashboard");
        location.reload();
        return;
      }
      if (type === "register") {
        const session = await api<any>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            organizationName: data.get("organizationName"),
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        localStorage.setItem("itrack_token", session.token);
        localStorage.setItem("itrack_refresh_token", session.refreshToken);
        nav("/dashboard");
        location.reload();
        return;
      }
      if (type === "forgot-password") {
        await api("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: data.get("email") }),
        });
        setError("If the account exists, reset instructions were created.");
        return;
      }
      setError(
        "Open this page using the token from your invitation or password-reset link.",
      );
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
          <div className="brand-mark">I</div>
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
              : "Complete the details below to continue."}
          </p>
          {type === "register" && (
            <>
              <label className="field">
                <span>Full name</span>
                <input name="name" required />
              </label>
              <label className="field">
                <span>Organization</span>
                <input name="organizationName" required />
              </label>
            </>
          )}
          <label className="field">
            <span>Email address</span>
            <input
              name="email"
              type="email"
              defaultValue={type === "login" ? "maya@itrack.dev" : ""}
              required
            />
          </label>
          {type !== "forgot-password" && (
            <label className="field">
              <span>Password</span>
              <input
                name="password"
                type="password"
                defaultValue={type === "login" ? "Password123!" : ""}
                minLength={8}
                required
              />
            </label>
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
          <button className="btn primary wide" disabled={busy}>
            {busy
              ? "Please wait…"
              : type === "login"
                ? "Sign in"
                : type === "forgot-password"
                  ? "Send reset instructions"
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
