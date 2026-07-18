import React, { useEffect, useState, useMemo, useRef } from "react";
import { useNavigate, useSearchParams, useParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { appPrompt, appForm, appConfirm } from "../components/AppDialog";
import { Avatar, Badge, CardTitle, PageHead, Empty, FilterBar, LabelChips, LabelPicker } from "../components/ui";
import { fmt } from "../../utils/ui";
import type { Ticket } from "../../types/domain";

export function matchesTicket(
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

export function TicketTable({ rows }: { rows?: Ticket[] }) {
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

  // Palette for epic colours (cycles through)
  const EPIC_COLORS = ["#7c3aed","#0ea5e9","#f59e0b","#10b981","#ef4444","#ec4899","#6366f1","#14b8a6"];
  const epicColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    let i = 0;
    sorted.forEach((t) => {
      const e = (t.epic as string | undefined) || "";
      if (e && !map[e]) map[e] = EPIC_COLORS[i++ % EPIC_COLORS.length];
    });
    return map;
  }, [sorted]);

  // Group by epic
  type Group = { epic: string; color: string; tickets: typeof sorted };
  const groups: Group[] = useMemo(() => {
    const map = new Map<string, typeof sorted>();
    sorted.forEach((t) => {
      const e = (t.epic as string | undefined) || "No Epic";
      if (!map.has(e)) map.set(e, []);
      map.get(e)!.push(t);
    });
    return Array.from(map.entries()).map(([epic, tickets]) => ({
      epic,
      color: epicColorMap[epic] || "#94a3b8",
      tickets,
    }));
  }, [sorted, epicColorMap]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleEpic = (epic: string) =>
    setCollapsed((prev) => ({ ...prev, [epic]: !prev[epic] }));

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Ticket</th>
            <th>Epic</th>
            <th>Status</th>
            <th>Priority</th>
            <th>SLA</th>
            <th>Assignee</th>
            <th>Points</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(({ epic, color, tickets }) => (
            <React.Fragment key={epic}>
              {/* Epic group header row */}
              <tr
                className="epic-group-row"
                onClick={() => toggleEpic(epic)}
                style={{ cursor: "pointer" }}
                aria-label={`Toggle ${epic} group`}
              >
                <td colSpan={7} style={{ padding: "8px 14px" }}>
                  <span className="epic-group-header">
                    <span className="epic-swatch" style={{ background: color }} />
                    <span className="epic-group-name">{epic}</span>
                    <span className="epic-count">{tickets.length} ticket{tickets.length !== 1 ? "s" : ""}</span>
                    <span className="epic-chevron">{collapsed[epic] ? "▶" : "▼"}</span>
                  </span>
                </td>
              </tr>
              {/* Ticket rows under this epic */}
              {!collapsed[epic] && tickets.map((t) => (
                <tr
                  key={t.id}
                  onClick={() => nav(`/tickets/${t.key}`)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      nav(`/tickets/${t.key}`);
                    }
                  }}
                  tabIndex={0}
                  aria-label={`Open ${t.key}: ${t.title}`}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <small>{t.key}</small>
                    <b>{t.title}</b>
                    <LabelChips labels={t.labels} />
                  </td>
                  <td>
                    {(t.epic as string | undefined) ? (
                      <span className="epic-pill" style={{ background: `${color}22`, color, borderColor: `${color}55` }}>
                        <Icons.Layers size={10} />
                        {t.epic}
                      </span>
                    ) : (
                      <span className="epic-pill-none">—</span>
                    )}
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
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TicketList() {
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

export function TicketDetailLive({ toast }: { toast: (s: string) => void }) {
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
  const fileInputRef = useRef<HTMLInputElement>(null);
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
      (await appPrompt(`Type ${raw.ticketId} to delete this ticket`)) !==
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
    const values = await appForm({
      title: "Add comment",
      message: "Share an update with everyone following this ticket.",
      fields: [{ name: "body", label: "Comment", type: "textarea", required: true, placeholder: "Write a comment…" }],
      confirmLabel: "Add comment",
    });
    const body = values?.body?.trim();
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
    const values = await appForm({
      title: "Edit comment",
      fields: [{ name: "body", label: "Comment", type: "textarea", defaultValue: currentBody, required: true }],
      confirmLabel: "Save comment",
    });
    const body = values?.body?.trim();
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
    if (!(await appConfirm("Delete this comment?"))) return;
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
    const values = await appForm({
      title: "Log work",
      fields: [
        { name: "note", label: "Work note", type: "textarea", required: true, placeholder: "What did you work on?" },
        { name: "hours", label: "Hours worked", type: "number", defaultValue: "1", required: true },
      ],
      confirmLabel: "Add work log",
    });
    const note = values?.note?.trim();
    const hours = Number(values?.hours);
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
    const values = await appForm({
      title: "Edit work log",
      fields: [
        { name: "note", label: "Work note", type: "textarea", defaultValue: currentNote, required: true },
        { name: "hours", label: "Hours worked", type: "number", defaultValue: String(currentHours), required: true },
      ],
      confirmLabel: "Save work log",
    });
    const note = values?.note?.trim();
    const hours = Number(values?.hours);
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
    if (!(await appConfirm("Delete this work log?"))) return;
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

  const addAttachment = async (file: File) => {
    if (file.size > 10_000_000) {
      toast("Files must be 10 MB or smaller");
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Unable to read this file"));
        reader.readAsDataURL(file);
      });
      await mutate(() =>
        api(`/tickets/${raw._id}/attachments`, {
          method: "POST",
          body: JSON.stringify({
            name: file.name,
            dataUrl,
            mimeType: file.type || "application/octet-stream",
            size: file.size,
          }),
        }),
      );
      toast("File uploaded and stored");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to add attachment");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const addIssueLink = async () => {
    const ticketOptions = (dashboard?.tickets || [])
      .filter((t: any) => t._id !== raw._id)
      .map((t: any) => ({ label: `${t.ticketId} – ${t.title}`, value: t._id }));

    const values = await appForm({
      title: "Link ticket",
      fields: [
        {
          name: "type",
          label: "Link type",
          type: "select",
          defaultValue: "relates-to",
          required: true,
          options: [
            { label: "Relates to", value: "relates-to" },
            { label: "Blocks", value: "blocks" },
            { label: "Is blocked by", value: "is-blocked-by" },
            { label: "Duplicates", value: "duplicates" },
          ],
        },
        {
          name: "targetId",
          label: "Ticket key",
          type: "select",
          required: true,
          options: ticketOptions,
        },
      ],
      confirmLabel: "Add link",
    });
    const type = values?.type;
    const targetId = values?.targetId;
    if (!targetId) return;
    try {
      await mutate(() =>
        api(`/tickets/${raw._id}/links`, {
          method: "POST",
          body: JSON.stringify({ type, ticket: targetId }),
        }),
      );
      toast("Issue link added");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to link ticket");
    }
  };

  const deleteAttachment = async (attachmentId: string) => {
    if (!(await appConfirm("Delete this attachment?"))) return;
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
              <>
                <button
                  className="btn primary"
                  onClick={
                    tab === "comments"
                      ? addComment
                      : tab === "workLogs"
                        ? addWorkLog
                        : () => fileInputRef.current?.click()
                  }
                  style={{ marginBottom: "1rem" }}
                >
                  {tab === "attachments" ? <Icons.Upload /> : <Icons.Plus />}
                  {tab === "attachments" ? "Upload file" : `Add ${tab === "workLogs" ? "work log" : tab.slice(0, -1)}`}
                </button>
                {tab === "attachments" && (
                  <input
                    ref={fileInputRef}
                    type="file"
                    hidden
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void addAttachment(file);
                    }}
                  />
                )}
              </>
            )}
            <div className="timeline">
              {tabItems.length ? (
                tabItems.map((item: any, index: number) => (
                  <div
                    key={item._id || item.id || index}
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
                          {tab === "attachments" ? (
                            <a
                              href={item.dataUrl || item.url}
                              download={item.dataUrl ? item.name : undefined}
                              target={item.url ? "_blank" : undefined}
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {item.name}
                            </a>
                          ) : item.body || item.note || item.event}
                        </b>
                        <small style={{ marginLeft: "10px" }}>
                          {item.hours ? `${item.hours} hours · ` : ""}
                          {item.size ? `${Math.ceil(item.size / 1024)} KB · ` : ""}
                          {item.storage === "database" ? "Stored file · " : ""}
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
                            onClick={() => deleteAttachment(item._id || item.id)}
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
          {Object.keys(raw.customFields || {}).length > 0 && <div className="ticket-custom-fields"><span>Custom fields</span>{Object.entries(raw.customFields || {}).map(([key, value]) => <div className="detail-row" key={key}><span>{key}</span><b>{String(value || "—")}</b></div>)}</div>}
          {/* Epic breadcrumb */}
          {raw.epic && (
            <div className="detail-row epic-detail-row">
              <span>Epic</span>
              <span className="epic-breadcrumb">
                <Icons.Layers size={12} />
                {raw.epic}
              </span>
            </div>
          )}

          {/* Tickets in this Epic */}
          {raw.epic && (() => {
            const siblings = (dashboard?.tickets || []).filter(
              (t: any) => t.epic === raw.epic && t.ticketId !== raw.ticketId
            );
            return siblings.length > 0 ? (
              <div className="epic-siblings">
                <div className="epic-siblings-title">
                  <Icons.Layers size={12} />
                  Other tickets in this epic
                </div>
                {siblings.slice(0, 5).map((s: any) => (
                  <button
                    key={s._id}
                    className="epic-sibling-btn"
                    onClick={() => navigate(`/tickets/${s.ticketId}`)}
                  >
                    <small>{s.ticketId}</small>
                    <span>{s.title}</span>
                  </button>
                ))}
                {siblings.length > 5 && (
                  <span className="epic-siblings-more">+{siblings.length - 5} more</span>
                )}
              </div>
            ) : null;
          })()}

          <div className="ticket-links">
            <span>Issue links</span>
            {(raw.issueLinks || []).map((link: any, index: number) => {
              const target = (dashboard?.tickets || []).find(
                (ticket: any) => String(ticket._id) === String(link.ticket),
              );
              return (
                <button
                  className="ticket-link"
                  key={`${link.type}-${link.ticket}-${index}`}
                  onClick={() => target && navigate(`/tickets/${target.ticketId}`)}
                  disabled={!target}
                >
                  <Icons.Link2 />
                  <span><small>{fmt(link.type)}</small><b>{target?.ticketId || "Unavailable ticket"}</b></span>
                </button>
              );
            })}
            {!(raw.issueLinks || []).length && <small>No linked issues</small>}
            {isLeader && (
              <button className="btn wide" onClick={addIssueLink}>
                <Icons.Link2 />
                Link issue
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
