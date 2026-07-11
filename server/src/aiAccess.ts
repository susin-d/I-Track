import { apiCatalog } from "./apiCatalog.js";
import { rolesForEndpoint } from "./middleware/access.js";
import type { UserRole } from "./models/User.js";

export type AiEndpoint = {
  method: string;
  path: string;
  group: string;
  roles: UserRole[];
  requiresConfirmation: boolean;
};

const destructiveOperations = [
  "POST /users/:id/deactivate",
  "DELETE /users/:id",
  "DELETE /invitations/:userId",
  "DELETE /projects/:id",
  "POST /projects/:id/archive",
  "DELETE /sprints/:id",
  "POST /sprints/:id/complete",
  "DELETE /tickets/:id",
  "POST /tickets/:id/archive",
  "DELETE /tickets/:id/watch",
  "DELETE /tickets/:id/comments/:commentId",
  "DELETE /tickets/:id/work-logs/:logId",
  "DELETE /tickets/:id/attachments/:attachmentId",
  "DELETE /resources/:kind/:id",
  "POST /notifications/read-all",
  "DELETE /integrations/:kind/:id",
  "DELETE /organization",
] as const;

const destructiveKeys = new Set<string>(destructiveOperations);

export function normalizeAiPath(path: string) {
  const [pathname, query = ""] = path.trim().split("?", 2);
  const withoutOrigin = pathname.replace(/^https?:\/\/[^/]+/i, "");
  const withoutApiPrefix = withoutOrigin.replace(/^\/api\/v1(?=\/|$)/, "").replace(/^\/api(?=\/|$)/, "");
  const normalized = withoutApiPrefix.startsWith("/") ? withoutApiPrefix : `/${withoutApiPrefix}`;
  return `${normalized.replace(/\/+$/, "") || "/"}${query ? `?${query}` : ""}`;
}

function pathPatternToRegExp(pattern: string) {
  return new RegExp(`^${pattern.replace(/:[^/]+/g, "[^/]+")}$`);
}

function endpointMatches(method: string, path: string, endpoint: string) {
  const [endpointMethod, endpointPath] = endpoint.split(" ") as [string, string];
  return endpointMethod === method.toUpperCase() && pathPatternToRegExp(endpointPath).test(path);
}

export function isConfirmationRequired(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeAiPath(path).split("?")[0] ?? "/";
  if (normalizedMethod === "DELETE") return true;
  return destructiveOperations.some((operation) => endpointMatches(normalizedMethod, normalizedPath, operation));
}

export function catalogEndpointFor(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeAiPath(path).split("?")[0] ?? "/";
  for (const [group, endpoints] of Object.entries(apiCatalog.groups)) {
    const endpoint = endpoints.find((candidate) => endpointMatches(normalizedMethod, normalizedPath, candidate));
    if (endpoint) return { group, endpoint };
  }
  return null;
}

export function aiEndpointsForRole(role: UserRole): AiEndpoint[] {
  return Object.entries(apiCatalog.groups).flatMap(([group, endpoints]) =>
    endpoints.map((endpoint) => {
      const [method, path] = endpoint.split(" ") as [string, string];
      const roles = rolesForEndpoint(method, path);
      return {
        method,
        path,
        group,
        roles,
        requiresConfirmation: method === "DELETE" || destructiveKeys.has(endpoint),
      };
    }).filter((endpoint) => endpoint.roles.includes(role)),
  );
}

export function canRoleAccessAiEndpoint(role: UserRole, method: string, path: string) {
  const normalizedPath = normalizeAiPath(path).split("?")[0] ?? "/";
  const catalogEndpoint = catalogEndpointFor(method, normalizedPath);
  if (!catalogEndpoint) return { allowed: false, roles: [] as UserRole[], endpoint: null };
  const [catalogMethod, catalogPath] = catalogEndpoint.endpoint.split(" ") as [string, string];
  const roles = rolesForEndpoint(catalogMethod, catalogPath);
  return { allowed: roles.includes(role), roles, endpoint: catalogEndpoint.endpoint };
}
