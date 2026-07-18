import React, { useEffect, useState } from "react";
import { useNavigate, useSearchParams, NavLink } from "react-router-dom";
import * as Icons from "lucide-react";
import { api, hasSession, login, googleLoginUrl } from "../../api";
import { Badge, PasswordInput } from "../components/ui";
import { cx, fmt } from "../../utils/ui";
import { appForm } from "../components/AppDialog";

export function AuthPageLive({ type }: { type: string }) {
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState("");
  const [resetLink, setResetLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpChallenge, setOtpChallenge] = useState<{ purpose: "registration" | "login"; email: string } | null>(null);
  const token = searchParams.get("token") || "";
  const tokenFlow = type === "reset-password" || type === "accept-invite";

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) setError(oauthError);
  }, [searchParams]);

  const titles: Record<string, string> = {
    login: "Welcome back",
    register: "Create your account",
    "forgot-password": "Reset your password",
    "reset-password": "Choose a new password",
    "accept-invite": "Join your workspace",
  };

  const resendOtp = async () => {
    if (!otpChallenge) return;
    setBusy(true); setError("");
    try {
      const result = await api<any>("/auth/resend-otp", { method: "POST", body: JSON.stringify({ email: otpChallenge.email, purpose: otpChallenge.purpose }) });
      if (result.requiresOtp) setError("A new 6-digit verification code has been sent to your email.");
      else setError(result.message || "If eligible, a new verification code has been sent.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to resend the code"); } finally { setBusy(false); }
  };

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResetLink("");
    const data = new FormData(e.currentTarget);
    try {
      if (otpChallenge) {
        const session = await api<any>("/auth/verify-otp", {
          method: "POST",
          body: JSON.stringify({ email: otpChallenge.email, otp: data.get("otp"), purpose: otpChallenge.purpose }),
        });
        nav(session.next || "/dashboard");
        location.reload();
        return;
      }
      if (type === "login") {
        const session = await login(String(data.get("email")), String(data.get("password")));
        if (session.requiresOtp) {
          setOtpChallenge({ purpose: "login", email: session.email });
          setError("We sent a 6-digit verification code to your email.");
          return;
        }
        nav(session.next || "/dashboard");
        location.reload();
        return;
      }
      if (type === "register") {
        const session = await api<any>("/auth/register", {
          method: "POST",
          body: JSON.stringify({
            name: data.get("name"),
            email: data.get("email"),
            password: data.get("password"),
          }),
        });
        if (session.requiresOtp) {
          setOtpChallenge({ purpose: "registration", email: session.email });
          setError("We sent a 6-digit verification code to your email.");
          return;
        }
        nav(session.next || "/onboarding/workspace");
        location.reload();
        return;
      }
      if (type === "forgot-password") {
        const result = await api<{ resetToken?: string }>("/auth/forgot-password", {
          method: "POST",
          body: JSON.stringify({ email: data.get("email") }),
        });
        setError("If the account exists, reset instructions have been sent.");
        if (result.resetToken) {
          setResetLink(`${window.location.origin}/reset-password?token=${encodeURIComponent(result.resetToken)}`);
        }
        return;
      }
      if (!token) throw new Error("Open this page using the token from your invitation or password-reset link.");
      const password = String(data.get("password") || "");
      if (password !== String(data.get("confirmPassword") || "")) {
        throw new Error("Passwords do not match");
      }
      if (type === "reset-password") {
        await api("/auth/reset-password", {
          method: "POST",
          body: JSON.stringify({ token, password }),
        });
        nav("/login");
        return;
      }
      const session = await api<any>("/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, password, name: data.get("name") || undefined }),
      });
      nav("/dashboard");
      location.reload();
      return;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand big">
          <div className="brand-mark"><img src="/logo-mark-soft-purple.png" alt="" /></div>
          <span>I-TRACK</span>
        </div>
        <div>
          <Badge tone="lime">
            <Icons.Sparkles />
            EXPLAINABLE DELIVERY INTELLIGENCE
          </Badge>
          <h1>
            Build momentum.
            <br />
            See risk sooner.
          </h1>
          <p>
            Plan focused work, protect capacity, and turn delivery signals into
            confident decisions.
          </p>
          {otpChallenge && <div className="auth-message">Enter the 6-digit code sent to {otpChallenge.email}.</div>}
        </div>
        <div className="auth-quote">
          <p>Live workspace data, secured by your organization account.</p>
        </div>
      </section>
      <section className="auth-form">
        <form onSubmit={submit}>
          <span className="eyebrow">I-TRACK WORKSPACE</span>
          <h1>{titles[type]}</h1>
          <p>
            {type === "login"
              ? "Sign in to load your workspace data."
              : tokenFlow
                ? "Use the secure link you received to finish setup."
                : type === "register"
                  ? "Start with your identity. You’ll create a workspace next."
                  : "Complete the details below to continue."}
          </p>
          {type === "register" && (
            <label className="field">
              <span>Full name</span>
              <input name="name" required />
            </label>
          )}
          {type === "accept-invite" && (
            <label className="field">
              <span>Full name</span>
              <input name="name" minLength={2} required />
            </label>
          )}
          {!tokenFlow && (
            <label className="field">
              <span>Email address</span>
              <input
                name="email"
                type="email"
                required
              />
            </label>
          )}
          {type !== "forgot-password" && (
            <label className="field">
              <span>Password</span>
              <PasswordInput
                name="password"
                minLength={8}
                required
              />
            </label>
          )}
          {otpChallenge && (
            <label className="field">
              <span>Verification code</span>
              <input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
            </label>
          )}
          {tokenFlow && (
            <label className="field">
              <span>Confirm password</span>
              <PasswordInput name="confirmPassword" minLength={8} required />
            </label>
          )}
          {tokenFlow && !token && (
            <div className="auth-message">
              Open this page using the token from your invitation or password-reset link.
            </div>
          )}
          {error && (
            <div
              className={cx(
                "auth-message",
                error.startsWith("If") && "success",
              )}
            >
              {error}
            </div>
          )}
          {resetLink && (
            <a className="auth-switch" href={resetLink}>
              Open password reset page
            </a>
          )}
          {otpChallenge && <button type="button" className="auth-switch" onClick={resendOtp} disabled={busy}>Resend verification code</button>}
          <button className="btn primary wide" disabled={busy || (tokenFlow && !token)}>
            {busy
              ? "Please wait…"
              : otpChallenge
                ? "Verify code"
              : type === "login"
                ? "Sign in"
                : type === "forgot-password"
                  ? "Send reset instructions"
                  : type === "reset-password"
                    ? "Set new password"
                    : type === "accept-invite"
                      ? "Accept invitation"
                  : "Continue"}
          </button>
          {(type === "login" || type === "register") && (
            <>
              <div className="auth-divider"><span>or</span></div>
              <a className="btn wide google-auth-button" href={googleLoginUrl()}>
                <span className="google-mark" aria-hidden="true">G</span>
                Continue with Google
              </a>
            </>
          )}
          {type === "login" && (
            <p className="auth-switch">
              <NavLink to="/forgot-password">Forgot password?</NavLink> ·{" "}
              <NavLink to="/register">Create account</NavLink>
            </p>
          )}
        </form>
      </section>
    </div>
  );
}

