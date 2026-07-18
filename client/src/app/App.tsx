import React, { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import * as Icons from "lucide-react";
import { ApiGate } from "./workspace";
import { AppDialogHost } from "./components/AppDialog";
import { Shell } from "./Shell";

// Page modules
import { LandingPage } from "./pages/LandingPage";
import { AuthPageLive, GoogleAuthCallback, InvitationAcceptPage } from "./pages/AuthPages";
import { OnboardingFlow } from "./pages/OnboardingFlow";
import { AppRoutes } from "./AppRoutes";

export function App() {
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "system");
  const [density, setDensity] = useState(localStorage.getItem("density") || "comfortable");
  type ToastInput = string | { message: string; tone?: "success" | "error" | "warning" | "info"; action?: { label: string; run: () => void }; durationMs?: number };
  const [toasts, setToasts] = useState<Array<{ id: string; message: string; tone: string; action?: { label: string; run: () => void } }>>([]);
  const toastSequence = React.useRef(0);

  useEffect(() => {
    document.documentElement.dataset.density = density;
    localStorage.setItem("theme", theme);
    localStorage.setItem("density", density);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
    apply();
    if (theme === "system") media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, density]);

  const toast = (input: ToastInput) => {
    const id = `${Date.now()}-${toastSequence.current++}`;
    const item = typeof input === "string" ? { message: input, tone: "success" } : { tone: "info", ...input };
    setToasts([{ id, ...item }]);
    setTimeout(() => setToasts((current) => current.filter((toastItem) => toastItem.id !== id)), item.durationMs ?? (item.action ? 10_000 : 4_000));
  };

  const dismissToast = (id: string) => setToasts((items) => items.filter((item) => item.id !== id));

  // Determine basename dynamically
  const rawParts = window.location.pathname.split("/").filter(Boolean);
  const parts = rawParts.map((p) => decodeURIComponent(p));
  const savedSlug = localStorage.getItem("itrack_workspace_slug");
  const workspaceRouteRoots = new Set([
    "dashboard", "my-work", "notifications", "projects", "resources", "backlog",
    "board", "cycles", "sprints", "sla", "sprint-risk", "sprints-risk", "sprint risk",
    "tickets", "team", "reports", "ai", "organization", "sessions", "settings",
    "audit-logs", "integrations", "import", "groups", "work-model", "403", "500", "offline"
  ]);

  let basename = "/";
  if (savedSlug && (parts[0] === savedSlug || rawParts[0] === savedSlug)) {
    basename = `/${rawParts[0]}`;
  } else if (parts.length > 1 && (workspaceRouteRoots.has(parts[1]) || workspaceRouteRoots.has(rawParts[1]))) {
    basename = `/${rawParts[0]}`;
  } else if (
    parts.length === 1 &&
    !workspaceRouteRoots.has(parts[0]) &&
    !workspaceRouteRoots.has(rawParts[0]) &&
    !["login", "register", "forgot-password", "reset-password", "accept-invite", "onboarding", "auth"].includes(parts[0])
  ) {
    basename = `/${rawParts[0]}`;
  }

  return (
    <BrowserRouter basename={basename}>
      <ApiGate toast={toast}>
        <Routes>
          {basename === "/" && <Route path="/" element={<LandingPage />} />}
          <Route path="/login" element={<AuthPageLive type="login" />} />
          <Route path="/auth/google/callback" element={<GoogleAuthCallback />} />
          <Route path="/register" element={<AuthPageLive type="register" />} />
          <Route path="/forgot-password" element={<AuthPageLive type="forgot-password" />} />
          <Route path="/reset-password" element={<AuthPageLive type="reset-password" />} />
          <Route path="/accept-invite" element={<InvitationAcceptPage />} />
          <Route path="/onboarding/:step" element={<OnboardingFlow toast={toast} />} />
          <Route
            path="/*"
            element={
              <Shell theme={theme} setTheme={setTheme} toast={toast}>
                <AppRoutes theme={theme} setTheme={setTheme} density={density} setDensity={setDensity} toast={toast} />
              </Shell>
            }
          />
        </Routes>
        <div className="toast-stack" aria-live="polite" aria-atomic="true">
          {toasts.map((t) => (
            <div className={`toast ${t.tone}`} key={t.id} role={t.tone === "error" ? "alert" : "status"}>
              {t.tone === "error" ? <Icons.AlertCircle size={18} /> : <Icons.CheckCircle2 size={18} />}
              <span>{t.message}</span>
              {t.action && <button className="toast-action" type="button" onClick={() => { t.action?.run(); dismissToast(t.id); }}>{t.action.label}</button>}
              <button className="toast-dismiss" type="button" onClick={() => dismissToast(t.id)} aria-label="Dismiss notification" title="Dismiss">
                <Icons.X size={15} />
              </button>
            </div>
          ))}
        </div>
        <AppDialogHost />
      </ApiGate>
    </BrowserRouter>
  );
}
