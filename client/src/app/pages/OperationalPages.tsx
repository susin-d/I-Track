import React, { useEffect, useState } from "react";
import { NavLink, useNavigate, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api, apiFetch } from "../../api";
import { appConfirm, appForm, appPrompt } from "../components/AppDialog";
import { Badge, Button, Empty, PageHead } from "../components/ui";
import { TicketTable } from "./TicketPages";
import { fmt } from "../../utils/ui";
import { FilterBar } from "../components/ui";
import type { Ticket } from "../../types/domain";

export function SlaPage({ toast }: { toast: (s: string) => void }) {
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
    breached: slaTickets.filter((ticket: any) => ticket.slaStatus === "breached").length,
    dueSoon: slaTickets.filter((ticket: any) => ticket.slaStatus === "due_soon").length,
    healthy: slaTickets.filter((ticket: any) => !ticket.slaStatus || ticket.slaStatus === "healthy").length,
    resolved: slaTickets.filter((ticket: any) => ticket.slaStatus === "resolved").length,
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
    <div className="sla-page">
      <PageHead className="sla-page-head" eyebrow="Service level management" title="SLA overview" desc="Monitor commitments and set response targets for every priority.">
        <div className="sla-head-note">
          <Icons.Clock3 />
          <div>
            <b>Targets are measured in hours</b>
            <span>Due-soon tickets are within 4 hours</span>
          </div>
        </div>
      </PageHead>
      <div className="sla-metrics">
        {[
          { label: "Breached", value: summary.breached, note: "Needs attention", tone: "red", icon: Icons.CircleAlert },
          { label: "Due soon", value: summary.dueSoon, note: "Inside 4 hours", tone: "orange", icon: Icons.Timer },
          { label: "Healthy", value: summary.healthy, note: "On target", tone: "green", icon: Icons.ShieldCheck },
          { label: "Resolved", value: summary.resolved, note: "Completed", tone: "purple", icon: Icons.CircleCheckBig },
        ].map((item) => {
          const StatusIcon = item.icon;
          return (
            <article className={`sla-metric ${item.tone}`} key={item.label}>
              <div className="sla-metric-icon"><StatusIcon /></div>
              <div>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <small>{item.note}</small>
              </div>
            </article>
          );
        })}
      </div>
      <div className="sla-workspace">
        <section className="card sla-policy-card">
          <div className="sla-section-head">
            <div>
              <span className="sla-section-icon"><Icons.SlidersHorizontal /></span>
              <div>
                <h2>SLA policy</h2>
                <p>How fast we respond and resolve by priority</p>
              </div>
            </div>
            {!isLeader && <Badge>View only</Badge>}
          </div>
          <form className="sla-policy-grid" onSubmit={savePolicy}>
            {(["critical", "high", "medium", "low"] as const).map((priority) => (
              <div className={`sla-policy-row ${priority}`} key={priority}>
                <div className="sla-priority">
                  <i />
                  <div>
                    <b>{fmt(priority)}</b>
                    <span>priority</span>
                  </div>
                </div>
                <label className="field">
                  <span>Reply within</span>
                  <div className="sla-hour-input">
                    <input name={`${priority}-firstResponseHours`} type="number" min="0.25" step="0.25" defaultValue={policy[priority]?.firstResponseHours} disabled={!isLeader} />
                    <span>hrs</span>
                  </div>
                </label>
                <label className="field">
                  <span>Fix within</span>
                  <div className="sla-hour-input">
                    <input name={`${priority}-resolutionHours`} type="number" min="0.25" step="0.25" defaultValue={policy[priority]?.resolutionHours} disabled={!isLeader} />
                    <span>hrs</span>
                  </div>
                </label>
              </div>
            ))}
            {isLeader && (
              <div className="sla-policy-actions">
                <span>Applies to all open tickets.</span>
                <Button variant="primary" type="submit" loading={saving} loadingLabel="Saving...">Save policy</Button>
              </div>
            )}
          </form>
        </section>
        <section className="card sla-queue-card">
          <div className="sla-section-head">
            <div>
              <span className="sla-section-icon"><Icons.ListFilter /></span>
              <div>
                <h2>SLA queue</h2>
                <p>Prioritized by urgency</p>
              </div>
            </div>
            <span className="sla-ticket-count">{slaTickets.length} {slaTickets.length === 1 ? "ticket" : "tickets"}</span>
          </div>
          <div className="sla-queue-table">
            {slaTickets.length ? (
              <TicketTable rows={slaTickets} />
            ) : (
              <div className="sla-queue-empty">
                <Icons.Inbox />
                <h3>No tickets in the SLA queue</h3>
                <p>Tickets with an active SLA will appear here.</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export function AuditLogsLive() {
  const { auditLogs: rows = [] } = useWorkspace();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
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
        return sort === "desc" ? valB - valA : valA - valB;
      })
    : filtered;

  const exportAuditLog = async () => {
    const response = await apiFetch("/audit-logs/export");
    if (!response.ok) throw new Error("Audit export failed");
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <PageHead title="Audit logs" desc="Live organization activity from the audit API.">
        <button className="btn" onClick={() => void exportAuditLog()}>
          <Icons.Download />
          Export CSV
        </button>
      </PageHead>
      <FilterBar placeholder="Search actions or entities…" sortAscLabel="Oldest" sortDescLabel="Newest" />
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
          <Empty title="No audit events" body="Workspace activity will appear here." />
        )}
      </section>
    </>
  );
}

