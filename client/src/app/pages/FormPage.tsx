import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { clearSession } from "../../api";
import { Badge, CardTitle, PageHead } from "../components/ui";
import { LabelPicker } from "../components/ui";
import { fmt } from "../../utils/ui";
import { PasswordInput } from "./AuthPages";
import { MiniDatePicker } from "../components/MiniDatePicker";

export function CenteredForm({
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

export function ErrorPage({ code }: { code: string }) {
  return (
    <div className="error-page">
      <span>{code}</span>
      <h1>
        {code === "404"
          ? "This page wandered off"
          : code === "403"
            ? "You don't have access"
            : code === "Offline"
              ? "You're offline"
              : "Something went wrong"}
      </h1>
      <p>
        We couldn't complete this request. Return to a familiar place and try
        again.
      </p>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "20px" }}>
        <NavLink className="btn primary" to="/dashboard">
          <Icons.ArrowLeft size={16} />
          Back to dashboard
        </NavLink>
        <div style={{ display: "flex", gap: "12px", fontSize: "13px", color: "var(--muted)" }}>
          <span>Or try:</span>
          <NavLink to="/backlog" style={{ color: "#a47bef", textDecoration: "none", fontWeight: 500 }}>Backlog</NavLink>
          <span>·</span>
          <NavLink to="/board" style={{ color: "#a47bef", textDecoration: "none", fontWeight: 500 }}>Board</NavLink>
          <span>·</span>
          <NavLink to="/sprints" style={{ color: "#a47bef", textDecoration: "none", fontWeight: 500 }}>Sprints</NavLink>
          <span>·</span>
          <NavLink to="/team" style={{ color: "#a47bef", textDecoration: "none", fontWeight: 500 }}>Team</NavLink>
        </div>
      </div>
    </div>
  );
}

