import React, { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { appConfirm } from "../components/AppDialog";
import { Avatar, Badge, CardTitle, PageHead, Progress, Empty, FilterBar } from "../components/ui";
import { fmt } from "../../utils/ui";
import { TicketTable } from "./TicketPages";

export function Team() {
  const { dashboard, organization, role, refetch, toast } = useWorkspace();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const q = params.get("q") || "";
  const users = dashboard?.users || [];
  const filter = params.get("filter") || "";
  const sort = params.get("sort") || "";

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
      const res = await api<any>(`/invitations/${userId}/resend`, { method: "POST" });
      toast(
        res.mailSent
          ? "Invitation email resent"
          : "Invitation link regenerated; SMTP is not configured",
      );
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to resend invite");
    }
  };

  const cancelInvite = async (userId: string) => {
    if (!(await appConfirm("Cancel this invitation?"))) return;
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
                    <button className="btn text-btn" onClick={() => resendInvite(u._id)}>
                      Resend
                    </button>
                    <button className="btn text-btn danger" onClick={() => cancelInvite(u._id)}>
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

export function UserDetail() {
  const { userId } = useParams();
  const {
    dashboard,
    organization,
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

  const [name, setName] = useState(u.name);
  const [userRole, setUserRole] = useState(u.role);
  const [availability, setAvailability] = useState(u.availability ?? 1);
  const [capacity, setCapacity] = useState(u.capacity ?? 40);
  const [skillsStr, setSkillsStr] = useState((u.skills || []).join(", "));
  const [avatarColor, setAvatarColor] = useState(u.avatarColor || "#A47BEF");

  const isAdmin = role === "admin";
  const isSelf = currentUser?.id === u._id;
  const canEdit = isAdmin || isSelf;

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

  const weeklyCapacity = organization?.settings?.weeklyCapacityHours ?? 40;
  const workload = u.capacity
    ? Math.min(100, Math.round(((u.capacity || 0) / weeklyCapacity) * 100))
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
        <section className="card form-card" style={{ maxWidth: "600px", margin: "20px 0" }}>
          <CardTitle title="Edit profile details" />
          <form onSubmit={save} className="form-grid">
            <label className="field">
              <span>Full name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Role</span>
              <select value={userRole} onChange={(e) => setUserRole(e.target.value)} disabled={!isAdmin}>
                {(dashboard?.roles || [
                  { slug: "admin", name: "Administrator" },
                  { slug: "manager", name: "Manager" },
                  { slug: "engineer", name: "Engineer" },
                  { slug: "designer", name: "Designer" },
                ]).map((availableRole: any) => (
                  <option key={availableRole.slug} value={availableRole.slug}>
                    {availableRole.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Availability (0.0 to 1.0)</span>
              <input type="number" step="0.1" min="0" max="1" value={availability} onChange={(e) => setAvailability(e.target.value)} />
            </label>
            <label className="field">
              <span>Capacity (hours per week)</span>
              <input type="number" min="0" max="168" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </label>
            <label className="field">
              <span>Avatar color</span>
              <input type="color" value={avatarColor} onChange={(e) => setAvatarColor(e.target.value)} />
            </label>
            <label className="field full">
              <span>Skills (comma separated)</span>
              <input value={skillsStr} onChange={(e) => setSkillsStr(e.target.value)} placeholder="React, Node.js, Mongoose" />
            </label>
            <div style={{ display: "flex", gap: "10px", marginTop: "1rem" }}>
              <button className="btn primary" type="submit">Save changes</button>
              <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </form>
        </section>
      ) : (
        <>
          <div className="profile-hero card">
            <Avatar name={u.name} color={u.avatarColor || "#A47BEF"} />
            <div>
              <h2>{u.name}</h2>
              <p>Team member status: <b>{u.inviteStatus}</b></p>
              <div className="skills">
                {(u.skills || []).map((s: string) => (
                  <Badge key={s}>{s}</Badge>
                ))}
              </div>
            </div>
            <div className="profile-stats">
              <span>
                <strong>{userTickets.filter((t) => t.status !== "Done").length}</strong>
                Open tickets
              </span>
              <span><strong>{u.capacity || 0}h</strong>Capacity</span>
              <span><strong>{workload}%</strong>Allocation</span>
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
