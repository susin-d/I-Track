import React, { useEffect, useMemo } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { API_DATA_MUTATED_EVENT, ApiError, api, clearSession } from "../api";
import { resourceKinds } from "../constants/resources";
import { ErrorState, LoadingState } from "./components/ui";
import { queryFn, queryKeys } from "./query";
import type { Ticket } from "../types/domain";

type WorkspaceValue = {
  user: any; company: any; organization: any; memberships: any[]; pendingInvitations: any[];
  dashboard: any; notifications: any[]; reports: any; sla: any; sessions: any[];
  auditLogs: any[]; integrations: any[]; resources: Record<string, any[]>; labelOptions: string[];
  projects: any[]; tickets: any[]; people: any[]; velocity: any[]; risk: any[];
  role: string; loading: boolean; error: string;
  refetch: () => Promise<void>;
  updateData: (updater: (previous: any) => any) => void;
  mutate: (apiCall: () => Promise<any>, optimisticUpdate?: (previous: any) => any, rollback?: () => void) => Promise<any>;
  toast: (message: string) => void;
};

const WorkspaceContext = React.createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}

const emptyDashboard = { summary: {}, projects: [], sprints: [], cycles: [], tickets: [], users: [] };

export function normalizeTicket(ticket: any, userId = ""): Ticket {
  const assignee = ticket.assignee;
  const project = ticket.project;
  const sprint = ticket.sprint;
  return {
    id: String(ticket._id || ticket.id || ""),
    key: ticket.ticketId || ticket.key || "",
    ticketId: ticket.ticketId || ticket.key,
    title: ticket.title || "Untitled ticket",
    status: ticket.status || "Backlog",
    priority: ticket.priority || "medium",
    points: ticket.storyPoints ?? ticket.points ?? 0,
    assignee: typeof assignee === "object" && assignee ? assignee.name || "Unassigned" : assignee || "Unassigned",
    assigneeId: String((typeof assignee === "object" && assignee ? assignee._id || assignee.id : assignee) || ""),
    project: typeof project === "object" && project ? project.name || "" : project || "",
    labels: ticket.labels || [],
    epic: ticket.epic || "",
    dependencies: ticket.dependencies || [],
    blocked: Boolean(ticket.blocked),
    rank: ticket.rank ?? 0,
    watched: (ticket.watchers || []).some((watcher: any) => String(watcher?._id || watcher?.id || watcher) === userId),
    slaStatus: ticket.slaStatus,
    firstResponseDueAt: ticket.firstResponseDueAt,
    resolutionDueAt: ticket.resolutionDueAt,
    firstRespondedAt: ticket.firstRespondedAt,
    resolvedAt: ticket.resolvedAt,
    sprintId: String((typeof sprint === "object" && sprint ? sprint._id || sprint.id : sprint) || ""),
    sprintName: typeof sprint === "object" && sprint ? sprint.name || "" : "",
  } as Ticket;
}

function parseDashboard(dashboard: any, userId: string) {
  const people = (dashboard.users || []).map((user: any) => ({
    name: user.name, email: user.email, role: user.role, skills: user.skills || [],
    load: user.capacity, color: user.avatarColor || "#A47BEF",
  }));
  const projects = (dashboard.projects || []).map((project: any) => ({
    id: project._id || project.id, key: project.key, name: project.name,
    description: project.description, progress: project.progress, status: project.status,
    risk: project.riskLevel, members: project.members?.length || 0, sprint: project.activeSprint,
  }));
  const tickets = (dashboard.tickets || []).map((ticket: any) => normalizeTicket(ticket, userId));
  const activeSprint = (dashboard.sprints || []).find((sprint: any) => sprint.status === "active") || dashboard.sprints?.[0];
  const velocity = (activeSprint?.velocityHistory || []).map((value: number, index: number) => ({ n: `S${index + 1}`, v: value }));
  const risk = (dashboard.sprints || []).slice(-5).map((sprint: any) => ({ n: sprint.name, v: sprint.riskScore }));
  return { people, projects, tickets, velocity, risk: risk.length ? risk : [{ n: "Current", v: 0 }] };
}

