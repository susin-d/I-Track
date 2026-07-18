import React from "react";
import { NavLink } from "react-router-dom";
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
import { useWorkspace } from "../workspace";
import { Avatar, Badge, CardTitle, MetricCard, PageHead, Progress } from "../components/ui";
import { fmt } from "../../utils/ui";
import type { Ticket } from "../../types/domain";

export function DashboardLive() {
  const { dashboard, user: currentUser, organization, projects, tickets, people, risk, role } = useWorkspace();
  const d = dashboard || {};
  const isLeader = role === "admin" || role === "manager";
  // Keep the dashboard usable while a stale/partial API response is being
  // replaced. React's default destructuring only handles `undefined`, not a
  // JSON `null` payload.
  const summary = d?.summary || {};
  const active =
    (d.sprints || []).find((s: any) => s.status === "active") || d.sprints?.[0];
  const planned = Number(active?.plannedPoints) || 0;
  const completed = Number(active?.completedPoints) || 0;
  const progress = planned > 0 ? Math.round((completed / planned) * 100) : 0;
  const recommendation = d.recommendation || {};
  const attentionTickets = Array.from(
    new Map(
      tickets
        .filter((ticket: Ticket) => ticket.blocked || ["breached", "due_soon"].includes(ticket.slaStatus || ""))
        .sort((a: Ticket, b: Ticket) => {
          const priorityRank = { critical: 0, high: 1, medium: 2, low: 3 };
          return priorityRank[a.priority] - priorityRank[b.priority];
        })
        .map((ticket: Ticket) => [ticket.id, ticket]),
    ).values(),
  ).slice(0, 4);

  const metrics = [
    {
      label: "Needs attention",
      value: attentionTickets.length,
      sub: `${tickets.filter((ticket: Ticket) => ticket.blocked).length} blocked · ${summary.atRiskSprints ?? 0} at-risk sprints`,
      icon: Icons.CircleAlert,
      tone: "red",
      to: "/my-work?scope=attention",
    },
    {
      label: "Sprint health",
      value: `${summary.sprintHealth ?? 0}%`,
      sub: active?.name || "No active sprint",
      icon: Icons.HeartPulse,
      tone: "green",
      to: "/sprint-risk",
    },
    {
      label: "Delivery progress",
      value: `${completed}/${planned}`,
      sub: `${progress}% of planned points`,
      icon: Icons.Timer,
      tone: "purple",
      to: active?._id ? `/sprints/${active._id}` : "/sprints",
    },
    {
      label: "Active projects",
      value: summary.activeProjects ?? 0,
      sub: `${projects.length} total projects`,
      icon: Icons.FolderKanban,
      tone: "blue",
      to: "/projects",
    },
  ];

  // 1. Status Distribution for Active Sprint
  const activeSprintTickets = active ? tickets.filter((t: any) => String(t.sprintId) === String(active._id)) : tickets;
  const statusCounts: Record<string, number> = {
    "To Do": 0,
    "In Progress": 0,
    "In Review": 0,
    "Done": 0,
  };
  activeSprintTickets.forEach((t: any) => {
    const status = t.status || "To Do";
    if (statusCounts[status] !== undefined) {
      statusCounts[status] += t.points || 1;
    }
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));
  const statusColors: Record<string, string> = {
    "To Do": "#4f86f7",
    "In Progress": "#a47bef",
    "In Review": "#f28c28",
    "Done": "#4cc38a",
  };

  // 2. Ticket Priority Distribution
  const priorityCounts: Record<string, number> = {
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0,
  };
  tickets.forEach((t: any) => {
    const p = (t.priority || "medium").toLowerCase();
    if (priorityCounts[p] !== undefined) {
      priorityCounts[p] += 1;
    }
  });
  const priorityData = Object.entries(priorityCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value
  }));
  const priorityColors: Record<string, string> = {
    "Critical": "#e95a5a",
    "High": "#f28c28",
    "Medium": "#f4c430",
    "Low": "#4cc38a",
  };

  // 3. Team capacity & Sprint Points Chart Data
  const teamChartData = people.map((p: any) => {
    const userTickets = activeSprintTickets.filter(
      (t: any) => String(t.assigneeId) === String(p.id) || t.assignee === p.name
    );
    const storyPoints = userTickets.reduce((sum: number, t: any) => sum + (t.points || 0), 0);
    return {
      name: p.name.split(" ")[0],
      "Story Points": storyPoints,
      "Weekly Load %": p.load,
    };
  });

  const CustomTooltip = ({ active: tooltipActive, payload, label }: any) => {
    if (tooltipActive && payload && payload.length) {
      return (
        <div className="custom-tooltip">
          <p className="custom-tooltip-title">{label}</p>
          {payload.map((item: any) => (
            <p key={item.name} className="custom-tooltip-value" style={{ color: item.color || item.fill }}>
              {item.name}: {item.value}
            </p>
          ))}
        </div>
      );
    }
    return null;
  };

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
      <div className="metrics dashboard-metrics">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>

      <section className="card dashboard-focus">
        <CardTitle
          title="Focus for today"
          sub={attentionTickets.length ? "Resolve the work most likely to slow delivery." : "Your delivery queue is clear for now."}
        >
          <NavLink className="text-btn" to="/my-work?scope=attention">
            View attention queue <Icons.ArrowRight />
          </NavLink>
        </CardTitle>
        {attentionTickets.length ? (
          <div className="dashboard-focus-list">
            {attentionTickets.map((ticket) => (
              <NavLink className="dashboard-focus-ticket" to={`/tickets/${ticket.key}`} key={ticket.id}>
                <span className={`focus-ticket-icon ${ticket.blocked ? "blocked" : "sla"}`}>
                  {ticket.blocked ? <Icons.CircleSlash2 /> : <Icons.Timer />}
                </span>
                <span className="focus-ticket-copy">
                  <b>{ticket.key} · {ticket.title}</b>
                  <small>{ticket.blocked ? "Blocked work" : `${fmt(ticket.slaStatus || "due soon")} SLA`}</small>
                </span>
                <Badge tone={ticket.priority}>{fmt(ticket.priority)}</Badge>
                <Icons.ChevronRight className="focus-ticket-arrow" />
              </NavLink>
            ))}
          </div>
        ) : (
          <div className="dashboard-focus-empty">
            <Icons.CircleCheckBig />
            <span><b>No urgent tickets</b><small>Keep the momentum going from your personal queue.</small></span>
            <NavLink className="btn" to="/my-work">Open my work</NavLink>
          </div>
        )}
      </section>

      <div className="dashboard-grid">
        {/* Row 1: Sprint Risk Trend (span-8) & Sprint Status Distribution (span-4) */}
        <section className="card span-8">
          <CardTitle title="Sprint Risk Trend" sub="Deterministic delivery risk score across recent sprints" />
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={risk} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--purple)" stopOpacity={0.4}/>
                    <stop offset="95%" stopColor="var(--purple)" stopOpacity={0.0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="n" tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="v"
                  name="Risk Score"
                  stroke="var(--purple)"
                  strokeWidth={3}
                  fill="url(#riskGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card span-4">
          <CardTitle
            title="Sprint Status Breakdown"
            sub={active ? `${active.name} Story Points` : "All Tickets Breakdown"}
          />
          <div className="chart">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {statusData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={statusColors[entry.name]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '11px', padding: '0 4px', marginTop: '8px' }}>
            {statusData.map((entry) => (
              <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: statusColors[entry.name] }}></span>
                <span style={{ color: 'var(--muted)' }}>{entry.name}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Row 2: Team Capacity vs Story Points Assigned (span-8) & Ticket Priorities (span-4) */}
        <section className="card span-8">
          <CardTitle title="Team Assigned Story Points" sub="Story Points assigned vs. Current load %" />
          <div className="chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={teamChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="name" tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="Story Points" fill="var(--purple)" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="card span-4">
          <CardTitle title="Priority Distribution" sub="Workspace ticket priority volumes" />
          <div className="chart">
            <ResponsiveContainer width="100%" height={180}>
              <PieChart>
                <Pie
                  data={priorityData}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={75}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {priorityData.map((entry) => (
                    <Cell key={`cell-${entry.name}`} fill={priorityColors[entry.name]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: '11px', padding: '0 4px', marginTop: '8px' }}>
            {priorityData.map((entry) => (
              <div key={entry.name} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, backgroundColor: priorityColors[entry.name] }}></span>
                <span style={{ color: 'var(--muted)' }}>{entry.name}</span>
                <span style={{ marginLeft: 'auto', fontWeight: 600 }}>{entry.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* Row 3: Detailed Team Workload List (span-8) & AI Recommendation (span-4) */}
        <section className="card span-8">
          <CardTitle
            title="Active Team Load & Capacity"
            sub="Current weekly hours allocated out of workspace users"
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

        <section className="card insight span-4">
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