export function FormPage({
  type,
  toast,
}: {
  type: "project" | "sprint" | "ticket" | "invite";
  toast: (s: string) => void;
}) {
  const { dashboard, refetch, role, labelOptions, resources } = useWorkspace();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState("");
  const [ticketLabels, setTicketLabels] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteCopied, setInviteCopied] = useState(false);
  const [projectKey, setProjectKey] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);
  const [keyError, setKeyError] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const canCreate =
    type === "invite"
      ? role === "admin"
      : role === "admin" || role === "manager";
  if (!canCreate) return <ErrorPage code="403" />;
  const spec = {
    project: ["Create project", "Set up a new space for focused delivery."],
    sprint: ["Plan a sprint", "Define the goal, timeline, and available capacity."],
    ticket: ["Create ticket", "Capture clear, actionable work for your team."],
    invite: ["Invite team member", "Add someone to the workspace."],
  }[type];

  const finishInvite = async () => {
    setInviteUrl("");
    setInviteCopied(false);
    try {
      toast("Invitation created");
      await refetch();
      nav("/team");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Unable to refresh the team");
    }
  };

  const copyInviteLink = async () => {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setInviteCopied(true);
      window.setTimeout(() => setInviteCopied(false), 1800);
    } catch {
      setFormError("Copy failed. Select the invitation link and copy it manually.");
    }
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy(true);
    setFormError("");
    const values = new FormData(event.currentTarget);
    try {
      if (type === "project") {
        const existingKeys = (dashboard?.projects || []).map((p: any) => p.key?.toUpperCase());
        const submittedKey = (values.get("key") as string || "").toUpperCase();
        if (existingKeys.includes(submittedKey)) {
          setKeyError(`Key "${submittedKey}" is already in use. Choose a different key.`);
          setBusy(false);
          return;
        }
        await api("/projects", {
          method: "POST",
          body: JSON.stringify({
            name: values.get("name"),
            key: submittedKey,
            status: values.get("status"),
            description: values.get("description"),
            progress: 0,
            riskLevel: "medium",
            activeSprint: "Planning",
            members: [],
          }),
        });
      }
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
            epic: values.get("epic") || "Product backlog",
            issueType: values.get("issueType") || "Task",
            customFields: customFieldValues,
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
          setInviteUrl(res.inviteUrl);
          setInviteCopied(false);
          return;
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
            <div className="hierarchy-banner full">
              <div className="hierarchy-banner-title">
                <Icons.Layers size={14} />
                How tasks are organised
              </div>
              <div className="hierarchy-steps">
                <div className="hierarchy-step epic">
                  <span className="hs-icon"><Icons.Zap size={12} /></span>
                  <span className="hs-label">Epic</span>
                  <span className="hs-desc">A big goal or feature</span>
                </div>
                <Icons.ChevronRight size={14} className="hs-arrow" />
                <div className="hierarchy-step story">
                  <span className="hs-icon"><Icons.BookOpen size={12} /></span>
                  <span className="hs-label">Story</span>
                  <span className="hs-desc">A user-facing piece of work</span>
                </div>
                <Icons.ChevronRight size={14} className="hs-arrow" />
                <div className="hierarchy-step task">
                  <span className="hs-icon"><Icons.CheckSquare size={12} /></span>
                  <span className="hs-label">Task</span>
                  <span className="hs-desc">A technical sub-task</span>
                </div>
              </div>
              <p className="hierarchy-hint">Each ticket you create belongs to an <strong>Epic</strong>. The AI Task Architect can automatically break an Epic down into Stories and Tasks for you.</p>
            </div>
            <label className="field full">
              <span>Title</span>
              <input name="title" placeholder="e.g. Implement user login flow" autoFocus required />
            </label>
            <label className="field full">
              <span>Description</span>
              <textarea name="description" placeholder="Add context, constraints, and expected outcome…" required />
            </label>
            <label className="field">
              <span>Project</span>
              <select name="project" required>
                {projects.map((project: any) => (
                  <option key={project._id} value={project._id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Sprint</span>
              <select name="sprint" required>
                <option value="">Backlog</option>
                {sprints.map((sprint: any) => (
                  <option key={sprint._id} value={sprint._id}>{sprint.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Epic</span>
              <select name="epic" defaultValue="Product backlog">
                <option value="Product backlog">Product backlog</option>
                {(resources?.epic || []).map((epic: any) => (
                  <option key={epic._id || epic.id} value={epic.name}>{epic.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Assignee</span>
              <select name="assignee" required>
                <option value="">Unassigned</option>
                {users.map((user: any) => (
                  <option key={user._id} value={user._id}>{user.name}</option>
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
              <span>Issue type</span>
              <select name="issueType" defaultValue="Task">
                <option value="Task">Task</option>
                {(resources?.["issue-type"] || []).map((item: any) => <option key={item._id || item.id} value={item.name}>{item.name}</option>)}
              </select>
            </label>
            {(resources?.["custom-field"] || []).map((field: any) => {
              const key = String(field.key || field.name).trim();
              const config = field.config || {};
              return <label className="field" key={field._id || field.id || key}><span>{field.name}</span><input value={customFieldValues[key] || ""} placeholder={config.placeholder || ""} onChange={(event) => setCustomFieldValues((current) => ({ ...current, [key]: event.target.value }))} /></label>;
            })}
            <label className="field">
              <span>Story points</span>
              <input name="storyPoints" type="number" defaultValue="3" min="1" max="21" />
            </label>
            <div className="field">
              <MiniDatePicker
                name="dueDate"
                label="Due date"
                value={dueDate}
                onChange={setDueDate}
                required
              />
            </div>
            <div className="field full">
              <LabelPicker labels={ticketLabels} suggestions={labelOptions} onChange={setTicketLabels} />
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
                onChange={(e) => {
                  if (!keyEdited) {
                    const existingKeys = (dashboard?.projects || []).map((p: any) => p.key?.toUpperCase());
                    const words = e.target.value.trim().toUpperCase().replace(/[^A-Z0-9\s]/g, "").split(/\s+/).filter(Boolean);
                    let base = words.length >= 2
                      ? words.map((w: string) => w[0]).join("").slice(0, 6)
                      : (words[0] || "").slice(0, 6);
                    if (base.length < 2) base = base.padEnd(2, "X");
                    // Ensure uniqueness by appending a number if needed
                    let candidate = base;
                    let counter = 2;
                    while (existingKeys.includes(candidate)) {
                      candidate = base.slice(0, 5) + counter;
                      counter++;
                    }
                    setProjectKey(candidate);
                    setKeyError("");
                  }
                }}
              />
            </label>
            <label className="field">
              <span>Project key</span>
              <input
                name="key"
                placeholder="MOB"
                maxLength={6}
                required
                value={projectKey}
                onChange={(e) => {
                  const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
                  setProjectKey(val);
                  setKeyEdited(true);
                  const existingKeys = (dashboard?.projects || []).map((p: any) => p.key?.toUpperCase());
                  if (existingKeys.includes(val)) {
                    setKeyError(`Key "${val}" is already in use. Choose a different key.`);
                  } else {
                    setKeyError("");
                  }
                }}
              />
              {keyError && <small style={{ color: "var(--danger, #e53e3e)" }}>{keyError}</small>}
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
              <textarea name="description" placeholder="What is this project responsible for?" minLength={5} required />
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
                  <option key={project._id} value={project._id}>{project.name}</option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Capacity</span>
              <input name="capacity" type="number" defaultValue="40" min="0" />
            </label>
            <div className="field">
              <MiniDatePicker
                name="startDate"
                label="Start date"
                value={startDate}
                onChange={setStartDate}
                required
              />
            </div>
            <div className="field">
              <MiniDatePicker
                name="endDate"
                label="End date"
                value={endDate}
                onChange={setEndDate}
                required
              />
            </div>
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
              <input name="email" type="email" placeholder="name@company.com" required />
            </label>
            <label className="field">
              <span>Role</span>
              <select name="role" defaultValue="engineer">
                {(dashboard?.roles || [
                  { slug: "engineer", name: "Engineer" },
                  { slug: "designer", name: "Designer" },
                  { slug: "manager", name: "Manager" },
                  { slug: "admin", name: "Administrator" },
                ]).map((availableRole: any) => (
                  <option key={availableRole.slug} value={availableRole.slug}>{availableRole.name}</option>
                ))}
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
      {inviteUrl && (
        <div
          className="modal-wrap"
          role="presentation"
          onMouseDown={(event) => event.target === event.currentTarget && void finishInvite()}
        >
          <section
            className="card invite-review invite-link-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invite-link-title"
          >
            <button className="icon-btn modal-close" onClick={() => void finishInvite()} aria-label="Close invitation link dialog">
              <Icons.X />
            </button>
            <Badge tone="green">INVITATION READY</Badge>
            <h2 id="invite-link-title">Share this invitation</h2>
            <p>Send this secure link to the teammate you invited.</p>
            <div className="invite-link">
              <input
                aria-label="Invitation link"
                readOnly
                value={inviteUrl}
                onFocus={(event) => event.currentTarget.select()}
              />
              <button type="button" className="btn" onClick={() => void copyInviteLink()}>
                {inviteCopied ? <Icons.Check /> : <Icons.Copy />}
                {inviteCopied ? "Copied" : "Copy link"}
              </button>
            </div>
            <div className="form-actions">
              <button className="btn primary" type="button" onClick={() => void finishInvite()}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}
    </CenteredForm>
  );
}

export function ChangePasswordLive({ toast }: { toast: (s: string) => void }) {
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
      setError(reason instanceof Error ? reason.message : "Password change failed");
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

export function ImportExportLive({ toast }: { toast: (s: string) => void }) {
  const { organization, refetch } = useWorkspace();
  const [json, setJson] = useState("");
  const [importResult, setImportResult] = useState<any>(null);

  const submit = async () => {
    try {
      const parsed = JSON.parse(json);
      const payload = Array.isArray(parsed) ? { resources: parsed } : parsed;
      const result = await api<any>("/import", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setImportResult(result);
      const total = Object.values(result.imported || {}).reduce((sum: number, value: any) => sum + Number(value || 0), 0);
      toast(`${total} workspace records imported`);
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
      <PageHead title="Import & export" desc="Move workspace data using authenticated APIs." />
      <div className="two-col">
        <section className="card">
          <CardTitle title="Import workspace export" sub="Paste a JSON export to validate and restore workspace data. Existing users are matched by email." />
          <textarea
            className="comment"
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder='{"projects":[],"sprints":[],"cycles":[],"tickets":[],"resources":[]}'
          />
          {importResult && <div className="import-result" role="status"><b>Import complete</b><small>{Object.entries(importResult.imported || {}).map(([kind, count]) => `${kind}: ${count}`).join(" · ")}</small>{importResult.warnings?.length > 0 && <small>{importResult.warnings.length} records skipped with warnings.</small>}</div>}
          <button className="btn primary wide" onClick={submit} disabled={!json.trim()}>
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
