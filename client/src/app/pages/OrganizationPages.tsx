import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { clearSession } from "../../api";
import { appConfirm, appForm, appPrompt } from "../components/AppDialog";
import { Avatar, Badge, CardTitle, Empty, PageHead, Progress } from "../components/ui";
import { SettingsNav } from "./SettingsPages";
import { fmt } from "../../utils/ui";

export function GroupsLive({ toast }: { toast: (s: string) => void }) {
  const { company } = useWorkspace();
  const [groups, setGroups] = useState<any[]>([]);
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [directory, setDirectory] = useState<any[]>([]);
  const companyId = company?.id || company?._id;

  const load = React.useCallback(async () => {
    if (!companyId) return;
    const [groupData, workspaceData, directoryData] = await Promise.all([
      api<any>(`/companies/${companyId}/groups`),
      api<any>(`/companies/${companyId}/workspaces`),
      api<any>(`/companies/${companyId}/members`),
    ]);
    setGroups(groupData.groups || []);
    setWorkspaces(workspaceData.workspaces || []);
    setDirectory(directoryData.members || []);
  }, [companyId]);

  useEffect(() => {
    void load().catch((error) => toast(error instanceof Error ? error.message : "Unable to load groups"));
  }, [load]);

  const create = async () => {
    const values = await appForm({
      title: "Create group",
      fields: [
        { name: "name", label: "Group name", required: true, placeholder: "For example Engineering" },
        { name: "description", label: "Description", type: "textarea", placeholder: "What is this group for?" },
      ],
      confirmLabel: "Create group",
    });
    const name = values?.name?.trim();
    if (!name || !companyId) return;
    const description = values?.description?.trim() || "";
    try {
      await api(`/companies/${companyId}/groups`, { method: "POST", body: JSON.stringify({ name, description }) });
      await load();
      toast("Group created");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to create group");
    }
  };

  const setMembers = async (group: any) => {
    const current = (group.members || []).map((member: any) => member.email).join(", ");
    const emails = await appPrompt("Member emails, separated by commas", current);
    if (emails === null || !companyId) return;
    const requested = emails.split(",").map((email) => email.trim().toLowerCase()).filter(Boolean);
    const users = directory;
    const missing = requested.filter((email) => !users.some((user: any) => String(user.email || "").toLowerCase() === email));
    if (missing.length) return toast(`Not in the organization directory: ${missing.join(", ")}`);
    const userIds = requested.map((email) => users.find((user: any) => String(user.email).toLowerCase() === email)?._id);
    try {
      await api(`/companies/${companyId}/groups/${group._id}/members`, { method: "PUT", body: JSON.stringify({ userIds }) });
      await load();
      toast("Group members updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update members");
    }
  };

  const setWorkspaceAccess = async (group: any) => {
    const currentNames = (group.workspaceAccess || []).map((grant: any) => workspaces.find((workspace: any) => String(workspace._id) === String(grant.workspace))?.name).filter(Boolean).join(", ");
    const values = await appForm({
      title: "Workspace access",
      fields: [
        { name: "names", label: "Workspaces", defaultValue: currentNames, required: true, placeholder: "Separate names with commas" },
        {
          name: "role",
          label: "Access role",
          type: "select",
          defaultValue: "engineer",
          required: true,
          options: [
            { label: "Engineer", value: "engineer" },
            { label: "Manager", value: "manager" },
            { label: "Designer", value: "designer" },
          ],
        },
      ],
      confirmLabel: "Save access",
    });
    const names = values?.names;
    if (names === undefined || !companyId) return;
    const role = values?.role;
    if (!role || !["manager", "engineer", "designer"].includes(role)) return toast("Choose a valid workspace role");
    const requested = names.split(",").map((name) => name.trim().toLowerCase()).filter(Boolean);
    const missing = requested.filter((name) => !workspaces.some((workspace: any) => workspace.name.toLowerCase() === name));
    if (missing.length) return toast(`Unknown workspaces: ${missing.join(", ")}`);
    const grants = requested.map((name) => ({ workspace: workspaces.find((workspace: any) => workspace.name.toLowerCase() === name)._id, role }));
    try {
      await api(`/companies/${companyId}/groups/${group._id}/workspaces`, { method: "PUT", body: JSON.stringify({ grants }) });
      await load();
      toast("Workspace access updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update access");
    }
  };

  const remove = async (group: any) => {
    if (!companyId || !(await appConfirm(`Delete ${group.name}?`))) return;
    try {
      await api(`/companies/${companyId}/groups/${group._id}`, { method: "DELETE" });
      await load();
      toast("Group deleted");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to delete group");
    }
  };

  const edit = async (group: any) => {
    const values = await appForm({
      title: "Edit group details",
      fields: [
        { name: "name", label: "Group name", defaultValue: group.name, required: true },
        { name: "description", label: "Description", type: "textarea", defaultValue: group.description || "", placeholder: "What is this group for?" },
      ],
      confirmLabel: "Save changes",
    });
    const name = values?.name?.trim();
    if (!name || !companyId) return;
    try {
      await api(`/companies/${companyId}/groups/${group._id}`, {
        method: "PATCH",
        body: JSON.stringify({ name, description: values?.description?.trim() || "" }),
      });
      await load();
      toast("Group details updated");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to update group");
    }
  };

  const totalMembers = new Set(
    groups.flatMap((group) => (group.members || []).map((member: any) => String(member._id))),
  ).size;
  const totalGrants = groups.reduce((sum, group) => sum + (group.workspaceAccess?.length || 0), 0);

  return (
    <>
      <PageHead title="Organization groups" desc="Group people once, then grant access across multiple workspaces.">
        <button className="btn primary" onClick={create}><Icons.Plus />New group</button>
      </PageHead>
      <section className="groups-overview" aria-label="Group overview">
        <div><span className="groups-overview-icon purple"><Icons.UsersRound /></span><span><strong>{groups.length}</strong><small>Total groups</small></span></div>
        <div><span className="groups-overview-icon blue"><Icons.UserCheck /></span><span><strong>{totalMembers}</strong><small>Assigned people</small></span></div>
        <div><span className="groups-overview-icon green"><Icons.Building2 /></span><span><strong>{totalGrants}</strong><small>Workspace grants</small></span></div>
        <div><span className="groups-overview-icon orange"><Icons.Users /></span><span><strong>{directory.length}</strong><small>Directory members</small></span></div>
      </section>
      <div className="group-grid">
        {groups.length ? groups.map((group) => (
          <article className="card group-card" key={group._id}>
            <header>
              <span className="group-icon"><Icons.UsersRound /></span>
              <div className="group-heading"><h2>{group.name}</h2><p>{group.description || "Organization access group"}</p></div>
              <button className="icon-btn" onClick={() => edit(group)} aria-label={`Edit ${group.name}`} title="Edit group details"><Icons.Pencil /></button>
            </header>
            <div className="group-stats">
              <span><strong>{group.members?.length || 0}</strong> members</span>
              <span><strong>{group.workspaceAccess?.length || 0}</strong> workspaces</span>
              {group.createdAt && <span><Icons.CalendarDays /> Created {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>}
            </div>
            <div className="group-section">
              <div className="group-section-head"><span>MEMBERS</span><small>{group.members?.length || 0} assigned</small></div>
              <div className="group-member-list">
                {(group.members || []).slice(0, 4).map((member: any) => (
                  <div key={member._id}><Avatar name={member.name} color={member.avatarColor} /><span><b>{member.name}</b><small>{member.email}</small></span></div>
                ))}
                {(group.members?.length || 0) > 4 && <button onClick={() => setMembers(group)}>+{group.members.length - 4} more members</button>}
                {!group.members?.length && <div className="group-empty"><Icons.UserPlus /><span><b>No members assigned</b><small>Add people from the organization directory.</small></span></div>}
              </div>
            </div>
            <div className="group-section">
              <div className="group-section-head"><span>WORKSPACE ACCESS</span><small>{group.workspaceAccess?.length || 0} grants</small></div>
              <div className="group-access-list">
                {(group.workspaceAccess || []).map((grant: any) => {
                  const workspace = workspaces.find((item: any) => String(item._id) === String(grant.workspace));
                  return <div key={grant._id || `${grant.workspace}-${grant.role}`}><span className="avatar square">{(workspace?.name || "W").slice(0, 2).toUpperCase()}</span><span><b>{workspace?.name || "Workspace"}</b><small>Inherited access for every group member</small></span><Badge tone="purple">{fmt(grant.role)}</Badge></div>;
                })}
                {!group.workspaceAccess?.length && <div className="group-empty"><Icons.Building2 /><span><b>No workspace access</b><small>Grant a role in one or more workspaces.</small></span></div>}
              </div>
            </div>
            <footer><button className="btn" onClick={() => setMembers(group)}><Icons.UserPlus />Manage members</button><button className="btn" onClick={() => setWorkspaceAccess(group)}><Icons.KeyRound />Workspace access</button><button className="icon-btn" onClick={() => remove(group)} aria-label={`Delete ${group.name}`} title="Delete group"><Icons.Trash2 /></button></footer>
          </article>
        )) : <Empty title="No groups yet" body="Create groups such as Engineering, Product, Design, or Finance." />}
      </div>
    </>
  );
}

export function OrganizationLive({ toast }: { toast: (s: string) => void }) {
  const {
    company,
    organization: org,
    dashboard,
    resources,
    mutate,
    role,
  } = useWorkspace();
  const [name, setName] = useState(org?.name || "");
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [createWorkspaceOpen, setCreateWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const slugPreview = name.trim() === String(org?.name || "").trim()
    ? org?.slug || ""
    : name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 48) || "workspace";

  useEffect(() => {
    const companyId = company?.id || company?._id;
    if (!companyId) return;
    void api<any>(`/companies/${companyId}/workspaces`)
      .then((data) => setWorkspaces(data.workspaces || []))
      .catch(() => setWorkspaces([]));
  }, [company?.id, company?._id]);

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
    const values = await appForm({
      title: "Delete workspace permanently",
      message: `This cannot be undone. Type ${org.name} and enter your password to continue.`,
      fields: [
        { name: "confirmationName", label: `Type ${org.name}`, required: true },
        { name: "currentPassword", label: "Current password", type: "password", required: true },
      ],
      confirmLabel: "Delete permanently",
    });
    const confirmation = values?.confirmationName;
    const currentPassword = values?.currentPassword;
    if (confirmation !== org.name || !currentPassword) return;
    try {
      await api("/organization", {
        method: "DELETE",
        body: JSON.stringify({ confirmationName: confirmation, currentPassword }),
      });
      clearSession();
      window.location.href = "/login";
    } catch (err) {
      toast(err instanceof Error ? err.message : "Workspace deletion failed");
    }
  };

  const isAdmin = role === "admin";

  const openCreateWorkspace = () => {
    setWorkspaceName("");
    setCreateWorkspaceOpen(true);
  };

  const createWorkspace = async (event: React.FormEvent) => {
    event.preventDefault();
    const companyId = company?.id || company?._id;
    const trimmedName = workspaceName.trim();
    if (!companyId || trimmedName.length < 2 || creatingWorkspace) return;
    setCreatingWorkspace(true);
    try {
      const result = await api<any>(`/companies/${companyId}/workspaces`, { method: "POST", body: JSON.stringify({ name: trimmedName }) });
      setCreateWorkspaceOpen(false);
      setWorkspaceName("");
      toast("Workspace created");
      await switchToCreatedWorkspace(result.workspace);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Workspace creation failed");
    } finally {
      setCreatingWorkspace(false);
    }
  };

  const switchToCreatedWorkspace = async (workspace: any) => {
    await api<any>(`/workspaces/${workspace._id || workspace.id}/switch`, {
      method: "POST",
    });
    window.location.assign("/dashboard");
  };

  const usage = [
    ["Team members", dashboard?.users?.length || 0],
    ["Projects", dashboard?.projects?.length || 0],
    ["Tickets", dashboard?.tickets?.length || 0],
    ["Workspace resources", resourceCount],
  ];

  return (
    <>
      <PageHead
        title={company?.name || "Organization"}
        desc="Company directory, groups, and workspaces."
      >
        <Badge tone="purple">{fmt(org?.plan || "starter")} plan</Badge>
      </PageHead>
      <div className="settings-layout">
        <SettingsNav active="Organization" />
        <div>
          <section className="card">
            <CardTitle title="Workspaces" sub="Collaboration areas inside this organization." />
            <div className="workspace-overview-list">
              {workspaces.map((workspace) => (
                <button key={workspace._id} onClick={() => switchToCreatedWorkspace(workspace)}>
                  <span className="avatar square">{workspace.name.slice(0, 2).toUpperCase()}</span>
                  <span><b>{workspace.name}</b><small>{workspace.slug}</small></span>
                  {String(workspace._id) === String(org?._id || org?.id) ? <Badge tone="green">Current</Badge> : <Icons.ChevronRight />}
                </button>
              ))}
            </div>
            {isAdmin && <button className="btn primary" onClick={openCreateWorkspace}><Icons.Plus />New workspace</button>}
          </section>
          <section className="card form-card">
            <CardTitle
              title="Current workspace"
              sub="Workspace name, URL, and delivery settings."
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
                  <span>{window.location.host}/</span>
                  <input value={slugPreview} readOnly />
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
              title="Current workspace usage"
              sub="Live record counts for this workspace"
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
                title="Workspace danger zone"
                sub="Permanently delete this workspace and all of its data."
              />
              <button className="btn danger" onClick={remove}>
                Delete workspace
              </button>
            </section>
          )}
        </div>
      </div>
      {createWorkspaceOpen && (
        <div
          className="modal-wrap"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creatingWorkspace) setCreateWorkspaceOpen(false);
          }}
        >
          <section
            className="card invite-review workspace-create-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-workspace-title"
          >
            <button
              className="icon-btn modal-close"
              onClick={() => setCreateWorkspaceOpen(false)}
              disabled={creatingWorkspace}
              aria-label="Close create workspace dialog"
            >
              <Icons.X />
            </button>
            <Badge tone="purple">NEW WORKSPACE</Badge>
            <h2 id="create-workspace-title">Create a workspace</h2>
            <p>Give your team a clear space for projects, tickets, and delivery work.</p>
            <form onSubmit={createWorkspace}>
              <label className="field">
                <span>Workspace name</span>
                <input
                  value={workspaceName}
                  onChange={(event) => setWorkspaceName(event.target.value)}
                  placeholder="For example, Product team"
                  minLength={2}
                  autoComplete="organization"
                  autoFocus
                  required
                  disabled={creatingWorkspace}
                />
              </label>
              <div className="form-actions">
                <button className="btn" type="button" onClick={() => setCreateWorkspaceOpen(false)} disabled={creatingWorkspace}>
                  Cancel
                </button>
                <button className="btn primary" type="submit" disabled={creatingWorkspace || workspaceName.trim().length < 2}>
                  {creatingWorkspace ? "Creating…" : "Create workspace"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
