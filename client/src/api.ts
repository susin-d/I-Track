const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/+$/, "");
export const API_DATA_MUTATED_EVENT = "itrack:data-mutated";

let refreshPromise: Promise<boolean> | null = null;
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRYABLE_STATUS = new Set([502, 503, 504]);

export type ApiRequestOptions = RequestInit & { timeoutMs?: number };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly payload?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getToken() {
  return null;
}

export function getRefreshToken() {
  return null;
}

export function clearSession() {
  // Session cookies are cleared by the server's /auth/logout endpoint.
}

export function saveSession(_session: { token?: string; refreshToken?: string }) {
  // Kept as a compatibility no-op while older callers migrate to cookies.
}

export function googleLoginUrl() {
  return `${API_BASE}/auth/google`;
}

export function apiResourceUrl(url: string) {
  if (!url || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(url)) return url;

  const normalized = `/${url.replace(/^\/+/, "")}`;
  const apiPath = normalized.replace(/^\/api\/v1(?=\/|$)/, "");
  return `${API_BASE}${apiPath}`;
}

function isPublicAuthPath(path: string) {
  const normalized = path.split("?", 1)[0];
  return /^\/auth\/(login|register|verify-otp|resend-otp|refresh|logout|forgot-password|reset-password|accept-invite)$/.test(normalized);
}

async function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });
      return response.ok;
    })()
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function requestSignal(signal: AbortSignal | null | undefined, timeoutMs: number) {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal;
}

export async function apiFetch(path: string, options: ApiRequestOptions = {}) {
  const canRefresh = !isPublicAuthPath(path);
  const { timeoutMs = DEFAULT_TIMEOUT_MS, ...fetchOptions } = options;
  const request = () => {
    const headers = new Headers(fetchOptions.headers);
    if (fetchOptions.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    return fetch(`${API_BASE}${path}`, {
      ...fetchOptions,
      headers,
      credentials: "include",
      signal: requestSignal(fetchOptions.signal, timeoutMs),
    });
  };

  let response = await request();
  if ((!fetchOptions.method || fetchOptions.method === "GET") && RETRYABLE_STATUS.has(response.status)) {
    response = await request();
  }
  if (response.status === 401 && canRefresh && await refreshSession()) {
    response = await request();
  }
  if (response.status === 401) {
    clearSession();
    if (typeof window !== "undefined" && !isPublicAuthPath(path) && window.location.pathname !== "/login") {
      window.location.assign("/login");
    }
  }
  return response;
}

export async function api<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const response = await apiFetch(path, options);
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new ApiError(
      body.message || body.error?.message || `Request failed (${response.status})`,
      response.status,
      body,
    );
  }
  const result = response.status === 204 ? (undefined as T) : await response.json();
  const method = String(options.method || "GET").toUpperCase();
  if (typeof window !== "undefined" && !["GET", "HEAD", "OPTIONS"].includes(method)) {
    window.dispatchEvent(new CustomEvent(API_DATA_MUTATED_EVENT, { detail: { path, method } }));
  }
  return result;
}

export async function login(email: string, password: string) {
  const session = await api<any>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return session;
}

export async function logout() {
  try {
    await api("/auth/logout", {
      method: "POST",
    });
  } finally {
    clearSession();
  }
}

export async function hasSession() {
  const response = await fetch(`${API_BASE}/auth/me`, { credentials: "include" });
  return response.ok;
}
