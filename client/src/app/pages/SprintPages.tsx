import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, useParams, NavLink } from "react-router-dom";
import * as Icons from "lucide-react";
import { Area, AreaChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { appConfirm } from "../components/AppDialog";
import { Avatar, Badge, Button, CardTitle, PageHead, Progress, Empty, FilterBar, ViewToggle, LabelChips, ModalOverlay } from "../components/ui";
import { fmt } from "../../utils/ui";
import { matchesTicket, TicketTable } from "./TicketPages";
import { RiskPage } from "./RiskPage";
import { MiniDatePicker } from "../components/MiniDatePicker";
import { CenteredForm, ErrorPage } from "./FormPage";
import type { Ticket, TicketStatus } from "../../types/domain";

export function Board({
  toast,
  projectFilter,
  ticketFilter,
}: {
  toast: (s: string) => void;
  projectFilter?: string;
  ticketFilter?: (ticket: Ticket) => boolean;
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
  const [filters, setFilters] = useState(true);
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
    if (ticketFilter && !ticketFilter(t)) return false;
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
        <ViewToggle
          value={view}
          onChange={(next) => setView(next as "board" | "list")}
          options={[
            { value: "board", label: "Board", icon: Icons.Columns3 },
            { value: "list", label: "List", icon: Icons.List },
          ]}
        />
        <span className="board-ticket-count"><b>{activeTickets.length}</b> tickets</span>
        <span className="board-save-note"><Icons.CloudCheck /> Changes save automatically</span>
        <div className="avatar-stack">
          {wsPeople.map((p) => (
            <Avatar key={p.email} name={p.name} color={p.color} />
          ))}
        </div>
      </div>

      {selectedTickets.length > 0 && (
        <div className="card bulk-actions">
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
                        aria-label={`Select ${t.key}`}
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
                        aria-label={`Move ${t.key} up`}
                        title="Move ticket up"
                        onClick={() => changeRank(t.id, t.rank || 0, 1)}
                      >
                        <Icons.ChevronUp size={14} />
                      </button>
                      <button
                        className="icon-btn"
                        aria-label={`Move ${t.key} down`}
                        title="Move ticket down"
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
                          aria-label={`Select ${t.key}`}
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

export function SprintDetail() {
  const { sprintId } = useParams();
  const { dashboard, tickets, mutate, role, toast } = useWorkspace();
  const nav = useNavigate();

  if (sprintId === "risk" || sprintId === "sprint-risk" || sprintId === "sprint risk") {
    return <RiskPage />;
  }

  const s = (dashboard?.sprints || []).find((x: any) => String(x._id) === String(sprintId));
  if (!s) {
    const hasSprints = (dashboard?.sprints || []).length > 0;
    return (
      <Empty
        title="Sprint not found"
        body={hasSprints ? "The requested sprint does not exist." : "There are no sprints in this workspace yet."}
        action={hasSprints ? { label: "Back to sprints", to: "/sprints" } : { label: "Create a sprint", to: "/sprints/new" }}
      />
    );
  }

  const progress = Number(s.plannedPoints) > 0
    ? Math.round(((Number(s.completedPoints) || 0) / Number(s.plannedPoints)) * 100)
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
    if (!(await appConfirm("Are you sure you want to delete this sprint?"))) return;
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

export function CompleteSprint({ toast }: { toast: (s: string) => void }) {
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
  const completionRate = Number(s.plannedPoints) > 0
    ? Math.round((completedPoints / Number(s.plannedPoints)) * 100)
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
          body: JSON.stringify(
            destinationSprintId
              ? { moveIncompleteToSprint: destinationSprintId }
              : {},
          ),
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
            <option value="">No sprint</option>
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

export function BacklogLive({
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
      <div className="queue-summary">
        <span className="queue-summary-icon"><Icons.ListTodo /></span>
        <span><b>{backlog.length} unplanned {backlog.length === 1 ? "ticket" : "tickets"}</b><small>Prioritize the next piece of work before it enters a sprint.</small></span>
        <NavLink className="text-btn" to="/board?filter=open">Open delivery board <Icons.ArrowRight /></NavLink>
      </div>
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

export function CyclesLive({ toast }: { toast: (s: string) => void }) {
  const { dashboard, refetch, role } = useWorkspace();
  const [creating, setCreating] = useState(false);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const cycles = dashboard?.cycles || [];
  const sprints = dashboard?.sprints || [];
  const isLeader = ["admin", "manager"].includes(role);
  const activeCycles = cycles.filter((cycle: any) => cycle.status === "active").length;
  const assignedSprints = cycles.reduce((sum: number, cycle: any) => sum + (cycle.sprints?.length || 0), 0);
  const totalPlannedPoints = cycles.reduce(
    (sum: number, cycle: any) => sum + (cycle.sprints || []).reduce((cycleSum: number, sprint: any) => cycleSum + (sprint.plannedPoints || 0), 0),
    0,
  );

  useEffect(() => {
    if (!isCreateOpen) {
      setStartDate("");
      setEndDate("");
    }
  }, [isCreateOpen]);

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
      setStartDate("");
      setEndDate("");
      toast("Cycle created");
      setIsCreateOpen(false);
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to create cycle");
    } finally {
      setCreating(false);
    }
  };

  const deleteCycle = async (cycleId: string) => {
    if (!(await appConfirm("Delete this cycle? Sprints will remain intact."))) return;
    try {
      await api(`/cycles/${cycleId}`, { method: "DELETE" });
      toast("Cycle deleted");
      await refetch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed to delete cycle");
    }
  };

  return (
    <div className="cycles-page">
      <PageHead title="Cycles" desc="Connect sprints to a shared outcome and track delivery across a longer planning window.">
        {isLeader && (
          <button className="btn primary" onClick={() => setIsCreateOpen(true)}>
            <Icons.Plus /> New cycle
          </button>
        )}
      </PageHead>

      <section className="cycle-overview" aria-label="Cycle overview">
        <div className="cycle-overview-intro">
          <span className="cycle-overview-icon"><Icons.Repeat2 /></span>
          <div>
            <small>PLANNING OVERVIEW</small>
            <strong>{cycles.length ? `${cycles.length} cycle${cycles.length === 1 ? "" : "s"} mapped` : "Build your first cycle"}</strong>
            <p>Keep sprint execution aligned with the outcomes that matter.</p>
          </div>
        </div>
        <div className="cycle-stat">
          <span>Active cycles</span>
          <strong>{activeCycles}</strong>
          <small>{activeCycles ? "Currently in delivery" : "None in delivery"}</small>
        </div>
        <div className="cycle-stat">
          <span>Linked sprints</span>
          <strong>{assignedSprints}</strong>
          <small>{sprints.length} available in workspace</small>
        </div>
        <div className="cycle-stat">
          <span>Planned scope</span>
          <strong>{totalPlannedPoints}</strong>
          <small>Story points across cycles</small>
        </div>
      </section>

      <div className="cycle-workspace cycle-workspace-viewer">
        <section className="cycle-plan-panel">
          <div className="cycle-section-head">
            <div>
              <h2>Cycle plan</h2>
              <p>{cycles.length ? "Review outcomes, dates, scope, and delivery progress." : "Your longer-term delivery plan will appear here."}</p>
            </div>
            <span className="cycle-count">{cycles.length} total</span>
          </div>
          <div className="cycle-list">
            {cycles.length ? cycles.map((cycle: any) => {
              const planned = (cycle.sprints || []).reduce((sum: number, sprint: any) => sum + (Number(sprint.plannedPoints) || 0), 0);
              const completed = (cycle.sprints || []).reduce((sum: number, sprint: any) => sum + (Number(sprint.completedPoints) || 0), 0);
              const progress = planned > 0 ? Math.round((completed / planned) * 100) : 0;
              return (
                <article className="cycle-card" key={cycle._id}>
                  <div className="cycle-card-head">
                    <div>
                      <div className="cycle-title-line">
                        <h3>{cycle.name}</h3>
                        <Badge tone={cycle.status === "active" ? "lime" : cycle.status === "completed" ? "green" : "neutral"}>{cycle.status}</Badge>
                      </div>
                      <p>{cycle.goal || "Add a goal to give this cycle a clear outcome."}</p>
                    </div>
                    {isLeader && <button type="button" className="icon-btn cycle-delete" onClick={() => deleteCycle(cycle._id)} aria-label={`Delete ${cycle.name}`}><Icons.Trash2 /></button>}
                  </div>
                  <div className="cycle-card-meta">
                    <span><Icons.CalendarDays /><span><small>Timeline</small><b>{new Date(cycle.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} – {new Date(cycle.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</b></span></span>
                    <span><Icons.Layers3 /><span><small>Sprints</small><b>{cycle.sprints?.length || 0} linked</b></span></span>
                    <span><Icons.Gauge /><span><small>Scope</small><b>{completed} / {planned} pts</b></span></span>
                  </div>
                  <div className="cycle-progress">
                    <div><span>Delivery progress</span><strong>{progress}%</strong></div>
                    <Progress value={progress} />
                  </div>
                </article>
              );
            }) : <Empty title="No cycles yet" body={isLeader ? "Click 'New cycle' to create a cycle and connect related sprints." : "No cycles have been created yet."} />}
          </div>
        </section>
      </div>

      {isCreateOpen && (
        <ModalOverlay onClose={() => { if (!creating) setIsCreateOpen(false); }} ariaLabel="Create a cycle">
          <section
            className="card invite-review workspace-create-dialog"
            aria-labelledby="create-cycle-title"
            style={{ maxWidth: "500px", width: "100%" }}
          >
            <button
              className="icon-btn modal-close"
              onClick={() => setIsCreateOpen(false)}
              disabled={creating}
              aria-label="Close create cycle dialog"
            >
              <Icons.X />
            </button>
            <Badge tone="purple">NEW CYCLE</Badge>
            <h2 id="create-cycle-title" style={{ marginTop: "8px" }}>Plan an outcome</h2>
            <p style={{ color: "var(--muted)", fontSize: "13px", marginBottom: "20px" }}>Group related sprints into one delivery window.</p>
            <form onSubmit={createCycle} className="cycle-form">
              <label className="field">
                <span>Cycle name</span>
                <input name="name" placeholder="e.g. 2026 Q3 growth" required disabled={creating} />
              </label>
              <label className="field">
                <span>Goal <small>Optional</small></span>
                <textarea name="goal" placeholder="What outcome should this cycle achieve?" disabled={creating} />
              </label>
              <label className="field">
                <span>Status</span>
                <select name="status" defaultValue="planned" disabled={creating}>
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                </select>
              </label>
              <div className="cycle-date-fields" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <MiniDatePicker
                  name="startDate"
                  label="Starts"
                  value={startDate}
                  onChange={setStartDate}
                  required
                  disabled={creating}
                />
                <MiniDatePicker
                  name="endDate"
                  label="Ends"
                  value={endDate}
                  onChange={setEndDate}
                  required
                  disabled={creating}
                />
              </div>
              <div className="field" style={{ marginBottom: "20px" }}>
                <span>Sprints <small>{sprints.length} available</small></span>
                <div className="check-list cycle-sprint-list" style={{ maxHeight: "150px", overflowY: "auto" }}>
                  {sprints.length ? (
                    sprints.map((sprint: any) => (
                      <label key={sprint._id} style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0" }}>
                        <input type="checkbox" name="sprints" value={sprint._id} disabled={creating} />
                        <span>
                          {sprint.name}
                          <small style={{ display: "block", color: "var(--muted)" }}>{sprint.status ? fmt(sprint.status) : "Planned sprint"}</small>
                        </span>
                      </label>
                    ))
                  ) : (
                    <p>No sprints are available yet.</p>
                  )}
                </div>
              </div>
              <div className="form-actions">
                <Button onClick={() => setIsCreateOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button variant="primary" type="submit" loading={creating} loadingLabel="Creating...">
                  Create cycle
                </Button>
              </div>
            </form>
          </section>
        </ModalOverlay>
      )}
    </div>
  );
}

export function SprintsLive({
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
            const progress = Number(s.plannedPoints) > 0
              ? Math.round(((Number(s.completedPoints) || 0) / Number(s.plannedPoints)) * 100)
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