export function ApiGate({ children, toast }: { children: React.ReactNode; toast: (message: string) => void }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const publicPath = (location.pathname === "/" && window.location.pathname === "/") || [
    "/login", "/auth/google/callback", "/register", "/forgot-password", "/reset-password", "/accept-invite",
  ].includes(location.pathname);

  const session = useQuery({
    queryKey: queryKeys.session,
    queryFn: queryFn<any>("/auth/me"),
    enabled: !publicPath,
  });
  const me = session.data;
  const hasWorkspace = Boolean(me?.organization);
  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(me?.organization?.id),
    queryFn: queryFn<any>("/dashboard"),
    enabled: !publicPath && hasWorkspace,
  });
  const notificationsQuery = useQuery({
    queryKey: queryKeys.notifications,
    queryFn: queryFn<any>("/notifications"),
    enabled: !publicPath && hasWorkspace,
  });
  const labelQuery = useQuery({
    queryKey: queryKeys.resources("label"),
    queryFn: queryFn<any>("/resources/label"),
    enabled: !publicPath && hasWorkspace,
  });

  const routeQueries = useQueries({
    queries: [
      { queryKey: queryKeys.reports, queryFn: queryFn<any>("/reports"), enabled: hasWorkspace && location.pathname.startsWith("/reports") },
      { queryKey: queryKeys.sla, queryFn: queryFn<any>("/sla"), enabled: hasWorkspace && location.pathname.startsWith("/sla") },
      { queryKey: queryKeys.sessions, queryFn: queryFn<any>("/auth/sessions"), enabled: hasWorkspace && (location.pathname.startsWith("/sessions") || location.pathname.startsWith("/settings")) },
      { queryKey: queryKeys.auditLogs, queryFn: queryFn<any>("/audit-logs"), enabled: hasWorkspace && location.pathname.startsWith("/audit-logs") },
      { queryKey: queryKeys.integrations("api-token"), queryFn: queryFn<any>("/integrations/api-token"), enabled: hasWorkspace && location.pathname.startsWith("/integrations") },
      { queryKey: queryKeys.integrations("webhook"), queryFn: queryFn<any>("/integrations/webhook"), enabled: hasWorkspace && location.pathname.startsWith("/integrations") },
      ...resourceKinds.filter((kind) => kind !== "label").map((kind) => ({
        queryKey: queryKeys.resources(kind),
        queryFn: queryFn<any>(`/resources/${kind}`),
        enabled: hasWorkspace && (location.pathname.startsWith("/resources") || location.pathname.startsWith("/organization")),
      })),
    ],
  });

  useEffect(() => {
    if (!me) return;
    if (!me.organization || location.pathname.startsWith("/onboarding") || String(me.next || "").startsWith("/onboarding")) {
      if (!location.pathname.startsWith("/onboarding")) navigate(me.pendingInvitations?.length && !me.organization ? "/onboarding/workspace" : (me.next || "/onboarding/workspace"), { replace: true });
      return;
    }
    const slug = String(me.organization.slug || "");
    const prefix = window.location.pathname.split("/").filter(Boolean)[0] || "";
    localStorage.setItem("itrack_workspace_slug", slug);
    if (slug && prefix !== slug) window.location.replace(`/${slug}${location.pathname === "/" ? "/dashboard" : location.pathname}${window.location.search}${window.location.hash}`);
  }, [location.pathname, me, navigate]);

  useEffect(() => {
    if (session.error instanceof ApiError && session.error.status === 401) {
      clearSession();
      window.location.replace("/login");
    }
  }, [session.error]);

  useEffect(() => {
    const refreshActiveData = () => {
      void queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== "session",
        refetchType: "active",
      });
    };
    window.addEventListener(API_DATA_MUTATED_EVENT, refreshActiveData);
    return () => window.removeEventListener(API_DATA_MUTATED_EVENT, refreshActiveData);
  }, [queryClient]);

  const value = useMemo<WorkspaceValue>(() => {
    const dashboard = dashboardQuery.data && typeof dashboardQuery.data === "object" ? dashboardQuery.data : emptyDashboard;
    const parsed = parseDashboard(dashboard, String(me?.user?.id || ""));
    const resources = Object.fromEntries(resourceKinds.map((kind, index) => [
      kind,
      kind === "label" ? labelQuery.data?.resources || [] : routeQueries[6 + resourceKinds.filter((item) => item !== "label").indexOf(kind)]?.data?.resources || [],
    ]));
    const labelOptions = Array.from(new Set<string>([
      ...(resources.label || []).map((resource: any) => String(resource.name || resource.key || "").trim()),
      ...(dashboard.tickets || []).flatMap((ticket: any) => Array.isArray(ticket.labels) ? ticket.labels : []),
    ].filter(Boolean))).sort((left, right) => left.localeCompare(right));

    const updateData = (updater: (previous: any) => any) => {
      queryClient.setQueryData(queryKeys.dashboard(me?.organization?.id), (previous: any) => {
        const parsedPrevious = parseDashboard(previous || emptyDashboard, String(me?.user?.id || ""));
        const next = updater({ ...parsedPrevious, dashboard: previous || emptyDashboard });
        if (next.dashboard !== previous) return next.dashboard;
        const nextTickets = Array.isArray(next.tickets) ? next.tickets : parsedPrevious.tickets;
        const nextProjects = Array.isArray(next.projects) ? next.projects : parsedPrevious.projects;
        return {
          ...(previous || emptyDashboard),
          tickets: (previous?.tickets || []).map((ticket: any) => {
            const update = nextTickets.find((item: any) => String(item.id) === String(ticket._id));
            return update ? { ...ticket, status: update.status, priority: update.priority, rank: update.rank, blocked: update.blocked, labels: update.labels } : ticket;
          }),
          projects: (previous?.projects || []).map((project: any) => {
            const update = nextProjects.find((item: any) => String(item.id) === String(project._id));
            return update ? { ...project, status: update.status, progress: update.progress, riskLevel: update.risk } : project;
          }),
        };
      });
    };
    const mutate = async (apiCall: () => Promise<any>, optimisticUpdate?: (previous: any) => any, rollback?: () => void) => {
      const key = queryKeys.dashboard(me?.organization?.id);
      const snapshot = queryClient.getQueryData(key);
      if (optimisticUpdate) updateData(optimisticUpdate);
      try {
        const result = await apiCall();
        if (result?.ticket) {
          queryClient.setQueryData(key, (previous: any) => ({
            ...(previous || emptyDashboard),
            tickets: (previous?.tickets || []).map((ticket: any) => String(ticket._id) === String(result.ticket._id) ? result.ticket : ticket),
          }));
          queryClient.setQueryData(queryKeys.ticket(String(result.ticket._id)), result);
        } else if (result?.project) {
          queryClient.setQueryData(key, (previous: any) => ({
            ...(previous || emptyDashboard),
            projects: (previous?.projects || []).map((project: any) => String(project._id) === String(result.project._id) ? result.project : project),
          }));
        }
        return result;
      } catch (error) {
        queryClient.setQueryData(key, snapshot);
        rollback?.();
        throw error;
      }
    };
    return {
      user: me?.user, company: me?.company, organization: me?.organization,
      memberships: me?.memberships || [], pendingInvitations: me?.pendingInvitations || [],
      dashboard, notifications: notificationsQuery.data?.notifications || [],
      reports: routeQueries[0].data?.reports || null, sla: routeQueries[1].data || null,
      sessions: routeQueries[2].data?.sessions || [], auditLogs: routeQueries[3].data?.events || [],
      integrations: [...(routeQueries[4].data?.integrations || []), ...(routeQueries[5].data?.integrations || [])],
      resources, labelOptions, ...parsed, role: me?.user?.role || "admin",
      loading: false, error: "",
      refetch: async () => {
        await queryClient.invalidateQueries({
          predicate: (query) => query.queryKey[0] !== "session",
          refetchType: "active",
        });
      },
      updateData, mutate, toast,
    };
  }, [dashboardQuery.data, labelQuery.data, me, notificationsQuery.data, queryClient, routeQueries, toast]);

  if (publicPath) return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
  if (session.isPending || (hasWorkspace && dashboardQuery.isPending)) return <LoadingState label="Loading workspace…" />;
  const error = session.error || dashboardQuery.error;
  if (error) return <ErrorState title="Couldn’t load workspace" body={error instanceof Error ? error.message : "Unable to load workspace"} action={<button className="btn primary" onClick={() => void queryClient.invalidateQueries()}>Try again</button>} />;
  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
