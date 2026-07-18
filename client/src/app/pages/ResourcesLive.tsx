import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { appConfirm, appForm } from "../components/AppDialog";
import {
  ALL_RESOURCE_FEATURE_CONFIG,
  RESOURCE_CATEGORIES,
  RESOURCE_ICONS,
  ResourceVisualModal,
  ResourceVisualPreview,
  ResourceKind,
} from "../components/ResourceVisualBuilder";
import { WorkflowVisualEditor } from "../components/WorkflowVisualEditor";
import { Badge, CardTitle, Empty, FilterBar, PageHead, Progress } from "../components/ui";
import { fmt } from "../../utils/ui";
import { resourceKinds } from "../../constants/resources";
import { resourceDisplayName } from "../../constants/terminology";

async function collectResourceDefinition(kind: string, current?: any) {
  const feat = ALL_RESOURCE_FEATURE_CONFIG[kind as ResourceKind];
  const fields = [
    { name: "name", label: `${current ? "Name" : "Name for"} ${resourceDisplayName(kind)}`, defaultValue: current?.name || "", required: true },
    { name: "description", label: "Description", type: "textarea" as const, defaultValue: current?.description || "" },
    { name: "key", label: "Key (optional)", defaultValue: current?.key || "" },
    ...(feat?.fields || []).map((field: any) => {
      const defaultValue = String(current?.config?.[field.key] ?? field.initial ?? "");
      let options = field.options;
      if (options && defaultValue && !options.some((opt: any) => opt.value === defaultValue)) {
        options = [{ label: defaultValue, value: defaultValue }, ...options];
      }
      return {
        name: field.key,
        label: field.label,
        defaultValue,
        type: field.type === "textarea" ? ("textarea" as const) : field.type === "select" ? ("select" as const) : field.key.toLowerCase().includes("date") ? ("date" as const) : field.key === "progress" ? ("number" as const) : ("text" as const),
        options,
      };
    }),
  ];
  const values = await appForm({
    title: `${current ? "Edit" : "Create"} ${resourceDisplayName(kind)}`,
    fields,
    confirmLabel: current ? "Save changes" : `Create ${resourceDisplayName(kind)}`,
  });
  if (!values?.name?.trim()) return null;
  const config = { ...(current?.config || {}) };
  for (const field of feat?.fields || []) {
    config[field.key] = String(values[field.key] ?? "").trim();
  }
  return { name: values.name.trim(), description: values.description?.trim() || "", key: values.key?.trim() || undefined, status: current?.status || "active", order: current?.order || 0, config };
}

