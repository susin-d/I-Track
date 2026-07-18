import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { Badge, CardTitle, PageHead, Progress, Empty, MetricCard, Avatar } from "../components/ui";
import { fmt } from "../../utils/ui";

// ── Circular gauge ────────────────────────────────────────────────────────────
function RiskGauge({ score, tone }: { score: number; tone: string }) {
  const r = 52;
  const circ = 2 * Math.PI * r;
  const dash = ((100 - score) / 100) * circ;
  const colorMap: Record<string, string> = {
    green: "#4cc38a",
    yellow: "#f4c430",
    orange: "#f28c28",
    red: "#e95a5a",
  };
  const color = colorMap[tone] || "#a47bef";

  return (
    <svg width="140" height="140" viewBox="0 0 140 140" className="risk-gauge-svg">
      <circle cx="70" cy="70" r={r} fill="none" stroke="var(--border)" strokeWidth="10" />
      <circle
        cx="70"
        cy="70"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${circ - dash} ${dash}`}
        strokeDashoffset={circ * 0.25}
        style={{ transition: "stroke-dasharray 0.7s ease" }}
      />
      <text x="70" y="65" textAnchor="middle" className="gauge-score" fill="var(--text)">
        {score}
      </text>
      <text x="70" y="82" textAnchor="middle" className="gauge-label" fill="var(--muted)">
        / 100
      </text>
    </svg>
  );
}

// ── Workload bar row ──────────────────────────────────────────────────────────
function WorkloadRow({
  name,
  points,
  max,
}: {
  name: string;
  points: number;
  max: number;
}) {
  const pct = max > 0 ? Math.round((points / max) * 100) : 0;
  const tone = pct > 85 ? "red" : pct > 60 ? "orange" : "purple";
  return (
    <div className="workload-row">
      <Avatar name={name} />
      <div className="workload-info">
        <span className="workload-name">{name || "Unassigned"}</span>
        <div className="workload-bar-wrap">
          <div
            className={`workload-bar ${tone}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <span className="workload-pts">{points} pts</span>
    </div>
  );
}

