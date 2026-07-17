import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ApiError, api, clearSession, getToken } from "../api";
import { resourceKinds } from "../constants/resources";
import type { Ticket } from "../types/domain";
import { ErrorState, LoadingState } from "./components/ui";

let tickets: Ticket[] = [];
let projects: {
  key: string;
  name: string;
  description: string;
  progress: number;
  risk: string;
  members: number;
  sprint: string;
}[] = [];
let people: {
  name: string;
  email: string;
  role: string;
  skills: string[];
  load: number;
  color: string;
}[] = [];
let velocity: { n: string; v: number }[] = [];
let risk: { n: string; v: number }[] = [];
const serverData: any = {
  user: null,
  company: null,
  organization: null,
  dashboard: null,
  notifications: [],
  resources: {},
  labelOptions: [],
  integrations: [],
  auditLogs: [],
  sessions: [],
  reports: null,
  sla: null,
};
const WorkspaceContext = React.createContext<{
  user: any;
  company: any;
  organization: any;
  memberships: any[];
  pendingInvitations: any[];
  dashboard: any;
  notifications: any[];
  reports: any;
  sla: any;
  sessions: any[];
  auditLogs: any[];
  integrations: any[];
  resources: Record<string, any[]>;
  labelOptions: string[];
  projects: any[];
  tickets: any[];
  people: any[];
  velocity: any[];
  risk: any[];
  role: string;
  loading: boolean;
  error: string;
  refetch: () => Promise<void>;
  updateData: (updater: (prev: any) => any) => void;
  mutate: (
    apiCall: () => Promise<any>,
    optimisticUpdate?: (prev: any) => any,
    rollback?: () => void,
  ) => Promise<any>;
  toast: (s: string) => void;
} | null>(null);

export function useWorkspace() {
  const context = React.useContext(WorkspaceContext);
  if (!context)
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return context;
}