export function ResourcesLive({ toast }: { toast: (s: string) => void }) {
  const { resources, mutate, role } = useWorkspace();
  const location = useLocation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind = location.pathname.split("/")[2] as ResourceKind | undefined;

  const [workflowViewMode, setWorkflowViewMode] = useState<"visual" | "table">("visual");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"grid" | "table">("grid");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [searchFilter, setSearchFilter] = useState<string>("");
  const [visualModalKind, setVisualModalKind] = useState<ResourceKind | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);

  const isLeader = ["admin", "manager"].includes(role);

  const handleSaveResource = async (data: { name: string; description: string; key?: string; config: Record<string, string> }) => {
    if (!visualModalKind) return;
    try {
      if (editingItem?._id) {
        await mutate(() =>
          api(`/resources/${visualModalKind}/${editingItem._id}`, {
            method: "PATCH",
            body: JSON.stringify({ ...data, status: editingItem.status || "active", order: editingItem.order || 0 }),
          })
        );
        toast(`${resourceDisplayName(visualModalKind)} updated`);
      } else {
        const currentRows = resources[visualModalKind] || [];
        await mutate(() =>
          api(`/resources/${visualModalKind}`, {
            method: "POST",
            body: JSON.stringify({ ...data, status: "active", order: currentRows.length }),
          })
        );
        toast(`${resourceDisplayName(visualModalKind)} created`);
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Save failed");
      throw err;
    }
  };

  if (kind) {
    const rawRows = resources[kind] || [];
    const q = params.get("q") || "";
    const filter = params.get("filter") || "";
    const sort = params.get("sort") || "";

    const filtered = rawRows.filter((item: any) => {
      const matchesQ = q ? item.name.toLowerCase().includes(q.toLowerCase()) || (item.description || "").toLowerCase().includes(q.toLowerCase()) : true;
      const matchesFilter = filter === "open" ? item.status === "active" : true;
      return matchesQ && matchesFilter;
    });

    const rows = sort
      ? [...filtered].sort((a: any, b: any) => {
          const valA = a.name.toLowerCase();
          const valB = b.name.toLowerCase();
          return sort === "desc" ? (valA > valB ? -1 : valA < valB ? 1 : 0) : (valA < valB ? -1 : valA > valB ? 1 : 0);
        })
      : filtered;

    const epicDates = kind === "epic"
      ? rows.flatMap((item: any) => [item.config?.startDate, item.config?.endDate])
          .filter(Boolean)
          .map((value: string) => new Date(`${value}T00:00:00`).getTime())
          .filter(Number.isFinite)
      : [];
    const epicRangeStart = epicDates.length ? Math.min(...epicDates) : 0;
    const epicRangeEnd = epicDates.length ? Math.max(...epicDates) : 0;
    const epicRangeDays = Math.max(1, (epicRangeEnd - epicRangeStart) / 86_400_000);
    const formatRoadmapDate = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

    const openCreateModal = () => { setEditingItem(null); setVisualModalKind(kind); };
    const openEditModal = (item: any) => { setEditingItem(item); setVisualModalKind(kind); };

    const openSavedQueue = (item: any) => {
      const queue = new URLSearchParams();
      for (const key of ["query", "label", "filter", "sort"]) {
        const value = String(item.config?.[key] || "");
        if (!value || value === "all") continue;
        queue.set(key === "query" ? "q" : key, value);
      }
      navigate(`/tickets?${queue.toString()}`);
    };

    const remove = async (item: any) => {
      if (!(await appConfirm(`Are you sure you want to delete ${item.name}?`))) return;
      try {
        await mutate(() => api(`/resources/${kind}/${item._id}`, { method: "DELETE" }));
        toast(`${resourceDisplayName(kind)} deleted`);
      } catch (err) {
        toast(err instanceof Error ? err.message : "Deletion failed");
      }
    };

    const handleSaveWorkflowVisual = async (workflowData: any, targetId?: string) => {
      try {
        if (targetId) {
          await mutate(() => api(`/resources/workflow/${targetId}`, { method: "PATCH", body: JSON.stringify(workflowData) }));
          toast("Workflow updated successfully");
        } else {
          await mutate(() => api(`/resources/workflow`, { method: "POST", body: JSON.stringify({ ...workflowData, status: "active", order: rows.length }) }));
          toast("Workflow created successfully");
        }
      } catch (err) {
        toast(err instanceof Error ? err.message : "Failed to save workflow");
        throw err;
      }
    };

    if (kind === "workflow" && workflowViewMode === "visual") {
      const activeWorkflow = rows.find((r: any) => r._id === selectedWorkflowId) || rows[0];
      return (
        <div className="workflow-page-view">
          <PageHead title="Interactive Visual Workflow Builder" desc="Drag and drop status nodes, connect transitions, and define ticket workflows visually.">
            <div className="flex gap">
              <button className="btn primary" onClick={() => setWorkflowViewMode("visual")}><Icons.GitBranch className="w-4 h-4" /> Visual Canvas</button>
              <button className="btn outline" onClick={() => setWorkflowViewMode("table")}><Icons.Table className="w-4 h-4" /> Table View</button>
              {isLeader && <button className="btn outline" onClick={() => setSelectedWorkflowId("NEW")}><Icons.Plus className="w-4 h-4" /> Create New Scheme</button>}
            </div>
          </PageHead>
          {rows.length > 0 && selectedWorkflowId !== "NEW" && (
            <div className="workflow-tab-selector flex gap margin-bottom">
              {rows.map((w: any) => (
                <button key={w._id} className={`btn sm ${(activeWorkflow?._id === w._id && selectedWorkflowId !== "NEW") ? "primary" : "ghost"}`} onClick={() => setSelectedWorkflowId(w._id)}>
                  <Icons.Workflow className="w-3.5 h-3.5" />{w.name}
                </button>
              ))}
            </div>
          )}
          <WorkflowVisualEditor
            key={selectedWorkflowId || activeWorkflow?._id || "default"}
            workflow={selectedWorkflowId === "NEW" ? undefined : activeWorkflow}
            isLeader={isLeader}
            onSave={(data) => handleSaveWorkflowVisual(data, selectedWorkflowId === "NEW" ? undefined : activeWorkflow?._id)}
            onCancel={selectedWorkflowId === "NEW" ? () => setSelectedWorkflowId(null) : undefined}
          />
        </div>
      );
    }

    return (
      <>
        <PageHead title={resourceDisplayName(kind)} desc={ALL_RESOURCE_FEATURE_CONFIG[kind]?.description || `Manage live ${resourceDisplayName(kind).toLowerCase()} definitions.`}>
          <div className="flex gap" style={{ display: "flex", gap: "8px" }}>
            <button className={`btn ${viewMode === "grid" ? "primary" : "outline"}`} onClick={() => setViewMode("grid")}><Icons.LayoutGrid className="w-4 h-4" /> Cards View</button>
            <button className={`btn ${viewMode === "table" ? "primary" : "outline"}`} onClick={() => setViewMode("table")}><Icons.Table className="w-4 h-4" /> Table View</button>
            {kind === "workflow" && <button className="btn outline" onClick={() => setWorkflowViewMode("visual")}><Icons.GitBranch className="w-4 h-4" /> Visual Canvas</button>}
            {isLeader && <button className="btn primary" onClick={openCreateModal}><Icons.Plus />New {resourceDisplayName(kind)}</button>}
          </div>
        </PageHead>
        <FilterBar />

        {kind === "epic" && viewMode === "grid" && rows.length > 0 && (
          <section className="card epic-roadmap">
            <div className="epic-roadmap-head">
              <CardTitle title="Epic roadmap timeline" sub="Delivery windows, ownership, and progress across epics." />
              <div className="epic-roadmap-summary">
                <span><b>{rows.length}</b> epics</span>
                <span><b>{rows.filter((item: any) => Number(item.config?.progress || 0) >= 100).length}</b> complete</span>
                <span><b>{rows.filter((item: any) => !item.config?.startDate || !item.config?.endDate).length}</b> unscheduled</span>
              </div>
            </div>

            {epicDates.length > 0 && (
              <div className="epic-roadmap-scale" aria-hidden="true">
                <span>{formatRoadmapDate(epicRangeStart)}</span>
                <span>{formatRoadmapDate(epicRangeStart + (epicRangeEnd - epicRangeStart) / 2)}</span>
                <span>{formatRoadmapDate(epicRangeEnd)}</span>
              </div>
            )}

            <div className="epic-roadmap-rows">
              {rows.map((item: any) => {
                const start = item.config?.startDate;
                const end = item.config?.endDate;
                const startTime = start ? new Date(`${start}T00:00:00`).getTime() : NaN;
                const endTime = end ? new Date(`${end}T00:00:00`).getTime() : NaN;
                const isScheduled = Number.isFinite(startTime) && Number.isFinite(endTime);
                const progress = Math.max(0, Math.min(100, Number(item.config?.progress || 0)));
                const left = isScheduled ? Math.max(0, ((startTime - epicRangeStart) / 86_400_000 / epicRangeDays) * 100) : 0;
                const width = isScheduled ? Math.max(3, Math.min(100 - left, ((endTime - startTime) / 86_400_000 / epicRangeDays) * 100)) : 100;
                return (
                  <article className="epic-roadmap-row" key={item._id}>
                    <div className="epic-roadmap-details">
                      <div className="epic-roadmap-keyline">
                        <Badge tone="purple">{item.key || "EPIC"}</Badge>
                        <span><Icons.UserRound />{item.config?.owner || "Unassigned"}</span>
                      </div>
                      <b>{item.name}</b>
                      <p>{item.description || "No description provided"}</p>
                      <div className="epic-roadmap-dates"><Icons.CalendarDays />{start || "Start not set"} <Icons.ArrowRight /> {end || "Target not set"}</div>
                    </div>
                    <div className={`epic-roadmap-track ${isScheduled ? "" : "unscheduled"}`}>
                      {isScheduled ? (
                        <div className="epic-roadmap-bar" style={{ left: `${left}%`, width: `${width}%` }}>
                          <span style={{ width: `${progress}%` }} />
                          <strong>{progress}%</strong>
                        </div>
                      ) : (
                        <div className="epic-roadmap-placeholder"><Icons.CalendarPlus /> Add dates to schedule this epic</div>
                      )}
                    </div>
                    {isLeader && (
                      <div className="epic-roadmap-actions">
                        <button className="btn text-btn sm" onClick={() => openEditModal(item)}><Icons.Pencil />Edit</button>
                        <button className="btn text-btn sm danger" onClick={() => remove(item)}><Icons.Trash2 />Delete</button>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {kind === "release" && rows.length > 0 && (
          <section className="card resource-plan">
            <CardTitle title="Release plan" sub="Version targets and readiness at a glance." />
            <div className="resource-plan-grid">
              {rows.map((item: any) => {
                const start = item.config?.startDate;
                const end = item.config?.endDate || item.config?.releaseDate;
                const progress = Math.max(0, Math.min(100, Number(item.config?.progress || 0)));
                return (
                  <article key={item._id}>
                    <span><Badge tone="purple">{item.config?.version || resourceDisplayName(kind)}</Badge><small>{item.config?.owner || "Unassigned"}</small></span>
                    <b>{item.name}</b>
                    <small>{start || "No start date"} → {end || "No target date"}</small>
                    <Progress value={progress} tone={progress >= 80 ? "green" : "purple"} />
                    <strong>{progress}%</strong>
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {viewMode === "grid" ? (
          rows.length ? (
            kind === "epic" ? null : <div className="resource-visual-items-grid" style={{ marginTop: "16px" }}>
              {rows.map((item: any) => (
                <div key={item._id} className="resource-visual-item-card">
                  <ResourceVisualPreview kind={kind} item={item} />
                  <div className="resource-item-actions">
                    {kind === "saved-filter" && <button className="btn text-btn sm" onClick={() => openSavedQueue(item)}>Open queue</button>}
                    {isLeader && (
                      <>
                        <button className="btn text-btn sm" onClick={() => openEditModal(item)}>Edit</button>
                        <button className="btn text-btn sm danger" onClick={() => remove(item)}>Delete</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty title={`No ${resourceDisplayName(kind).toLowerCase()}`} />
        ) : (
          <section className="card no-pad">
            {rows.length ? (
              <table>
                <thead>
                  <tr>
                    <th>Name</th><th>Status</th><th>Key</th><th>Configuration</th><th>Updated</th>
                    {(isLeader || kind === "saved-filter" || kind === "workflow") && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item: any) => (
                    <tr key={item._id}>
                      <td><b>{item.name}</b></td>
                      <td><Badge tone="green">{item.status}</Badge></td>
                      <td>{item.key || "—"}</td>
                      <td>
                        <div className="resource-config-summary">
                          {Object.entries(item.config || {}).slice(0, 4).map(([k, value]) => (
                            value ? <span key={k}><small>{fmt(k)}</small><b>{String(value)}</b></span> : null
                          ))}
                          {!Object.values(item.config || {}).some(Boolean) && <span>Default configuration</span>}
                        </div>
                      </td>
                      <td>{new Date(item.updatedAt).toLocaleString()}</td>
                      {(isLeader || kind === "saved-filter" || kind === "workflow") && (
                        <td>
                          <div style={{ display: "flex", gap: "10px" }}>
                            {kind === "workflow" && <button className="btn text-btn primary" onClick={() => { setSelectedWorkflowId(item._id); setWorkflowViewMode("visual"); }}>Open Canvas</button>}
                            {isLeader && <><button className="btn text-btn" onClick={() => openEditModal(item)}>Edit</button><button className="btn text-btn danger" onClick={() => remove(item)}>Delete</button></>}
                            {kind === "saved-filter" && <button className="btn text-btn" onClick={() => openSavedQueue(item)}>Open queue</button>}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : <Empty title={`No ${resourceDisplayName(kind).toLowerCase()}`} />}
          </section>
        )}

        {visualModalKind && (
          <ResourceVisualModal kind={visualModalKind} initialData={editingItem} onSave={handleSaveResource} onClose={() => setVisualModalKind(null)} />
        )}
      </>
    );
  }

  // Hub overview
  const totalResourceCount = resourceKinds.reduce((acc, k) => acc + (resources[k] || []).length, 0);
  const getCategoryCount = (kinds: string[]) => kinds.reduce((acc, k) => acc + (resources[k] || []).length, 0);

  const filteredResourceKinds = resourceKinds.filter((k) => {
    const feat = ALL_RESOURCE_FEATURE_CONFIG[k as ResourceKind];
    const categoryMatch =
      activeCategory === "all" ||
      (activeCategory === "planning" && feat?.category === "planning") ||
      (activeCategory === "attributes" && feat?.category === "attributes") ||
      (activeCategory === "governance" && feat?.category === "governance") ||
      (activeCategory === "automation" && feat?.category === "automation");
    const searchMatch = !searchFilter.trim() || resourceDisplayName(k).toLowerCase().includes(searchFilter.toLowerCase()) || feat?.description.toLowerCase().includes(searchFilter.toLowerCase());
    return categoryMatch && searchMatch;
  });

  return (
    <>
      <PageHead title="Workspace resources" desc="Live reusable workspace configuration and visual feature definitions." />
      <div className="resource-stats-banner">
        <div className="resource-stat-card"><div className="resource-stat-icon" style={{ background: "rgba(139, 92, 246, 0.12)", color: "#8b5cf6" }}><Icons.Layers3 /></div><div className="resource-stat-info"><h3>{totalResourceCount}</h3><p>Total Workspace Configs</p></div></div>
        <div className="resource-stat-card"><div className="resource-stat-icon" style={{ background: "rgba(59, 130, 246, 0.12)", color: "#3b82f6" }}><Icons.Rocket /></div><div className="resource-stat-info"><h3>{getCategoryCount(["epic", "release", "board", "milestone"])}</h3><p>Planning & Delivery</p></div></div>
        <div className="resource-stat-card"><div className="resource-stat-icon" style={{ background: "rgba(16, 185, 129, 0.12)", color: "#10b981" }}><Icons.Tags /></div><div className="resource-stat-info"><h3>{getCategoryCount(["label", "component", "issue-type", "priority", "custom-field", "template"])}</h3><p>Ticket Attributes</p></div></div>
        <div className="resource-stat-card"><div className="resource-stat-icon" style={{ background: "rgba(245, 158, 11, 0.12)", color: "#f59e0b" }}><Icons.Zap /></div><div className="resource-stat-info"><h3>{getCategoryCount(["workflow", "automation-rule", "notification-rule", "permission-scheme", "saved-filter"])}</h3><p>Automation & Rules</p></div></div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px", marginBottom: "16px" }}>
        <div className="resource-category-tabs" style={{ margin: 0, padding: 0, border: "none" }}>
          {RESOURCE_CATEGORIES.map((cat: any) => (
            <button key={cat.id} className={`resource-tab-btn ${activeCategory === cat.id ? "active" : ""}`} onClick={() => setActiveCategory(cat.id)}>
              {cat.label}<span className="resource-tab-badge">{cat.id === "all" ? 15 : cat.kinds?.length || 0}</span>
            </button>
          ))}
        </div>
        <div style={{ position: "relative", width: "240px" }}>
          <Icons.Search size={14} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--muted)" }} />
          <input type="text" value={searchFilter} onChange={(e) => setSearchFilter(e.target.value)} placeholder="Filter features..." style={{ width: "100%", paddingLeft: "30px", paddingRight: "10px", height: "32px", fontSize: "12px", borderRadius: "16px", border: "1px solid var(--border)", background: "var(--surface)" }} />
        </div>
      </div>

      <div className="resource-grid">
        {filteredResourceKinds.map((resourceKind) => {
          const feat = ALL_RESOURCE_FEATURE_CONFIG[resourceKind as ResourceKind];
          const Icon = RESOURCE_ICONS[resourceKind as ResourceKind] || Icons.Layers3;
          const items = resources[resourceKind] || [];
          return (
            <article className="card resource-card" key={resourceKind} onClick={() => navigate(`/resources/${resourceKind}`)}>
              <span><Icon /></span>
              <div>
                <h2>{resourceDisplayName(resourceKind)}</h2>
                <p>{feat?.description || `Manage ${resourceDisplayName(resourceKind).toLowerCase()} definitions.`}</p>
                <div style={{ display: "flex", gap: "4px", marginTop: "6px" }}>
                  {feat?.presets.slice(0, 2).map((p: any) => <span key={p.name} className="rv-pill gray" style={{ fontSize: "9px", padding: "1px 5px" }}>{p.name.split(" ")[0]}</span>)}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "6px" }}>
                <Badge tone={items.length > 0 ? "purple" : "gray"}>{items.length}</Badge>
                {isLeader && (
                  <button className="btn sm outline" style={{ fontSize: "10px", padding: "2px 8px" }} onClick={(e) => { e.stopPropagation(); setEditingItem(null); setVisualModalKind(resourceKind as ResourceKind); }}>
                    + Create
                  </button>
                )}
              </div>
              <Icons.ChevronRight />
            </article>
          );
        })}
      </div>

      {visualModalKind && (
        <ResourceVisualModal kind={visualModalKind} initialData={editingItem} onSave={handleSaveResource} onClose={() => setVisualModalKind(null)} />
      )}
    </>
  );
}