// ── Ticket status pill ────────────────────────────────────────────────────────
function StatusPill({ label, count, tone }: { label: string; count: number; tone: string }) {
  return (
    <div className={`status-pill ${tone}`}>
      <span className="status-pill-dot" />
      <span className="status-pill-label">{label}</span>
      <strong className="status-pill-count">{count}</strong>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export function RiskPage() {
  const { sprintId } = useParams();
  const { dashboard, tickets, mutate, toast, role } = useWorkspace();
  const nav = useNavigate();
  const [analysis, setAnalysis] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const isLeader = role === "admin" || role === "manager";

  const isGenericPath = !sprintId || sprintId === "risk" || sprintId === "sprint-risk" || sprintId === "sprint risk";
  const explicitSprint = sprintId && !isGenericPath
    ? (dashboard?.sprints || []).find((x: any) => String(x._id) === String(sprintId))
    : null;
  const s = explicitSprint || (dashboard?.sprints || []).find((x: any) => x.status === "active") || dashboard?.sprints?.[0];
  const sprintTickets = s ? tickets.filter((t) => t.sprintId === s._id) : [];

  const recalculateRisk = async () => {
    if (!s) return;
    setLoading(true);
    try {
      const toFiniteNumber = (value: unknown) => {
        const number = Number(value);
        return Number.isFinite(number) ? number : 0;
      };
      const plannedPoints = toFiniteNumber(s.plannedPoints);
      const capacity = toFiniteNumber(s.capacity);
      const blockedTickets = sprintTickets.filter((t) => t.blocked).length;
      const totalTickets = sprintTickets.length;

      const workload = sprintTickets.reduce(
        (sum: number, t: any) => sum + toFiniteNumber(t.points),
        0,
      );

      const assigneePoints: Record<string, number> = {};
      sprintTickets.forEach((t: any) => {
        const assignee = t.assignee || "Unassigned";
        assigneePoints[assignee] =
          (assigneePoints[assignee] || 0) + toFiniteNumber(t.points);
      });
      const focusLoad = Math.max(0, ...Object.values(assigneePoints));

      const uniqueLabels = new Set<string>();
      sprintTickets.forEach((t: any) =>
        (Array.isArray(t.labels) ? t.labels : []).forEach((l: string) => uniqueLabels.add(l)),
      );
      const requiredSkills = uniqueLabels.size;

      const allSkills = new Set<string>();
      (dashboard?.users || []).forEach((u: any) =>
        (u.skills || []).forEach((sk: string) => allSkills.add(sk)),
      );
      const coveredSkills = allSkills.size;

      const velocityHistory = (Array.isArray(s.velocityHistory) ? s.velocityHistory : [])
        .map(toFiniteNumber);

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

  if (!dashboard?.sprints || dashboard.sprints.length === 0) {
    return (
      <Empty
        title="No sprints found"
        body="There are no sprints in this workspace yet. Create a sprint to calculate and view sprint risk analysis."
        action={{ label: "Create a sprint", to: "/sprints/new" }}
      />
    );
  }

  if (!s) {
    return (
      <Empty
        title="Sprint not found"
        body="The requested sprint could not be found."
        action={{ label: "View active sprint risk", to: "/sprint-risk" }}
      />
    );
  }

  const displayScore = analysis ? analysis.risk.finalScore : (s.riskScore ?? 0);
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

  // ── Derived sprint metrics ──────────────────────────────────────────────────
  const totalTickets = sprintTickets.length;
  const doneTickets = sprintTickets.filter((t: any) => t.status === "done" || t.status === "completed").length;
  const inProgressTickets = sprintTickets.filter((t: any) => t.status === "inprogress" || t.status === "in_progress").length;
  const blockedCount = sprintTickets.filter((t: any) => t.blocked).length;
  const todoTickets = totalTickets - doneTickets - inProgressTickets - blockedCount;
  const sprintPoints = sprintTickets.reduce((sum: number, t: any) => sum + (t.points || 0), 0);
  const capacity = s.capacity || 0;
  const utilisationPct = capacity > 0 ? Math.round((sprintPoints / capacity) * 100) : 0;

  // ── Assignee workload ───────────────────────────────────────────────────────
  const assigneeMap: Record<string, number> = {};
  sprintTickets.forEach((t: any) => {
    const key = t.assignee || "Unassigned";
    assigneeMap[key] = (assigneeMap[key] || 0) + (t.points || 0);
  });
  const assignees = Object.entries(assigneeMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxPoints = assignees[0]?.[1] || 1;

  // ── Contributing factors ────────────────────────────────────────────────────
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
        {(dashboard?.sprints || []).length > 1 && (
          <select
            className="select"
            value={s._id}
            onChange={(e) => nav(`/sprints/${e.target.value}/risk`)}
            style={{ width: "auto", display: "inline-block", marginRight: "8px" }}
          >
            {(dashboard?.sprints || []).map((sp: any) => (
              <option key={sp._id} value={sp._id}>
                {sp.name} ({sp.status})
              </option>
            ))}
          </select>
        )}
        <button className="btn" onClick={recalculateRisk} disabled={loading}>
          <Icons.RefreshCw className={loading ? "spin" : ""} />
          Recalculate
        </button>
      </PageHead>

      {/* ── Sprint summary metrics ── */}
      <div className="metrics" style={{ gridTemplateColumns: "repeat(4,1fr)", marginBottom: "18px" }}>
        <MetricCard
          label="Total Tickets"
          value={totalTickets}
          sub={`${doneTickets} completed`}
          icon={Icons.TicketCheck}
          tone="blue"
        />
        <MetricCard
          label="Blocked"
          value={blockedCount}
          sub={blockedCount > 0 ? "needs attention" : "none blocked"}
          icon={Icons.ShieldAlert}
          tone={blockedCount > 0 ? "red" : "green"}
        />
        <MetricCard
          label="Utilisation"
          value={`${utilisationPct}%`}
          sub={`${sprintPoints} / ${capacity || "?"} pts`}
          icon={Icons.Gauge}
          tone={utilisationPct > 90 ? "orange" : "purple"}
        />
        <MetricCard
          label="Risk Score"
          value={displayScore}
          sub={riskLabel.toLowerCase()}
          icon={Icons.Activity}
          tone={riskTone === "green" ? "green" : riskTone === "yellow" ? "orange" : "red"}
        />
      </div>

      {/* ── Hero: gauge + description ── */}
      <div className="risk-hero" style={{ gridTemplateColumns: "auto 1fr", alignItems: "center" }}>
        <div className="risk-score" style={{ borderRight: "1px solid var(--border)", paddingRight: "28px" }}>
          <span>RISK SCORE</span>
          <RiskGauge score={displayScore} tone={riskTone} />
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

      {/* ── Main grid: factors + recommendation ── */}
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

      {/* ── Second row: Ticket status + Assignee workload ── */}
      <div className="two-col" style={{ marginTop: "16px" }}>
        {/* Ticket status breakdown */}
        <section className="card">
          <CardTitle title="Ticket status breakdown" sub="Distribution across all sprint tickets" />
          <div className="status-breakdown">
            {totalTickets === 0 ? (
              <p style={{ color: "var(--muted)", fontSize: 13 }}>No tickets in this sprint yet.</p>
            ) : (
              <>
                <div className="status-bar-stack">
                  {doneTickets > 0 && (
                    <div
                      className="status-bar-seg done"
                      style={{ flex: doneTickets }}
                      title={`Done: ${doneTickets}`}
                    />
                  )}
                  {inProgressTickets > 0 && (
                    <div
                      className="status-bar-seg inprogress"
                      style={{ flex: inProgressTickets }}
                      title={`In Progress: ${inProgressTickets}`}
                    />
                  )}
                  {blockedCount > 0 && (
                    <div
                      className="status-bar-seg blocked"
                      style={{ flex: blockedCount }}
                      title={`Blocked: ${blockedCount}`}
                    />
                  )}
                  {todoTickets > 0 && (
                    <div
                      className="status-bar-seg todo"
                      style={{ flex: Math.max(todoTickets, 0) }}
                      title={`To Do: ${todoTickets}`}
                    />
                  )}
                </div>
                <div className="status-pills">
                  <StatusPill label="Done" count={doneTickets} tone="green" />
                  <StatusPill label="In Progress" count={inProgressTickets} tone="blue" />
                  <StatusPill label="Blocked" count={blockedCount} tone="red" />
                  <StatusPill label="To Do" count={Math.max(todoTickets, 0)} tone="muted" />
                </div>
                <div className="completion-stat">
                  <strong style={{ fontSize: 28, letterSpacing: "-0.04em" }}>
                    {totalTickets > 0 ? Math.round((doneTickets / totalTickets) * 100) : 0}%
                  </strong>
                  <span style={{ color: "var(--muted)", fontSize: 12, marginLeft: 8 }}>
                    sprint complete
                  </span>
                </div>
              </>
            )}
          </div>
        </section>

        {/* Assignee workload */}
        <section className="card">
          <CardTitle title="Assignee workload" sub="Story points per team member" />
          {assignees.length === 0 ? (
            <p style={{ color: "var(--muted)", fontSize: 13 }}>No assignees found.</p>
          ) : (
            <div className="workload-list">
              {assignees.map(([name, pts]) => (
                <WorkloadRow key={name} name={name} points={pts} max={maxPoints} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ── Sprint info strip ── */}
      <div className="risk-sprint-strip">
        <div className="risk-sprint-strip-item">
          <Icons.Calendar size={14} />
          <span>
            {s.startDate ? fmt(s.startDate) : "—"} → {s.endDate ? fmt(s.endDate) : "—"}
          </span>
        </div>
        <div className="risk-sprint-strip-item">
          <Icons.Layers size={14} />
          <span>Sprint: <b>{s.name}</b></span>
        </div>
        <div className="risk-sprint-strip-item">
          <Icons.CircleDot size={14} />
          <Badge tone={s.status === "active" ? "green" : s.status === "completed" ? "blue" : "yellow"}>
            {s.status}
          </Badge>
        </div>
        {s.goal && (
          <div className="risk-sprint-strip-item" style={{ flex: 1 }}>
            <Icons.Target size={14} />
            <span style={{ color: "var(--muted)", fontSize: 12 }}>{s.goal}</span>
          </div>
        )}
      </div>
    </>
  );
}