export function IntegrationsLive({ toast }: { toast: (s: string) => void }) {
  const { integrations: rows, mutate, role } = useWorkspace();
  const isAdmin = role === "admin";

  const create = async () => {
    if (!isAdmin) return toast("Only admins can create integrations");
    const values = await appForm({
      title: "Create integration",
      fields: [
        {
          name: "kind",
          label: "Integration type",
          type: "select",
          defaultValue: "webhook",
          required: true,
          options: [
            { label: "Webhook", value: "webhook" },
            { label: "API token", value: "api-token" },
          ],
        },
        { name: "name", label: "Integration name", required: true },
        { name: "url", label: "Webhook URL", placeholder: "https://…" },
      ],
      message: "API token integrations do not use the webhook URL.",
      confirmLabel: "Create integration",
    });
    const kind = values?.kind;
    const name = values?.name?.trim();
    if (!kind || !["webhook", "api-token"].includes(kind) || !name) return;
    const url = kind === "webhook" ? values?.url?.trim() || undefined : undefined;
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
        await appForm({
          title: "Integration token",
          message: "Copy this token now. It will not be shown again.",
          fields: [{ name: "token", label: "Token", defaultValue: createdToken }],
          confirmLabel: "Done",
          cancelLabel: "Close",
        });
      }
      toast("Integration created");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Creation failed");
    }
  };

  const remove = async (item: any) => {
    if (!isAdmin) return toast("Only admins can delete integrations");
    if (!(await appConfirm(`Delete ${item.name}?`))) return;
    try {
      await mutate(() => api(`/integrations/${item.kind}/${item._id}`, { method: "DELETE" }));
      toast("Integration deleted");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Deletion failed");
    }
  };

  return (
    <>
      <PageHead title="Integrations" desc="Live API tokens and webhooks for this organization.">
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
                {item.kind === "webhook" ? <Icons.Webhook /> : <Icons.KeyRound />}
              </span>
              <div>
                <h2>{item.name}</h2>
                <Badge>{item.kind}</Badge>
              </div>
              {isAdmin && (
                <button className="icon-btn" aria-label={`Delete ${item.name}`} onClick={() => remove(item)}>
                  <Icons.Trash2 />
                </button>
              )}
              <p>{item.url || "Secure token"}</p>
              <div>
                <Badge tone={item.active ? "green" : "neutral"}>
                  {item.active ? "Active" : "Inactive"}
                </Badge>
                <span>
                  {item.lastUsedAt ? `Last used ${new Date(item.lastUsedAt).toLocaleString()}` : "Never used"}
                </span>
              </div>
            </article>
          ))
        ) : (
          <Empty title="No integrations" body="Connect a webhook or create an API token." />
        )}
      </div>
    </>
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
  const [params] = useSearchParams();
  const { role, labelOptions } = useWorkspace();
  const [serverTickets, setServerTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const isLeader = role === "admin" || role === "manager";
  useEffect(() => {
    let active = true;
    const query = new URLSearchParams();
    if (projectFilter) query.set("project", projectFilter);
    if (params.get("q")) query.set("q", params.get("q")!);
    if (params.get("label")) query.set("label", params.get("label")!);
    setLoading(true); setError("");
    void api<any>(`/backlog?${query.toString()}`).then((result) => { if (active) setServerTickets(result.tickets || result.items || []); }).catch((requestError) => { if (active) { setServerTickets([]); setError(requestError instanceof Error ? requestError.message : "Unable to load backlog"); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [projectFilter, params]);
  const backlog = serverTickets.filter((ticket) => {
    if (ticket.status !== "Backlog") return false;
    if (projectFilter && ticket.project !== projectFilter) return false;
    return true;
  });
  return (
    <>
      <PageHead title="Backlog" desc="Live unplanned work from the workspace API.">
        {isLeader && (
          <button className="btn primary" onClick={() => navigate("/tickets/new")}>
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
        {loading ? <div className="empty-state"><Icons.LoaderCircle className="spin" /><p>Loading backlog…</p></div> : error ? <div className="empty-state"><Icons.CircleAlert /><p>{error}</p></div> : backlog.length ? (
          <TicketTable rows={backlog} />
        ) : (
          <Empty
            title="Backlog is empty"
            body="There is no unplanned work in this workspace."
            action={isLeader ? { label: "Create ticket", to: "/tickets/new" } : undefined}
          />
        )}
      </section>
    </>
  );
}
