import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { api, clearSession, getToken } from "../api";
import { resourceKinds } from "../constants/resources";
import type { Ticket } from "../types/domain";

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
  organization: null,
  dashboard: null,
  notifications: [],
  resources: {},
  integrations: [],
  auditLogs: [],
  sessions: [],
  reports: null,
};
const WorkspaceContext = React.createContext<{
  user: any;
  organization: any;
  dashboard: any;
  notifications: any[];
  reports: any;
  sessions: any[];
  auditLogs: any[];
  integrations: any[];
  resources: Record<string, any[]>;
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
    organization: null,
    dashboard: null,
    notifications: [],
    reports: null,
    sessions: [],
    auditLogs: [],
    integrations: [],
    resources: {},
    projects: [],
    tickets: [],
    people: [],
    velocity: [],
    risk: [],
  });

  const publicPath = [
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/reset-password",
    "/accept-invite",
  ].includes(location.pathname);

  const loadData = async () => {
    try {
      const isReports = location.pathname.startsWith("/reports");
      const isSessions = location.pathname.startsWith("/sessions") || location.pathname.startsWith("/settings");
      const isAuditLogs = location.pathname.startsWith("/audit-logs");
      const isIntegrations = location.pathname.startsWith("/integrations");
      const isResources = location.pathname.startsWith("/resources") || location.pathname.startsWith("/organization");

      const mePromise = api<any>("/auth/me");
      const dashboardPromise = api<any>("/dashboard");
      const notificationsPromise = api<any>("/notifications").catch(() => ({ notifications: [] }));

      const reportsPromise = isReports
        ? api<any>("/reports").catch(() => null)
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
        me,
        dashboard,
        notificationsData,
        reportsData,
        sessionsData,
        auditLogsData,
        apiTokens,
        webhooks,
      ] = await Promise.all([
        mePromise,
        dashboardPromise,
        notificationsPromise,
        reportsPromise,
        sessionsPromise,
        auditLogsPromise,
        apiTokensPromise,
        webhooksPromise,
      ]);

      let resourcesObj = serverData.resources || {};
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

      const parsedPeople = (dashboard.users || []).map((u: any) => ({
        name: u.name,
        email: u.email,
        role: u.role,
        skills: u.skills || [],
        load:
          Math.round((1 - (u.availability ?? 1)) * 100) ||
          Math.min(100, Math.round(((u.capacity || 0) / 40) * 100)),
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
        project: t.project?.name || "",
        labels: t.labels || [],
        blocked: t.blocked,
        watched: (t.watchers || []).some(
          (w: any) => String(w._id || w) === String(me.user.id),
        ),
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
        organization: me.organization,
        dashboard,
        notifications: notificationsData.notifications || [],
        reports: isReports ? reportsData?.reports : serverData.reports,
        sessions: isSessions ? sessionsData.sessions || [] : serverData.sessions || [],
        auditLogs: isAuditLogs ? auditLogsData.events || [] : serverData.auditLogs || [],
        integrations: isIntegrations
          ? [
              ...(apiTokens.integrations || []),
              ...(webhooks.integrations || []),
            ]
          : serverData.integrations || [],
        resources: resourcesObj,
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
        organization: me.organization,
        dashboard,
        notifications: notificationsData.notifications || [],
        reports: isReports ? reportsData?.reports : serverData.reports,
        sessions: isSessions ? sessionsData.sessions || [] : serverData.sessions || [],
        auditLogs: isAuditLogs ? auditLogsData.events || [] : serverData.auditLogs || [],
        integrations: isIntegrations
          ? [
              ...(apiTokens.integrations || []),
              ...(webhooks.integrations || []),
            ]
          : serverData.integrations || [],
        resources: resourcesObj,
      });

      setLoading(false);
    } catch (e) {
      if (e instanceof Error && e.message.includes("401")) {
        clearSession();
        navigate("/login", { replace: true });
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
      navigate("/login", { replace: true });
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
          organization: next.organization,
          dashboard: next.dashboard,
          notifications: next.notifications,
          reports: next.reports,
          sessions: next.sessions,
          auditLogs: next.auditLogs,
          integrations: next.integrations,
          resources: next.resources,
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
        organization: next.organization,
        dashboard: next.dashboard,
        notifications: next.notifications,
        reports: next.reports,
        sessions: next.sessions,
        auditLogs: next.auditLogs,
        integrations: next.integrations,
        resources: next.resources,
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
    return (
      <div className="app-loading">
        <span className="brand-mark">I</span>
        <b>Loading workspace…</b>
      </div>
    );
  }

  if (error) {
    return (
      <div className="app-loading error">
        <Icons.CloudOff />
        <b>Couldn’t load workspace</b>
        <p>{error}</p>
        <button
          className="btn primary"
          onClick={() => window.location.reload()}
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <WorkspaceContext.Provider value={val}>
      {children}
    </WorkspaceContext.Provider>
  );
}