export function ApiGate({
  children,
  toast,
}: {
  children: React.ReactNode;
  toast: (s: string) => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [workspace, setWorkspace] = useState<any>({
    user: null,
    company: null,
    organization: null,
    memberships: [],
    pendingInvitations: [],
    dashboard: null,
    notifications: [],
    reports: null,
    sla: null,
    sessions: [],
    auditLogs: [],
    integrations: [],
    resources: {},
    labelOptions: [],
    projects: [],
    tickets: [],
    people: [],
    velocity: [],
    risk: [],
  });

  const publicPath = (location.pathname === "/" && window.location.pathname === "/") || [
    "/login",
    "/auth/google/callback",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/accept-invite",
  ].includes(location.pathname);

  const loadData = async () => {
    try {
      const me = await api<any>("/auth/me");
      if (!me.organization || location.pathname.startsWith("/onboarding") || String(me.next || "").startsWith("/onboarding")) {
        setWorkspace((previous: any) => ({ ...previous, user: me.user, company: me.company, organization: me.organization, memberships: me.memberships || [], pendingInvitations: me.pendingInvitations || [] }));
        setLoading(false);
        if (!location.pathname.startsWith("/onboarding")) navigate(me.pendingInvitations?.length && !me.organization ? "/onboarding/workspace" : (me.next || "/onboarding/workspace"), { replace: true });
        return;
      }
      const slug = String(me.organization.slug || "");
      const currentPrefix = window.location.pathname.split("/").filter(Boolean)[0] || "";
      localStorage.setItem("itrack_workspace_slug", slug);
      if (slug && currentPrefix !== slug) {
        const target = `/${slug}${location.pathname === "/" ? "/dashboard" : location.pathname}${window.location.search}${window.location.hash}`;
        window.location.replace(target);
        return;
      }
      const isReports = location.pathname.startsWith("/reports");
      const isSla = location.pathname.startsWith("/sla");
      const isSessions = location.pathname.startsWith("/sessions") || location.pathname.startsWith("/settings");
      const isAuditLogs = location.pathname.startsWith("/audit-logs");
      const isIntegrations = location.pathname.startsWith("/integrations");
      const isResources = location.pathname.startsWith("/resources") || location.pathname.startsWith("/organization");

      const dashboardPromise = api<any>("/dashboard");
      const notificationsPromise = api<any>("/notifications").catch(() => ({ notifications: [] }));
      const labelResourcesPromise = api<any>("/resources/label").catch(() => ({ resources: [] }));

      const reportsPromise = isReports
        ? api<any>("/reports").catch(() => null)
        : Promise.resolve(null);

      const slaPromise = isSla
        ? api<any>("/sla").catch(() => null)
        : Promise.resolve(null);

      const sessionsPromise = isSessions
        ? api<any>("/auth/sessions").catch(() => ({ sessions: [] }))
        : Promise.resolve({ sessions: [] });

      const auditLogsPromise = isAuditLogs
        ? api<any>("/audit-logs").catch(() => ({ events: [] }))
        : Promise.resolve({ events: [] });

      const apiTokensPromise = isIntegrations
        ? api<any>("/integrations/api-token").catch(() => ({ integrations: [] }))
        : Promise.resolve({ integrations: [] });

      const webhooksPromise = isIntegrations
        ? api<any>("/integrations/webhook").catch(() => ({ integrations: [] }))
        : Promise.resolve({ integrations: [] });

      const [
        dashboard,
        notificationsData,
        labelResourcesData,
        reportsData,
        slaData,
        sessionsData,
        auditLogsData,
        apiTokens,
        webhooks,
      ] = await Promise.all([
        dashboardPromise,
        notificationsPromise,
        labelResourcesPromise,
        reportsPromise,
        slaPromise,
        sessionsPromise,
        auditLogsPromise,
        apiTokensPromise,
        webhooksPromise,
      ]);

      let resourcesObj = {
        ...(serverData.resources || {}),
        label: labelResourcesData.resources || serverData.resources?.label || [],
      };
      if (isResources) {
        const resourcePairs = await Promise.all(
          resourceKinds.map(async (kind) => [
            kind,
            (
              await api<any>(`/resources/${kind}`).catch(() => ({
                resources: [],
              }))
            ).resources,
          ]),
        );
        resourcesObj = Object.fromEntries(resourcePairs);
      }

      const labelOptions = Array.from(
        new Set<string>(
          [
            ...(resourcesObj.label || []).map((resource: any) =>
              String(resource.name || resource.key || "").trim(),
            ),
            ...(dashboard.tickets || []).flatMap((ticket: any) =>
              Array.isArray(ticket.labels) ? ticket.labels : [],
            ),
          ]
            .map((label) => String(label).trim())
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b));

      const parsedPeople = (dashboard.users || []).map((u: any) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        skills: u.skills || [],
        load: u.capacity,
        color: u.avatarColor || "#A47BEF",
      }));

      const parsedProjects = (dashboard.projects || []).map((p: any) => ({
        key: p.key,
        name: p.name,
        description: p.description,
        progress: p.progress,
        risk: p.riskLevel,
        members: p.members?.length || 0,
        sprint: p.activeSprint,
      }));

      const parsedTickets = (dashboard.tickets || []).map((t: any) => ({
        id: t._id,
        key: t.ticketId,
        title: t.title,
        status: t.status,
        priority: t.priority,
        points: t.storyPoints,
        assignee: t.assignee?.name || "Unassigned",
        assigneeId: String(t.assignee?._id || t.assignee || ""),
        project: t.project?.name || "",
        labels: t.labels || [],
        blocked: t.blocked,
        rank: t.rank ?? 0,
        watched: (t.watchers || []).some(
          (w: any) => String(w._id || w) === String(me.user.id),
        ),
        slaStatus: t.slaStatus,
        firstResponseDueAt: t.firstResponseDueAt,
        resolutionDueAt: t.resolutionDueAt,
        firstRespondedAt: t.firstRespondedAt,
        resolvedAt: t.resolvedAt,
        sprintId:
          t.sprint?._id || (typeof t.sprint === "string" ? t.sprint : ""),
        sprintName: t.sprint?.name || "",
      }));

      const activeSprint =
        (dashboard.sprints || []).find((s: any) => s.status === "active") ||
        dashboard.sprints?.[0];

      const parsedVelocity = (activeSprint?.velocityHistory || []).map(
        (v: number, i: number) => ({ n: `S${i + 1}`, v }),
      );

      let parsedRisk = (dashboard.sprints || [])
        .slice(-5)
        .map((s: any) => ({ n: s.name, v: s.riskScore }));
      if (!parsedRisk.length) parsedRisk = [{ n: "Current", v: 0 }];

      const stateVal = {
        user: me.user,
        company: me.company,
        organization: me.organization,
        memberships: me.memberships || [],
        pendingInvitations: me.pendingInvitations || [],
        dashboard,
        notifications: notificationsData.notifications || [],
        reports: isReports ? reportsData?.reports : serverData.reports,
        sla: isSla ? slaData : serverData.sla,
        sessions: isSessions ? sessionsData.sessions || [] : serverData.sessions || [],
        auditLogs: isAuditLogs ? auditLogsData.events || [] : serverData.auditLogs || [],
        integrations: isIntegrations
          ? [
              ...(apiTokens.integrations || []),
              ...(webhooks.integrations || []),
            ]
          : serverData.integrations || [],
        resources: resourcesObj,
        labelOptions,
        projects: parsedProjects,
        tickets: parsedTickets,
        people: parsedPeople,
        velocity: parsedVelocity,
        risk: parsedRisk,
      };

      setWorkspace(stateVal);
      // Synchronize globals as well for non-react components
      tickets = parsedTickets;
      projects = parsedProjects;
      people = parsedPeople;
      velocity = parsedVelocity;
      risk = parsedRisk;
      Object.assign(serverData, {
        user: me.user,
        company: me.company,
        organization: me.organization,
        dashboard,
        notifications: notificationsData.notifications || [],
        reports: isReports ? reportsData?.reports : serverData.reports,
        sla: isSla ? slaData : serverData.sla,
        sessions: isSessions ? sessionsData.sessions || [] : serverData.sessions || [],
        auditLogs: isAuditLogs ? auditLogsData.events || [] : serverData.auditLogs || [],
        integrations: isIntegrations
          ? [
              ...(apiTokens.integrations || []),
              ...(webhooks.integrations || []),
            ]
          : serverData.integrations || [],
        resources: resourcesObj,
        labelOptions,
      });

      setLoading(false);
    } catch (e) {
      if ((e instanceof ApiError && e.status === 401) || (e instanceof Error && e.message.includes("401"))) {
        clearSession();
        window.location.replace("/login");
      } else {
        setError(e instanceof Error ? e.message : "Unable to load workspace");
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    if (publicPath) {
      setLoading(false);
      return;
    }
    if (!getToken()) {
      window.location.replace("/login");
      setLoading(false);
      return;
    }
    loadData();
  }, [location.pathname, publicPath, navigate]);

  const mutate = async (
    apiCall: () => Promise<any>,
    optimisticUpdate?: (prev: any) => any,
    rollback?: () => void,
  ) => {
    const previousState = { ...workspace };
    if (optimisticUpdate) {
      setWorkspace((prev: any) => {
        const next = optimisticUpdate(prev);
        // Sync globals too
        tickets = next.tickets;
        projects = next.projects;
        people = next.people;
        velocity = next.velocity;
        risk = next.risk;
        Object.assign(serverData, {
          user: next.user,
          company: next.company,
          organization: next.organization,
          dashboard: next.dashboard,
          notifications: next.notifications,
          reports: next.reports,
          sla: next.sla,
          sessions: next.sessions,
          auditLogs: next.auditLogs,
          integrations: next.integrations,
        resources: next.resources,
        labelOptions: next.labelOptions,
        });
        return next;
      });
    }
    try {
      const result = await apiCall();
      await loadData();
      return result;
    } catch (err) {
      if (rollback) {
        rollback();
      } else {
        setWorkspace(previousState);
        tickets = previousState.tickets;
        projects = previousState.projects;
        people = previousState.people;
        velocity = previousState.velocity;
        risk = previousState.risk;
        Object.assign(serverData, previousState);
      }
      throw err;
    }
  };

  const updateData = (updater: (prev: any) => any) => {
    setWorkspace((prev: any) => {
      const next = updater(prev);
      tickets = next.tickets;
      projects = next.projects;
      people = next.people;
      velocity = next.velocity;
      risk = next.risk;
      Object.assign(serverData, {
        user: next.user,
        company: next.company,
        organization: next.organization,
        dashboard: next.dashboard,
        notifications: next.notifications,
        reports: next.reports,
        sla: next.sla,
        sessions: next.sessions,
        auditLogs: next.auditLogs,
        integrations: next.integrations,
          resources: next.resources,
          labelOptions: next.labelOptions,
      });
      return next;
    });
  };

  const val = {
    ...workspace,
    role: workspace.user?.role || "admin",
    loading,
    error,
    refetch: loadData,
    updateData,
    mutate,
    toast,
  };

  if (loading) {
    return <LoadingState label="Loading workspace…" />;
  }

  if (error) {
    return (
      <ErrorState
        title="Couldn’t load workspace"
        body={error}
        action={
          <button
            className="btn primary"
            onClick={() => {
              setError("");
              setLoading(true);
              void loadData();
            }}
          >
            Try again
          </button>
        }
      />
    );
  }

  return (
    <WorkspaceContext.Provider value={val}>
      {children}
    </WorkspaceContext.Provider>
  );
}

