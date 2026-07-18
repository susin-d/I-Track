import React, { useMemo, useState } from "react";
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
}: {
  tickets: any[];
  empty: string;
}) {
  if (tickets.length === 0) {
    return <div className="work-model-empty"><Icons.CircleDashed size={15} />{empty}</div>;
  }

  return (
    <div className="work-model-item-list">
      {tickets.slice(0, 4).map((ticket: any) => (
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
      {tickets.length > 4 && (
        <NavLink className="work-model-more" to="/tickets">+{tickets.length - 4} more tickets</NavLink>
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

    return { tickets, epics, cycles, ungroupedSprints, backlog };
  }, [activeProjectId, rawCycles, rawSprints, rawTickets]);

  const renderSprint = (sprint: any) => {
    const sprintTickets = model.tickets.filter((ticket: any) => sprintIdFor(ticket) === recordId(sprint));
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
        <WorkItems tickets={sprintTickets} empty="No work assigned to this sprint" />
      </article>
    );
  };

  return (
    <main className="work-model-page">
      <PageHead
        eyebrow="Workspace structure"
        title="Project work map"
        desc="A mind map of the selected project, showing its planning groups and the work organized beneath each one."
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
        <p><Icons.Info size={14} />Epics group tickets by outcome; sprints schedule tickets for delivery. Neither contains the other.</p>
      </section>

      <section className="work-model-mindmap" aria-label="Project hierarchy mind map">
        <div className="work-model-root-wrap">
          <NodeLink className="project" to={activeProjectId ? `/projects/${activeProjectId}` : "/projects"}>
            <span className="work-model-node-icon"><Icons.FolderKanban size={22} /></span>
            <span>
              <small>Project · {selectedProject?.key || "—"}</small>
              <strong>{selectedProject?.name || "No project yet"}</strong>
              <em>Root of this work map</em>
            </span>
            <b>{model.tickets.length}</b>
          </NodeLink>
        </div>

        <div className="work-model-branches">
          <section className="work-model-branch epic-branch">
            <header>
              <span><Icons.Map size={18} /></span>
              <div><small>Scope hierarchy</small><h2>Epics</h2></div>
              <b>{model.epics.length}</b>
            </header>
            <p className="work-model-branch-help">Epics group related stories, tasks, and bugs by outcome.</p>
            <div className="work-model-groups">
              {model.epics.map((epic) => (
                <article className="work-model-subtree epic" key={epic.name}>
                  <NodeLink className="epic" to="/resources/epic">
                    <span className="work-model-node-icon"><Icons.Flag size={17} /></span>
                    <span><small>Epic</small><strong>{epic.name}</strong></span>
                    <b>{epic.tickets.length}</b>
                  </NodeLink>
                  <WorkItems tickets={epic.tickets} empty="No work in this epic" />
                </article>
              ))}
              {model.epics.length === 0 && <div className="work-model-empty large">No epic names are used in this project yet.</div>}
              {model.tickets.some((ticket: any) => !String(ticket.epic || "").trim()) && (
                <article className="work-model-subtree neutral">
                  <div className="work-model-tree-node neutral">
                    <span className="work-model-node-icon"><Icons.Inbox size={17} /></span>
                    <span><small>Outside an epic</small><strong>Unassigned work</strong></span>
                    <b>{model.tickets.filter((ticket: any) => !String(ticket.epic || "").trim()).length}</b>
                  </div>
                  <WorkItems
                    tickets={model.tickets.filter((ticket: any) => !String(ticket.epic || "").trim())}
                    empty="All work has an epic"
                  />
                </article>
              )}
            </div>
          </section>

          <section className="work-model-branch sprint-branch">
            <header>
              <span><Icons.CalendarRange size={18} /></span>
              <div><small>Time hierarchy</small><h2>Cycles & sprints</h2></div>
              <b>{model.cycles.length}</b>
            </header>
            <p className="work-model-branch-help">Cycles contain sprints; sprints contain their assigned work.</p>
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
                  <WorkItems tickets={model.backlog} empty="Backlog is empty" />
                </article>
              )}
              {model.cycles.length === 0 && model.ungroupedSprints.length === 0 && model.backlog.length === 0 && (
                <div className="work-model-empty large">No sprint planning exists for this project yet.</div>
              )}
            </div>
          </section>
        </div>
      </section>

      <section className="work-model-key">
        <article><Icons.FolderTree size={18} /><div><strong>What is under what?</strong><p>Workspace → Project → optional Epic → Ticket, and Workspace → Project → Cycle → Sprint → Ticket.</p></div></article>
        <article><Icons.GitMerge size={18} /><div><strong>One item, two views</strong><p>A task can appear under both an epic and a sprint because scope and scheduling are independent.</p></div></article>
        <article><Icons.Database size={18} /><div><strong>Actual data model</strong><p>Sprints and tickets link directly to projects. Epic membership is matched using the epic name.</p></div></article>
      </section>
    </main>
  );
}
