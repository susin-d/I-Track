import React, { useEffect, useState } from "react";
import * as Icons from "lucide-react";
import {
  AreaChart, Area, BarChart, Bar, CartesianGrid,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { Avatar, CardTitle, PageHead, Progress } from "../components/ui";
import { TicketTable } from "./TicketPages";
import { MiniDatePicker } from "../components/MiniDatePicker";

export function Reports() {
  const { dashboard, organization, reports: initialReport, tickets } = useWorkspace();
  const [report, setReport] = useState<any>(initialReport);
  const [tab, setTab] = useState("Overview");
  const [selectedProject, setSelectedProject] = useState("All");
  const [selectedMember, setSelectedMember] = useState("All");
  const [startDateStr, setStartDateStr] = useState("");

  useEffect(() => {
    const params = new URLSearchParams();
    if (selectedProject !== "All") {
      const project = (dashboard?.projects || []).find((item: any) => item.name === selectedProject);
      if (project?._id) params.set("projectId", project._id);
    }
    if (selectedMember !== "All") {
      const member = (dashboard?.users || []).find((item: any) => item.name === selectedMember);
      if (member?._id) params.set("memberId", member._id);
    }
    if (startDateStr) params.set("startDate", startDateStr);
    void api<any>(`/reports${params.toString() ? `?${params}` : ""}`)
      .then((data) => setReport(data.reports || {}))
      .catch(() => setReport(initialReport));
  }, [dashboard, initialReport, selectedProject, selectedMember, startDateStr]);

  const sprints = dashboard?.sprints || [];
  const users = dashboard?.users || [];

  const filteredTickets = tickets.filter((t) => {
    if (selectedProject !== "All" && t.project !== selectedProject) return false;
    if (selectedMember !== "All" && t.assignee !== selectedMember) return false;
    return true;
  });

  const filteredSprints = sprints.filter((s: any) => {
    if (selectedProject !== "All" && s.project?.name !== selectedProject) return false;
    if (startDateStr && new Date(s.startDate) < new Date(startDateStr)) return false;
    return true;
  });

  const doneCount = filteredTickets.filter((t) => t.status === "Done").length;
  const completionRate = filteredTickets.length
    ? Math.round((doneCount / filteredTickets.length) * 100)
    : 0;
  const blockedCount = filteredTickets.filter((t) => t.blocked).length;

  const chartVelocityData = filteredSprints.map((s: any) => ({
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
  const statusSummary = (["Backlog", "To Do", "In Progress", "In Review", "Done"] as const).map(
    (status) => ({
      status,
      count: filteredTickets.filter((ticket) => ticket.status === status).length,
    }),
  );
  const blockedTickets = filteredTickets.filter((ticket) => ticket.blocked);

  const downloadJSON = () => {
    const dataToDownload = {
      project: selectedProject,
      member: selectedMember,
      startDate: startDateStr,
      metrics: {
        avgVelocity,
        completionRate,
        blockedTickets: blockedCount,
        cycleTime: report?.cycleTime ?? 0,
        leadTime: report?.leadTime ?? 0,
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
      ["Cycle Time (days)", String(report?.cycleTime ?? 0)],
      ["Lead Time (days)", String(report?.leadTime ?? 0)],
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
            <option key={p._id} value={p.name}>{p.name}</option>
          ))}
        </select>
        <select
          value={selectedMember}
          onChange={(e) => setSelectedMember(e.target.value)}
        >
          <option value="All">All members</option>
          {users.map((u: any) => (
            <option key={u._id} value={u.name}>{u.name}</option>
          ))}
        </select>
        <MiniDatePicker
          name="startDate"
          label=""
          value={startDateStr}
          onChange={setStartDateStr}
        />
      </div>

      {tab === "Overview" && (
        <>
          <div className="metrics compact">
            <article className="metric"><div><span>Avg. velocity</span><strong>{avgVelocity}</strong><small>points completed</small></div></article>
            <article className="metric"><div><span>Completion rate</span><strong>{completionRate}%</strong><small>of total scope</small></div></article>
            <article className="metric"><div><span>Cycle time</span><strong>{report?.cycleTime ?? 0}d</strong><small>average duration</small></div></article>
            <article className="metric"><div><span>Blocked duration</span><strong>{report?.blockedDuration ?? 0}d</strong><small>measured from blocked work</small></div></article>
          </div>
          <div className="two-col">
            <section className="card">
              <CardTitle title="Sprint velocity" sub="Completed story points per sprint" />
              <div className="chart"><ResponsiveContainer><BarChart data={chartVelocityData}><CartesianGrid vertical={false} /><XAxis dataKey="n" /><YAxis /><Tooltip /><Bar dataKey="v" fill="#A47BEF" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
            </section>
            <section className="card">
              <CardTitle title="Risk trend" sub="Sprint risk score over time" />
              <div className="chart"><ResponsiveContainer><AreaChart data={chartRiskData}><XAxis dataKey="n" /><YAxis /><Tooltip /><Area dataKey="v" stroke="#F28C28" fill="#F28C2833" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
            </section>
          </div>
        </>
      )}

      {tab === "Velocity" && (
        <div className="two-col">
          <section className="card">
            <CardTitle title="Velocity by sprint" sub="Completed story points" />
            <div className="chart"><ResponsiveContainer><BarChart data={chartVelocityData}><CartesianGrid vertical={false} /><XAxis dataKey="n" /><YAxis /><Tooltip /><Bar dataKey="v" fill="#A47BEF" radius={[6, 6, 0, 0]} /></BarChart></ResponsiveContainer></div>
          </section>
          <section className="card">
            <CardTitle title="Velocity detail" sub={`${filteredSprints.length} sprints in the selected range`} />
            <div className="timeline">
              {filteredSprints.length ? filteredSprints.map((s: any) => (
                <div key={s._id}><i className="done" /><span><b>{s.name}</b><small>{s.completedPoints || 0} completed of {s.plannedPoints || 0} points</small></span></div>
              )) : <p>No sprints match the selected filters.</p>}
            </div>
          </section>
        </div>
      )}

      {tab === "Delivery" && (
        <>
          <div className="metrics compact">
            <article className="metric"><div><span>Total tickets</span><strong>{filteredTickets.length}</strong><small>in selected scope</small></div></article>
            <article className="metric"><div><span>Completed</span><strong>{doneCount}</strong><small>marked done</small></div></article>
            <article className="metric"><div><span>Completion rate</span><strong>{completionRate}%</strong><small>of selected tickets</small></div></article>
            <article className="metric"><div><span>Cycle time</span><strong>{report?.cycleTime ?? 0}d</strong><small>average duration</small></div></article>
          </div>
          <div className="two-col">
            <section className="card">
              <CardTitle title="Delivery status" sub="Current ticket distribution" />
              <div className="timeline">{statusSummary.map(({ status, count }) => <div key={status}><i className={status === "Done" ? "done" : ""} /><span><b>{status}</b><small>{count} tickets</small></span></div>)}</div>
            </section>
            <section className="card no-pad"><CardTitle title="Delivery queue" sub="Filtered tickets in the selected scope" /><TicketTable rows={filteredTickets} /></section>
          </div>
        </>
      )}

      {tab === "Workload" && (
        <section className="card">
          <CardTitle title="Team workload" sub="Capacity signals for workspace members" />
          <div className="workloads">
            {users.length ? users.map((user: any) => {
              const weeklyCapacity = organization?.settings?.weeklyCapacityHours ?? 40;
              const load = user.capacity ? Math.min(100, Math.round((user.capacity / weeklyCapacity) * 100)) : 0;
              return <div key={user._id}><Avatar name={user.name} color={user.avatarColor} /><span><b>{user.name}</b><small>{user.role}</small></span><Progress value={load} tone={load > 80 ? "orange" : "purple"} /><strong>{load}%</strong></div>;
            }) : <p>No team members match the selected filters.</p>}
          </div>
        </section>
      )}

      {tab === "Risk" && (
        <div className="two-col">
          <section className="card">
            <CardTitle title="Risk trend" sub="Sprint risk score over time" />
            <div className="chart"><ResponsiveContainer><AreaChart data={chartRiskData}><XAxis dataKey="n" /><YAxis /><Tooltip /><Area dataKey="v" stroke="#F28C28" fill="#F28C2833" strokeWidth={3} /></AreaChart></ResponsiveContainer></div>
          </section>
          <section className="card no-pad"><CardTitle title="Blocked work" sub={`${blockedTickets.length} blocked ticket${blockedTickets.length === 1 ? "" : "s"}`} /><TicketTable rows={blockedTickets} /></section>
        </div>
      )}
    </>
  );
}