export function GoogleAuthCallback() {
  const nav = useNavigate();
  const [error, setError] = useState("");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedNext = params.get("next") || "/dashboard";
    const next = requestedNext.startsWith("/") && !requestedNext.startsWith("//") ? requestedNext : "/dashboard";
    hasSession()
      .then((authenticated) => {
        if (!authenticated) throw new Error("Google sign-in did not return a valid session.");
        window.history.replaceState(null, "", "/auth/google/callback");
        nav(next, { replace: true });
        window.location.reload();
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Google sign-in failed."));
  }, [nav]);
  return (
    <div className="app-loading">
      {error ? <><Icons.CircleAlert /><p>{error}</p><NavLink className="btn" to="/login">Back to sign in</NavLink></> : <><Icons.LoaderCircle className="spin" /><p>Finishing Google sign-in…</p></>}
    </div>
  );
}

export function InvitationAcceptPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const nav = useNavigate();
  const [preview, setPreview] = useState<any>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [otpStep, setOtpStep] = useState<"login" | "invite" | null>(null);

  useEffect(() => {
    if (token) api<any>(`/invitations/preview?token=${encodeURIComponent(token)}`).then(setPreview).catch((e) => setError(e.message));
    else setError("Invitation token is missing");
  }, [token]);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError(""); const values = new FormData(event.currentTarget);
    try {
      if (preview.accountExists && otpStep === "login") {
        const session = await api<any>("/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: preview.invitation.email, otp: values.get("otp"), purpose: "login" }) });
        setOtpStep("invite"); return;
      }
      if (preview.accountExists && !(await hasSession())) {
        const session = await login(preview.invitation.email, String(values.get("password")));
        if (session.requiresOtp) { setOtpStep("login"); setError("We sent a login code to your email. Enter it to continue."); return; }
      }
      const password = String(values.get("password") || "");
      if (!preview.accountExists && password !== String(values.get("confirmPassword") || "")) throw new Error("Passwords do not match");
      const session = await api<any>("/auth/accept-invite", { method: "POST", body: JSON.stringify({ token, otp: values.get("otp"), ...(!preview.accountExists ? { name: values.get("name"), password } : {}) }) });
      window.location.assign("/dashboard");
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to accept invitation"); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <section className="auth-brand">
        <div className="brand big">
          <div className="brand-mark"><img src="/logo-mark-soft-purple.png" alt="" /></div>
          <span>I-TRACK</span>
        </div>
        <div>
          <Badge tone="lime">WORKSPACE INVITATION</Badge>
          <h1>Work together.<br />Stay aligned.</h1>
          <p>Review the workspace and your role before joining.</p>
        </div>
      </section>
      <section className="auth-form">
        {!preview ? (
          <div className="auth-message">{error || "Loading invitation…"}</div>
        ) : (
          <form onSubmit={submit}>
            <span className="eyebrow">INVITED WORKSPACE</span>
            <h1>Join {preview.invitation.organization?.name}</h1>
            <p>{preview.invitation.invitedBy?.name || "A workspace admin"} invited you as <b>{fmt(preview.invitation.role)}</b>.</p>
            <div className="invite-summary">
              <span>Email <b>{preview.invitation.email}</b></span>
              <span>Role <b>{fmt(preview.invitation.role)}</b></span>
            </div>
            {!preview.accountExists && (
              <label className="field">
                <span>Full name</span>
                <input name="name" defaultValue={preview.invitation.name} required />
              </label>
            )}
            <label className="field">
              <span>{preview.accountExists ? "Password to sign in" : "Create password"}</span>
              <PasswordInput name="password" minLength={8} required />
            </label>
            {!preview.accountExists && (
              <label className="field">
                <span>Confirm password</span>
                <PasswordInput name="confirmPassword" minLength={8} required />
              </label>
            )}
            <label className="field">
              <span>{otpStep === "login" ? "Login verification code" : "Invitation verification code"}</span>
              <input name="otp" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required />
            </label>
            {error && <div className="auth-message">{error}</div>}
            <button className="btn primary wide" disabled={busy}>
              {busy ? "Please wait…" : otpStep === "login" ? "Verify login code" : "Accept invitation"}
            </button>
            {preview.accountExists && (
              <button type="button" className="btn wide" onClick={() => nav("/login")}>
                Use another account
              </button>
            )}
          </form>
        )}
      </section>
    </div>
  );
}
