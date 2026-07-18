import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { logout, clearSession } from "../../api";
import { Badge, CardTitle, Empty, PageHead } from "../components/ui";
import { fmt } from "../../utils/ui";
import type { NotificationPreferences } from "../../types/domain";

// ── Notification prefs ──────────────────────────────────────────────────────
const defaultNotificationPreferences: NotificationPreferences = {
  ticketAssignments: true,
  mentionsAndComments: true,
  sprintRiskAlerts: true,
  weeklySummary: false,
  slaAlerts: true,
};

const notificationPreferenceOptions: { key: keyof NotificationPreferences; label: string }[] = [
  { key: "ticketAssignments", label: "Ticket assignments" },
  { key: "mentionsAndComments", label: "Mentions and comments" },
  { key: "sprintRiskAlerts", label: "Sprint risk alerts" },
  { key: "weeklySummary", label: "Weekly summary" },
];

// ── Role permission groups ───────────────────────────────────────────────────
const rolePermissionGroups: Array<{ label: string; permissions: Array<[string, string]> }> = [
  { label: "Workspace", permissions: [["workspace.view", "View workspace data"], ["organization.manage", "Manage organization settings"], ["organization.delete", "Delete the workspace"], ["roles.manage", "Manage roles and permissions"]] },
  { label: "Team", permissions: [["team.view", "View team members"], ["team.manage", "Invite and manage team members"]] },
  { label: "Projects", permissions: [["projects.view", "View projects"], ["projects.manage", "Create and manage projects"]] },
  { label: "Tickets", permissions: [["tickets.view", "View tickets"], ["tickets.create", "Create tickets"], ["tickets.edit", "Edit assigned tickets"], ["tickets.manage", "Bulk and advanced ticket actions"]] },
  { label: "Planning and resources", permissions: [["planning.view", "View planning"], ["planning.manage", "Manage sprints and cycles"], ["resources.view", "View workspace resources"], ["resources.manage", "Manage workspace resources"]] },
  { label: "Operations", permissions: [["reports.view", "View reports and risk analysis"], ["settings.manage", "Manage workspace defaults"], ["sla.view", "View SLA policy"], ["sla.manage", "Manage SLA policy"], ["audit.view", "View audit logs"], ["integrations.manage", "Manage integrations"], ["data.export", "Export workspace data"], ["data.import", "Import workspace resources"], ["ai.use", "Use the AI agent"], ["notifications.view", "Manage notifications"]] },
];

