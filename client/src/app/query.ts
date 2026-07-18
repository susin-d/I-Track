import { QueryClient } from "@tanstack/react-query";
import { api } from "../api";

export const queryKeys = {
  session: ["session"] as const,
  dashboard: (organization?: string) => ["dashboard", organization ?? "current"] as const,
  tickets: (filters: Record<string, unknown> = {}) => ["tickets", filters] as const,
  ticket: (id: string) => ["ticket", id] as const,
  projects: (filters: Record<string, unknown> = {}) => ["projects", filters] as const,
  notifications: ["notifications"] as const,
  sla: ["sla"] as const,
  reports: ["reports"] as const,
  resources: (kind: string) => ["resources", kind] as const,
  integrations: (kind: string) => ["integrations", kind] as const,
  settings: ["settings"] as const,
  sessions: ["sessions"] as const,
  auditLogs: ["audit-logs"] as const,
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        const status = typeof error === "object" && error && "status" in error
          ? Number((error as { status?: number }).status)
          : 0;
        return failureCount < 2 && (status === 0 || status >= 500);
      },
      refetchOnWindowFocus: true,
    },
    mutations: { retry: false },
  },
});

export const queryFn = <T>(path: string) =>
  ({ signal }: { signal: AbortSignal }) => api<T>(path, { signal });
