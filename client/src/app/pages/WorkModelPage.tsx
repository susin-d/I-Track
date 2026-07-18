import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import * as Icons from "lucide-react";
import { PageHead } from "../components/ui";
import { useWorkspace } from "../workspace";

function recordId(value: any) {
  return String(value?._id || value?.id || value || "");
}

function projectIdFor(value: any) {
  return recordId(value?.project);
}

function sprintIdFor(value: any) {
  return recordId(value?.sprint);
}

function NodeLink({
  to,
  className,
  children,
}: {
  to: string;
  className: string;
  children: React.ReactNode;
}) {
  return <NavLink className={`work-model-tree-node ${className}`} to={to}>{children}</NavLink>;
}

function WorkItems({
  tickets,
  empty,
  groupId,
  expanded,
  onToggle,
}: {
  tickets: any[];
  empty: string;
  groupId: string;
  expanded: boolean;
  onToggle: (groupId: string) => void;
}) {
  if (tickets.length === 0) {
    return <div className="work-model-empty"><Icons.CircleDashed size={15} />{empty}</div>;
  }

  const visibleTickets = expanded ? tickets : tickets.slice(0, 4);
  const hiddenCount = tickets.length - 4;

  return (
    <div className="work-model-item-list">
      <div className="work-model-ticket-items" id={`${groupId}-items`}>
        {visibleTickets.map((ticket: any) => (
          <NavLink className="work-model-item" key={recordId(ticket)} to={`/tickets/${recordId(ticket)}`}>
            <span className={`work-model-item-type ${String(ticket.issueType || "task").toLowerCase()}`}>
              {ticket.issueType || "Task"}
            </span>
            <span>
              <strong>{ticket.ticketId || "Ticket"}</strong>
              <small>{ticket.title}</small>
            </span>
            <Icons.ChevronRight size={14} />
          </NavLink>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          className="work-model-more"
          type="button"
          aria-expanded={expanded}
          aria-controls={`${groupId}-items`}
          onClick={() => onToggle(groupId)}
        >
          {expanded ? <Icons.ChevronUp size={13} /> : <Icons.ChevronDown size={13} />}
          {expanded ? "Show fewer tickets" : `Show ${hiddenCount} more ${hiddenCount === 1 ? "ticket" : "tickets"}`}
        </button>
      )}
    </div>
  );
}

export function WorkModelPage() {
  const { dashboard, projects } = useWorkspace();
  const rawProjects = dashboard?.projects || [];
  const rawSprints = dashboard?.sprints || [];
  const rawCycles = dashboard?.cycles || [];
  const rawTickets = dashboard?.tickets || [];
  const [selectedProjectId, setSelectedProjectId] = useState(() => recordId(rawProjects[0]));
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const diagramRef = useRef<HTMLElement>(null);

  const selectedProject = rawProjects.find((project: any) => recordId(project) === selectedProjectId)
    || rawProjects[0]
    || projects[0];
  const activeProjectId = recordId(selectedProject);

  const model = useMemo(() => {
    const sprints = rawSprints.filter((sprint: any) => projectIdFor(sprint) === activeProjectId);
    const sprintIds = new Set(sprints.map(recordId));
    const tickets = rawTickets.filter((ticket: any) => projectIdFor(ticket) === activeProjectId);
    const epicNames = Array.from(new Set<string>(
      tickets.map((ticket: any) => String(ticket.epic || "").trim()).filter(Boolean),
    ));
    const epics = epicNames.map((name) => ({
      name,
      tickets: tickets.filter((ticket: any) => String(ticket.epic || "").trim() === name),
    }));
    const cycles = rawCycles
      .map((cycle: any) => ({
        ...cycle,
        projectSprints: sprints.filter((sprint: any) =>
          (cycle.sprints || []).some((value: any) => recordId(value) === recordId(sprint)),
        ),
      }))
      .filter((cycle: any) => cycle.projectSprints.length > 0);
    const ungroupedSprints = sprints.filter((sprint: any) =>
      !cycles.some((cycle: any) => cycle.projectSprints.some((item: any) => recordId(item) === recordId(sprint))),
    );
    const backlog = tickets.filter((ticket: any) => !sprintIds.has(sprintIdFor(ticket)));
    const unassigned = tickets.filter((ticket: any) => !String(ticket.epic || "").trim());

    return { tickets, epics, cycles, ungroupedSprints, backlog, unassigned };
  }, [activeProjectId, rawCycles, rawSprints, rawTickets]);

  const expandableGroupIds = useMemo(() => {
    const ids: string[] = [];
    model.epics.forEach((epic) => {
      if (epic.tickets.length > 4) ids.push(`epic-${epic.name}`);
    });
    if (model.unassigned.length > 4) ids.push("epic-unassigned");
    [...model.cycles.flatMap((cycle: any) => cycle.projectSprints), ...model.ungroupedSprints].forEach((sprint: any) => {
      const count = model.tickets.filter((ticket: any) => sprintIdFor(ticket) === recordId(sprint)).length;
      if (count > 4) ids.push(`sprint-${recordId(sprint)}`);
    });
    if (model.backlog.length > 4) ids.push("sprint-backlog");
    return ids;
  }, [model]);

  useEffect(() => {
    setExpandedGroups(new Set());
  }, [activeProjectId]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  };

  const allExpanded = expandableGroupIds.length > 0
    && expandableGroupIds.every((groupId) => expandedGroups.has(groupId));

  const toggleAll = () => {
    setExpandedGroups(allExpanded ? new Set() : new Set(expandableGroupIds));
  };

  const fitView = () => {
    setExpandedGroups(new Set());
    window.requestAnimationFrame(() => {
      diagramRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
    });
  };

  const renderSprint = (sprint: any) => {
    const sprintTickets = model.tickets.filter((ticket: any) => sprintIdFor(ticket) === recordId(sprint));
    const groupId = `sprint-${recordId(sprint)}`;
    return (
      <article className="work-model-subtree sprint" key={recordId(sprint)}>
        <NodeLink className="sprint" to={`/sprints/${recordId(sprint)}`}>
          <span className="work-model-node-icon"><Icons.Timer size={17} /></span>
          <span>
            <small>Sprint · {sprint.status || "planned"}</small>
            <strong>{sprint.name}</strong>
          </span>
          <b>{sprintTickets.length}</b>
        </NodeLink>
        <WorkItems
          tickets={sprintTickets}
          empty="No work assigned to this sprint"
          groupId={groupId}
          expanded={expandedGroups.has(groupId)}
          onToggle={toggleGroup}
        />
      </article>
    );
  };

  return (
    <main className="work-model-page">
      <PageHead
        eyebrow="Workspace structure"
        title="Project work map"
        desc="Follow how this project's work is grouped by outcome and scheduled for delivery."
      >
        {rawProjects.length > 0 && (
          <label className="work-model-project-picker">
            <span>Project</span>
            <select value={activeProjectId} onChange={(event) => setSelectedProjectId(event.target.value)}>
              {rawProjects.map((project: any) => (
                <option key={recordId(project)} value={recordId(project)}>
                  {project.key} · {project.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </PageHead>

      <section className="work-model-summary" aria-label="Project totals">
        <span><Icons.Map size={15} /><strong>{model.epics.length}</strong> epics</span>
        <span><Icons.Timer size={15} /><strong>{model.cycles.reduce((sum: number, cycle: any) => sum + cycle.projectSprints.length, 0) + model.ungroupedSprints.length}</strong> sprints</span>
        <span><Icons.TicketCheck size={15} /><strong>{model.tickets.length}</strong> tickets</span>
        <p><Icons.Info size={14} />Scope and scheduling are independent views of the same work.</p>
      </section>

      <div className="work-model-toolbar" role="toolbar" aria-label="Work map controls">
        <button type="button" onClick={toggleAll} disabled={expandableGroupIds.length === 0}>
          {allExpanded ? <Icons.ChevronsUp size={15} /> : <Icons.ChevronsDown size={15} />}
          {allExpanded ? "Collapse all" : "Expand all"}
        </button>
        <button type="button" onClick={fitView}>
          <Icons.Scan size={15} />Fit view
        </button>
      </div>

      <section ref={diagramRef} className="work-model-mindmap" aria-label="Project hierarchy workflow">
        <div className="work-model-canvas">
          <div className="work-model-root-wrap">
            <NodeLink className="project" to={activeProjectId ? `/projects/${activeProjectId}` : "/projects"}>
              <span className="work-model-node-icon"><Icons.FolderKanban size={22} /></span>
              <span>
                <small>Project · {selectedProject?.key || "—"}</small>
                <strong>{selectedProject?.name || "No project yet"}</strong>
                <em>Starting point</em>
              </span>
              <b>{model.tickets.length}</b>
            </NodeLink>
          </div>

          <div className="work-model-branches">
            <section className="work-model-lane epic-branch">
              <header className="work-model-lane-node">
                <span><Icons.Map size={18} /></span>
                <div><small>Scope</small><h2>Epics</h2><p>Work grouped by outcome</p></div>
                <b>{model.epics.length}</b>
              </header>
              <div className="work-model-groups">
                {model.epics.map((epic) => {
                  const groupId = `epic-${epic.name}`;
                  return (
                    <article className="work-model-subtree epic" key={epic.name}>
                      <NodeLink className="epic" to="/resources/epic">
                        <span className="work-model-node-icon"><Icons.Flag size={17} /></span>
                        <span><small>Epic</small><strong>{epic.name}</strong></span>
                        <b>{epic.tickets.length}</b>
                      </NodeLink>
                      <WorkItems tickets={epic.tickets} empty="No work in this epic" groupId={groupId} expanded={expandedGroups.has(groupId)} onToggle={toggleGroup} />
                    </article>
                  );
                })}
                {model.epics.length === 0 && <div className="work-model-empty large">No epics in this project yet.</div>}
                {model.unassigned.length > 0 && (
                  <article className="work-model-subtree neutral">
                    <div className="work-model-tree-node neutral">
                      <span className="work-model-node-icon"><Icons.Inbox size={17} /></span>
                      <span><small>Outside an epic</small><strong>Unassigned work</strong></span>
                      <b>{model.unassigned.length}</b>
                    </div>
                    <WorkItems tickets={model.unassigned} empty="All work has an epic" groupId="epic-unassigned" expanded={expandedGroups.has("epic-unassigned")} onToggle={toggleGroup} />
                  </article>
                )}
              </div>
            </section>

            <section className="work-model-lane sprint-branch">
              <header className="work-model-lane-node">
                <span><Icons.CalendarRange size={18} /></span>
                <div><small>Schedule</small><h2>Cycles & sprints</h2><p>Work planned for delivery</p></div>
                <b>{model.cycles.length + model.ungroupedSprints.length}</b>
              </header>
              <div className="work-model-groups">
                {model.cycles.map((cycle: any) => (
                  <article className="work-model-cycle" key={recordId(cycle)}>
                    <NodeLink className="cycle" to="/cycles">
                      <span className="work-model-node-icon"><Icons.RefreshCw size={17} /></span>
                      <span><small>Cycle · {cycle.status || "planned"}</small><strong>{cycle.name}</strong></span>
                      <b>{cycle.projectSprints.length}</b>
                    </NodeLink>
                    <div className="work-model-cycle-sprints">{cycle.projectSprints.map(renderSprint)}</div>
                  </article>
                ))}
                {model.ungroupedSprints.map(renderSprint)}
                {model.backlog.length > 0 && (
                  <article className="work-model-subtree backlog">
                    <NodeLink className="backlog" to="/backlog">
                      <span className="work-model-node-icon"><Icons.ListTodo size={17} /></span>
                      <span><small>No sprint</small><strong>Project backlog</strong></span>
                      <b>{model.backlog.length}</b>
                    </NodeLink>
                    <WorkItems tickets={model.backlog} empty="Backlog is empty" groupId="sprint-backlog" expanded={expandedGroups.has("sprint-backlog")} onToggle={toggleGroup} />
                  </article>
                )}
                {model.cycles.length === 0 && model.ungroupedSprints.length === 0 && model.backlog.length === 0 && (
                  <div className="work-model-empty large">No sprint planning exists for this project yet.</div>
                )}
              </div>
            </section>
          </div>
        </div>
      </section>

      <section className="work-model-key">
        <article><Icons.FolderTree size={18} /><div><strong>Two clear paths</strong><p>Project → Epic → Ticket and Project → Cycle → Sprint → Ticket.</p></div></article>
        <article><Icons.GitMerge size={18} /><div><strong>One ticket, two views</strong><p>A ticket can appear in both paths because scope and scheduling are independent.</p></div></article>
        <article><Icons.MousePointerClick size={18} /><div><strong>Explore the model</strong><p>Open any node for details, or expand ticket groups without leaving this view.</p></div></article>
      </section>
    </main>
  );
}