// ── SettingsNav ──────────────────────────────────────────────────────────────
export function SettingsNav({ active }: { active: string }) {
  const navigate = useNavigate();
  const { role } = useWorkspace();
  const routes: Record<string, string> = {
    Profile: "/settings/profile",
    Preferences: "/settings/preferences",
    Organization: "/organization",
    "Workspace defaults": "/settings",
    Security: "/change-password",
    Sessions: "/sessions",
    "Roles & permissions": "/settings/roles",
  };
  const items = [
    "Profile",
    "Preferences",
    "Organization",
    "Workspace defaults",
    ...(role === "admin" ? ["Roles & permissions"] : []),
    "Security",
    "Sessions",
  ];
  return (
    <aside className="settings-nav">
      {items.map((x) => (
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

// ── RolesSettings ────────────────────────────────────────────────────────────
export function RolesSettings({ toast }: { toast: (s: string) => void }) {
  const { role: currentRole } = useWorkspace();
  const [roles, setRoles] = useState<any[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<string[]>([]);
  const [isNew, setIsNew] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteArmed, setDeleteArmed] = useState(false);

  const selectRole = (selected: any) => {
    setSelectedRoleId(selected.id || selected._id || "");
    setDraftName(selected.name || "");
    setDraftDescription(selected.description || "");
    setDraftPermissions(selected.permissions || []);
    setIsNew(false);
    setDeleteArmed(false);
  };

  const loadRoles = async (preferredId?: string) => {
    const data = await api<any>("/roles");
    const nextRoles = data.roles || [];
    setRoles(nextRoles);
    const selected = nextRoles.find((item: any) => String(item.id || item._id) === String(preferredId || selectedRoleId)) || nextRoles[0];
    if (selected) selectRole(selected);
  };

  useEffect(() => {
    if (currentRole !== "admin") return;
    void loadRoles().catch((error) => toast(error instanceof Error ? error.message : "Unable to load roles"));
  }, [currentRole]);

  const startNewRole = () => {
    setIsNew(true);
    setSelectedRoleId("");
    setDraftName("");
    setDraftDescription("");
    setDraftPermissions(["workspace.view", "team.view"]);
    setDeleteArmed(false);
  };

  const togglePermission = (permission: string) => {
    setDraftPermissions((current) => current.includes(permission) ? current.filter((item) => item !== permission) : [...current, permission]);
  };

  const saveRole = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!draftName.trim() || busy) return;
    setBusy(true);
    try {
      const response = await api<any>(isNew ? "/roles" : `/roles/${selectedRoleId}`, {
        method: isNew ? "POST" : "PATCH",
        body: JSON.stringify({ name: draftName.trim(), description: draftDescription, permissions: draftPermissions }),
      });
      toast(isNew ? "Custom role created" : "Role permissions updated");
      await loadRoles(response.role?.id || response.role?._id);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to save role");
    } finally {
      setBusy(false);
    }
  };

  const deleteRole = async () => {
    if (isNew || !selectedRoleId) return;
    setBusy(true);
    try {
      await api(`/roles/${selectedRoleId}`, { method: "DELETE" });
      toast("Custom role deleted");
      await loadRoles();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete role");
    } finally {
      setBusy(false);
    }
  };

  if (currentRole !== "admin") return <Empty title="Administrator access required" body="Only the workspace administrator can manage roles and permissions." />;

  const selectedRole = roles.find((item) => String(item.id || item._id) === String(selectedRoleId));
  const isAdministrator = !isNew && selectedRole?.slug === "admin";

  const rolePermissionColumns = [
    [rolePermissionGroups[0], rolePermissionGroups[3], rolePermissionGroups[4]],
    [rolePermissionGroups[1], rolePermissionGroups[2], rolePermissionGroups[5]],
  ];

  return (
    <div className="roles-settings-grid">
      <section className="card roles-list-card">
        <CardTitle title="Roles" sub="Choose who can access each part of this workspace." />
        <button className="btn primary roles-new-button" onClick={startNewRole}><Icons.Plus />New custom role</button>
        <div className="roles-list">
          {roles.map((item) => (
            <button key={item.id || item._id} className={String(item.id || item._id) === String(selectedRoleId) && !isNew ? "active" : ""} onClick={() => selectRole(item)}>
              <span><b>{item.name}</b><small>{item.isSystem ? "Built-in role" : `${item.assignedUsers || 0} assigned users`}</small></span>
              <Icons.ChevronRight />
            </button>
          ))}
        </div>
      </section>
      <section className="card form-card role-editor-card">
        <CardTitle title={isNew ? "Create custom role" : selectedRole?.name || "Role permissions"} sub="Permissions are enforced by the workspace API." />
        <form onSubmit={saveRole}>
          <div className="form-grid">
            <label className="field">
              <span>Role name</span>
              <input value={draftName} onChange={(event) => setDraftName(event.target.value)} disabled={isAdministrator} required />
            </label>
            <label className="field">
              <span>Description</span>
              <input value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} disabled={isAdministrator} placeholder="What is this role responsible for?" />
            </label>
          </div>
          <div className="role-permission-groups">
            {rolePermissionColumns.map((col, idx) => (
              <div className="role-permission-col" key={idx}>
                {col.map((group) => (
                  <div className="role-permission-group" key={group.label}>
                    <h3>{group.label}</h3>
                    {group.permissions.map(([permission, label]) => (
                      <label className="role-permission-row" key={permission}>
                        <input type="checkbox" checked={isAdministrator || draftPermissions.includes(permission)} onChange={() => togglePermission(permission)} disabled={isAdministrator} />
                        <span><b>{label}</b><small>{permission}</small></span>
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
          {isAdministrator && <div className="auth-message success">The Administrator role always retains full access.</div>}
          <div className="form-actions">
            {!isNew && !selectedRole?.isSystem && (deleteArmed ? <><button className="btn danger" type="button" onClick={() => void deleteRole()} disabled={busy}>Confirm delete</button><button className="btn" type="button" onClick={() => setDeleteArmed(false)} disabled={busy}>Cancel</button></> : <button className="btn danger" type="button" onClick={() => setDeleteArmed(true)} disabled={busy}>Delete role</button>)}
            <button className="btn primary" type="submit" disabled={busy || isAdministrator || !draftName.trim()}>{busy ? "Saving…" : isNew ? "Create role" : "Save permissions"}</button>
          </div>
        </form>
      </section>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
export function Settings({
  theme,
  setTheme,
  density,
  setDensity,
  toast,
}: {
  theme: string;
  setTheme: (s: string) => void;
  density: string;
  setDensity: (s: string) => void;
  toast: (s: string) => void;
}) {
  const { user: currentUser, organization, mutate, refetch, role } = useWorkspace();
  const loc = useLocation();
  const nav = useNavigate();

  const tab = loc.pathname.endsWith("/profile")
    ? "Profile"
    : loc.pathname.endsWith("/preferences")
      ? "Preferences"
      : loc.pathname.endsWith("/roles")
        ? "Roles & permissions"
        : "Workspace defaults";

  const [profName, setProfName] = useState(currentUser?.name || "");
  const [profSkills, setProfSkills] = useState((currentUser?.skills || []).join(", "));
  const [profCapacity, setProfCapacity] = useState(currentUser?.capacity || 40);
  const [profColor, setProfColor] = useState(currentUser?.avatarColor || "#A47BEF");
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({
    ...defaultNotificationPreferences,
    ...(currentUser?.notificationPreferences || {}),
  });
  const [signingOut, setSigningOut] = useState(false);

  const [riskThreshold, setRiskThreshold] = useState(organization?.settings?.riskThreshold ?? 50);
  const [sprintLengthDays, setSprintLengthDays] = useState(organization?.settings?.sprintLengthDays ?? 14);
  const [weeklyCapacityHours, setWeeklyCapacityHours] = useState(organization?.settings?.weeklyCapacityHours ?? 40);
  const [timezone, setTimezone] = useState(organization?.settings?.timezone ?? "UTC");

  useEffect(() => {
    if (currentUser) {
      setProfName(currentUser.name);
      setProfSkills((currentUser.skills || []).join(", "));
      setProfCapacity(currentUser.capacity || 40);
      setProfColor(currentUser.avatarColor || "#A47BEF");
      setNotificationPreferences({ ...defaultNotificationPreferences, ...(currentUser.notificationPreferences || {}) });
    }
  }, [currentUser]);

  useEffect(() => {
    if (organization?.settings) {
      setRiskThreshold(organization.settings.riskThreshold ?? 50);
      setSprintLengthDays(organization.settings.sprintLengthDays ?? 14);
      setWeeklyCapacityHours(organization.settings.weeklyCapacityHours ?? 40);
      setTimezone(organization.settings.timezone ?? "UTC");
    }
  }, [organization]);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser?._id) return;
    try {
      const skills = profSkills.split(",").map((s: string) => s.trim()).filter(Boolean);
      await api(`/users/${currentUser._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: profName, skills, capacity: Number(profCapacity), avatarColor: profColor }),
      });
      toast("Profile updated successfully");
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Profile update failed");
    }
  };

  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
    } catch {
      clearSession();
    } finally {
      nav("/login", { replace: true });
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
            aiEnabled: organization?.settings?.aiEnabled ?? true,
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
      <PageHead title="Settings" desc="Manage your profile and workspace preferences." />
      <div className="settings-layout">
        <SettingsNav active={tab} />
        <div>
          {tab === "Roles & permissions" && <RolesSettings toast={toast} />}
          {tab === "Profile" && (
            <section className="card form-card">
              <CardTitle title="Profile settings" sub="Manage your personal details" />
              <form onSubmit={saveProfile} className="form-grid">
                <label className="field">
                  <span>Full name</span>
                  <input value={profName} onChange={(e) => setProfName(e.target.value)} required />
                </label>
                <label className="field">
                  <span>Capacity (hours per week)</span>
                  <input type="number" min="0" max="168" value={profCapacity} onChange={(e) => setProfCapacity(e.target.value)} />
                </label>
                <label className="field">
                  <span>Avatar color</span>
                  <input type="color" value={profColor} onChange={(e) => setProfColor(e.target.value)} />
                </label>
                <label className="field full">
                  <span>Skills (comma separated)</span>
                  <input value={profSkills} onChange={(e) => setProfSkills(e.target.value)} placeholder="React, Node.js, Mongoose" />
                </label>
                <button className="btn primary" type="submit">Save profile</button>
              </form>
              <div className="settings-sign-out">
                <div>
                  <strong>Sign out</strong>
                  <small>End your current session on this device.</small>
                </div>
                <button className="btn danger" type="button" onClick={() => void signOut()} disabled={signingOut}>
                  <Icons.LogOut size={16} />
                  {signingOut ? "Signing out…" : "Sign out"}
                </button>
              </div>
            </section>
          )}

          {tab === "Preferences" && (
            <>
              <section className="card form-card">
                <CardTitle title="Appearance" sub="Choose how I-Track looks for you" />
                <div className="theme-options">
                  {["light", "dark", "system"].map((x) => (
                    <button
                      className={theme === x ? "active" : ""}
                      onClick={() => {
                        setTheme(x);
                        localStorage.setItem("theme", x);
                        document.documentElement.dataset.theme =
                          x === "system"
                            ? matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
                            : x;
                      }}
                      key={x}
                    >
                      <span className={`theme-preview ${x}`}><i /><i /><i /></span>
                      <b>{fmt(x)}</b>
                      <small>{x === "system" ? "Match your device" : `${fmt(x)} surfaces`}</small>
                    </button>
                  ))}
                </div>
              </section>
              <section className="card form-card">
                <CardTitle title="Display density" />
                <div className="radio-list">
                  {[
                    ["comfortable", "Comfortable", "More space between content"],
                    ["compact", "Compact", "Show more information at once"],
                  ].map(([v, l, d]) => (
                    <label key={v}>
                      <input type="radio" checked={density === v} onChange={() => setDensity(v)} />
                      <span><b>{l}</b><small>{d}</small></span>
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
                <button className="btn primary" onClick={savePreferences}>
                  Save preferences
                </button>
              </section>
            </>
          )}

          {tab === "Workspace defaults" && (
            <section className="card form-card">
              <CardTitle title="Workspace defaults" sub="Organization-wide settings" />
              <form onSubmit={saveWorkspaceSettings} className="form-grid">
                <label className="field">
                  <span>Sprint length (days)</span>
                  <input type="number" min="1" max="60" value={sprintLengthDays} onChange={(e) => setSprintLengthDays(e.target.value)} disabled={!isAdmin} />
                </label>
                <label className="field">
                  <span>Weekly capacity (hours)</span>
                  <input type="number" min="1" max="168" value={weeklyCapacityHours} onChange={(e) => setWeeklyCapacityHours(e.target.value)} disabled={!isAdmin} />
                </label>
                <label className="field">
                  <span>Risk threshold (0 - 100)</span>
                  <input type="number" min="0" max="100" value={riskThreshold} onChange={(e) => setRiskThreshold(e.target.value)} disabled={!isAdmin} />
                </label>
                <label className="field">
                  <span>Timezone</span>
                  <input value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={!isAdmin} />
                </label>
                {isAdmin && (
                  <button className="btn primary" type="submit" style={{ marginTop: "1rem" }}>
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

// ── Security ────────────────────────────────────────────────────────────────
function SecurityPasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <label className="field security-password-field" htmlFor={id}>
      <span>{label}</span>
      <div className="security-password-input">
        <input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete={autoComplete}
          required
        />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setVisible((current) => !current)}
          aria-label={`${visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <Icons.EyeOff /> : <Icons.Eye />}
        </button>
      </div>
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function Security({ toast }: { toast: (s: string) => void }) {
  const navigate = useNavigate();
  const { user, sessions = [] } = useWorkspace();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const requirements = [
    { label: "At least 8 characters", met: newPassword.length >= 8 },
    { label: "Contains a letter", met: /[A-Za-z]/.test(newPassword) },
    { label: "Contains a number", met: /\d/.test(newPassword) },
    { label: "Passwords match", met: Boolean(confirmPassword) && newPassword === confirmPassword },
  ];
  const canSubmit =
    Boolean(currentPassword) &&
    requirements.every((item) => item.met) &&
    currentPassword !== newPassword &&
    !busy;

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match.");
      return;
    }
    if (currentPassword === newPassword) {
      setError("Choose a password different from your current password.");
      return;
    }
    setBusy(true);
    try {
      await api("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      clearSession();
      toast("Password changed. Sign in again with your new password.");
      navigate("/login", { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Password change failed");
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Settings" desc="Manage your profile and workspace preferences." />
      <div className="settings-layout">
        <SettingsNav active="Security" />
        <main className="security-settings">
          <section className="security-hero">
            <div className="security-hero-icon"><Icons.ShieldCheck /></div>
            <div>
              <span className="security-kicker">Account security</span>
              <h2>Keep your account protected</h2>
              <p>Update your password and review where your account is signed in.</p>
            </div>
            <span className="security-status"><Icons.CheckCircle2 /> Password protected</span>
          </section>

          <div className="security-grid">
            <section className="card security-password-card">
              <div className="security-section-heading">
                <span><Icons.KeyRound /></span>
                <div>
                  <h2>Change password</h2>
                  <p>Use a unique password you do not use anywhere else.</p>
                </div>
              </div>
              <form onSubmit={submit} className="security-password-form">
                <SecurityPasswordField
                  id="current-password"
                  label="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  hint="Enter the password you currently use to sign in."
                />
                <div className="security-new-passwords">
                  <SecurityPasswordField
                    id="new-password"
                    label="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                  />
                  <SecurityPasswordField
                    id="confirm-password"
                    label="Confirm new password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                </div>
                <div className="security-requirements" aria-live="polite">
                  <strong>Your password should:</strong>
                  <div>
                    {requirements.map((item) => (
                      <span className={item.met ? "met" : ""} key={item.label}>
                        {item.met ? <Icons.CheckCircle2 /> : <Icons.Circle />}
                        {item.label}
                      </span>
                    ))}
                  </div>
                </div>
                {error && <div className="auth-message" role="alert">{error}</div>}
                <div className="security-form-footer">
                  <p><Icons.LogOut /> Changing your password signs you out on every device.</p>
                  <button className="btn primary" type="submit" disabled={!canSubmit}>
                    {busy ? "Updating password…" : "Update password"}
                  </button>
                </div>
              </form>
            </section>

            <aside className="card security-account-card">
              <div className="security-section-heading">
                <span><Icons.UserRoundCheck /></span>
                <div>
                  <h2>Account overview</h2>
                  <p>Your sign-in and session details.</p>
                </div>
              </div>
              <dl>
                <div><dt>Signed in as</dt><dd>{user?.email || "Current account"}</dd></div>
                <div><dt>Active sessions</dt><dd>{sessions.length || 1}</dd></div>
              </dl>
              <button className="security-session-link" type="button" onClick={() => navigate("/sessions")}>
                <span><Icons.MonitorSmartphone /><span><b>Manage active sessions</b><small>Review devices and revoke access</small></span></span>
                <Icons.ArrowRight />
              </button>
              <div className="security-tip">
                <Icons.Lightbulb />
                <p><b>Security tip</b> Never share your password. I-Track will never ask for it by email or chat.</p>
              </div>
            </aside>
          </div>
        </main>
      </div>
    </>
  );
}

// ── Sessions ─────────────────────────────────────────────────────────────────
export function Sessions({ toast }: { toast: (s: string) => void }) {
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
      <PageHead title="Active sessions" desc="Review and revoke devices signed in to your account." />
      <div className="settings-layout">
        <SettingsNav active="Sessions" />
        <div>
          <section className="card session-list">
            {sessions.length ? (
              sessions.map((s: any, i: number) => (
                <div key={s._id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #eee" }}>
                  <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                    <span><Icons.Monitor /></span>
                    <div>
                      <b>{s.userAgent || "Unknown device"}</b>
                      <small style={{ display: "block" }}>Created {new Date(s.createdAt).toLocaleString()}</small>
                    </div>
                  </div>
                  {i === 0 ? (
                    <Badge tone="green">Current</Badge>
                  ) : (
                    <button className="btn danger" onClick={() => revoke(s._id)}>
                      Revoke
                    </button>
                  )}
                </div>
              ))
            ) : (
              <Empty title="No active sessions" body="Sign in to create a new session." />
            )}
          </section>
        </div>
      </div>
    </>
  );
}
