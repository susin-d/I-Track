import React, { useEffect, useState } from "react";
import { useLocation, useNavigate, NavLink } from "react-router-dom";
import * as Icons from "lucide-react";
import { useWorkspace } from "./workspace";
import { api, clearSession } from "../api";
import { appForm, appPrompt } from "./components/AppDialog";
import { nav } from "./navigation";
import { Badge } from "./components/ui";
import { CustomMarkdown } from "./components/Markdown";
import { AiAgentPanel } from "./components/AiAgent";
import { AiAgentProvider } from "./components/AiAgent";
import { Command } from "./components/Command";
import { cx, fmt } from "../utils/ui";

export function Shell({
  children,
  theme,
  setTheme,
  toast,
}: {
  children: React.ReactNode;
  theme: string;
  setTheme: (s: string) => void;
  toast: (s: string) => void;
}) {
  const {
    company,
    organization,
    user: currentUser,
    notifications = [],
    memberships = [],
    pendingInvitations = [],
    refetch,
    role,
  } = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState(false);
  const [companyMenu, setCompanyMenu] = useState(false);
  const [workspaceMenu, setWorkspaceMenu] = useState(false);
  const [notificationMenu, setNotificationMenu] = useState(false);
  const [aiPanel, setAiPanel] = useState(false);
  const [selectedInvitation, setSelectedInvitation] = useState<any>(null);
  const [companies, setCompanies] = useState<any[]>([]);
  const mobileMenuButton = React.useRef<HTMLButtonElement>(null);
  const searchButton = React.useRef<HTMLButtonElement>(null);
  const notificationMenuRef = React.useRef<HTMLDivElement>(null);
  const loc = useLocation();
  const navigate = useNavigate();

  const label =
    nav
      .flatMap((g) => g.items)
      .find((i) => loc.pathname.startsWith(i[0]))?.[2] ||
    fmt(loc.pathname.split("/").filter(Boolean).at(-1) || "Dashboard");

  const effectiveRole = currentUser?.role || role;

  const switchWorkspace = async (organizationId: string) => {
    await api<any>(`/workspaces/${organizationId}/switch`, {
      method: "POST",
    });
    window.location.assign("/dashboard");
  };

  const acceptPendingInvitation = async () => {
    if (!selectedInvitation) return;
    const values = await appForm({
      title: "Accept invitation",
      message: "Enter the 6-digit verification code sent to your email.",
      fields: [{ name: "otp", label: "Verification code", required: true, placeholder: "123456" }],
      confirmLabel: "Accept invitation",
    });
    const otp = values?.otp?.trim();
    if (!otp) return;
    await api<any>("/auth/accept-invite", {
      method: "POST",
      body: JSON.stringify({ invitationId: selectedInvitation.id, otp }),
    });
    window.location.assign("/dashboard");
  };

  useEffect(() => {
    void api<any>("/companies")
      .then((data) => setCompanies(data.companies || []))
      .catch(() => setCompanies([]));
  }, [company?.id, company?._id, organization?.id, organization?._id]);

  const switchCompany = async (nextCompany: any) => {
    try {
      setCompanyMenu(false);
      const data = await api<any>(`/companies/${nextCompany.id || nextCompany._id}/workspaces`);
      const nextWorkspace = data.workspaces?.[0];
      if (!nextWorkspace) return toast("This organization has no accessible workspaces");
      await switchWorkspace(nextWorkspace.id || nextWorkspace._id);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Unable to switch organization");
    }
  };

  const unreadCount = notifications.filter((n: any) => !n.readAt).length;
  const recentNotifications = notifications.slice(0, 5);

  const closeOverlays = React.useCallback(() => {
    setMobile(false);
    setSearch(false);
    setCompanyMenu(false);
    setWorkspaceMenu(false);
    setNotificationMenu(false);
    setAiPanel(false);
  }, []);

  useEffect(() => {
    closeOverlays();
  }, [loc.pathname, closeOverlays]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        closeOverlays();
        setSearch(true);
      }
      if (event.key === "Escape") {
        const wasMobile = mobile;
        const wasSearch = search;
        closeOverlays();
        if (wasMobile) mobileMenuButton.current?.focus();
        if (wasSearch) searchButton.current?.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobile, search, closeOverlays]);

  useEffect(() => {
    document.body.classList.toggle("overlay-open", mobile || search || aiPanel);
    return () => document.body.classList.remove("overlay-open");
  }, [mobile, search, aiPanel]);

  useEffect(() => {
    if (!notificationMenu) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!notificationMenuRef.current?.contains(event.target as Node)) {
        setNotificationMenu(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [notificationMenu]);

  const markNotificationRead = async (item: any) => {
    if (item.readAt) return;
    try {
      await api(`/notifications/${item._id || item.id}/read`, { method: "PATCH" });
      await refetch();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to mark notification read");
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      await api("/notifications/read-all", { method: "POST" });
      await refetch();
      toast("All notifications marked as read");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to mark all read");
    }
  };

  return (
    <AiAgentProvider toast={toast}>
      <div className={cx("app", collapsed && "collapsed")}>
        <a className="skip-link" href="#main-content">
          Skip to main content
        </a>
        <aside className={cx("sidebar", mobile && "open")} aria-label="Workspace navigation">
          <div className="brand">
            <div className="brand-mark"><img src="/logo-mark-soft-purple.png" alt="" /></div>
            <span>I-TRACK</span>
            <button
              className="icon-btn collapse"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {collapsed ? <Icons.PanelLeftOpen size={19} /> : <Icons.PanelLeftClose size={19} />}
            </button>
            <button
              className="icon-btn mobile-sidebar-close"
              onClick={() => setMobile(false)}
              aria-label="Close navigation"
              title="Close navigation"
            >
              <Icons.X size={19} />
            </button>
          </div>
          <div className="company-context-wrap">
            <button className="company-context" onClick={() => { setWorkspaceMenu(false); setCompanyMenu(!companyMenu); }} aria-haspopup="menu" aria-expanded={companyMenu}>
              <span className="avatar">{(company?.name || organization?.name || "O").slice(0, 2).toUpperCase()}</span>
              <span><b>{company?.name || organization?.name || "Organization"}</b></span>
              <Icons.ChevronsUpDown size={14} />
            </button>
            {companyMenu && (
              <div className="workspace-menu company-menu" role="menu">
                <p>ORGANIZATIONS</p>
                {companies.map((item) => {
                  const selected = String(item.id || item._id) === String(company?.id || company?._id);
                  return <button key={item.id || item._id} className={selected ? "selected" : ""} role="menuitem" onClick={() => selected ? setCompanyMenu(false) : void switchCompany(item)}><span className="avatar">{item.name.slice(0, 2).toUpperCase()}</span><span><b>{item.name}</b><small>{selected ? "Current organization" : fmt(item.role)}</small></span>{selected && <Icons.Check size={16} />}</button>;
                })}
                <hr />
                <button role="menuitem" onClick={() => { setCompanyMenu(false); navigate("/organization"); }}><Icons.Settings size={17} /><span><b>Organization settings</b><small>Directory, groups and workspaces</small></span></button>
              </div>
            )}
          </div>
          <div className="workspace-switcher">
            <button className="org-switch" aria-haspopup="menu" aria-expanded={workspaceMenu} onClick={() => setWorkspaceMenu(!workspaceMenu)}>
              <span className="avatar square">
                {(organization?.name || "Workspace")
                  .split(" ")
                  .map((x: string) => x[0])
                  .join("")
                  .slice(0, 2)}
              </span>
              <span>
                <b>{organization?.name || "Workspace"}</b>
                <small>Current workspace · {fmt(organization?.plan || "starter")}</small>
              </span>
              <Icons.ChevronsUpDown size={15} />
            </button>
            {workspaceMenu && (
              <div className="workspace-menu" role="menu">
                <p>WORKSPACES</p>
                {(() => {
                  const activeCompanyId = String(company?.id || company?._id || organization?.companyId || organization?.company || "");
                  const companyMemberships = memberships.filter((membership: any) => {
                    if (!activeCompanyId) return true;
                    const mCompanyId = String(membership.organization?.companyId || membership.organization?.company || "");
                    return !mCompanyId || mCompanyId === activeCompanyId;
                  });
                  return companyMemberships.map((membership: any) => {
                    const selected = String(membership.organization?.id) === String(organization?.id || organization?._id);
                    return <button key={membership.id} className={selected ? "selected" : ""} role="menuitem" onClick={() => selected ? setWorkspaceMenu(false) : switchWorkspace(membership.organization.id)}><span className="avatar square">{(membership.organization?.name || "W").slice(0, 2).toUpperCase()}</span><span><b>{membership.organization?.name}</b><small>{selected ? "Current workspace" : fmt(membership.role)}</small></span>{selected && <Icons.Check size={16} />}</button>;
                  });
                })()}
                {(() => {
                  const activeCompanyId = String(company?.id || company?._id || organization?.companyId || organization?.company || "");
                  const companyPendingInvitations = pendingInvitations.filter((invitation: any) => {
                    if (!activeCompanyId) return true;
                    const invCompanyId = String(invitation.organization?.companyId || invitation.organization?.company || "");
                    return !invCompanyId || invCompanyId === activeCompanyId;
                  });
                  return companyPendingInvitations.map((invitation: any) => (
                    <button key={invitation.id} role="menuitem" onClick={() => { setWorkspaceMenu(false); setSelectedInvitation(invitation); }}><span className="avatar square bg-orange">{(invitation.organization?.name || "W").slice(0, 2).toUpperCase()}</span><span><b>{invitation.organization?.name}</b><small>Pending invitation</small></span><Icons.Clock size={16} /></button>
                  ));
                })()}
              </div>
            )}
          </div>
          <nav className="nav" aria-label="Main menu">
            {nav.map((group) => (
              <div className="nav-group" key={group.group}>
                <span className="nav-group-title">{group.group}</span>
                {group.items.map(([path, Icon, name]) => {
                  return (
                    <NavLink className="nav-item" to={path} key={path} onClick={() => setMobile(false)}>
                      <Icon size={18} />
                      <span>{name}</span>
                    </NavLink>
                  );
                })}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <button className="btn" onClick={() => setAiPanel(!aiPanel)}><Icons.Sparkles size={16} /><span>Ask I-Track AI</span></button>
            <div className="user-profile">
              <span className="avatar" style={{ background: currentUser?.avatarColor || "#7c3aed" }}>{currentUser?.name?.slice(0, 2).toUpperCase()}</span>
              <span><b>{currentUser?.name}</b><small>{currentUser?.email}</small></span>
              <NavLink to="/settings/profile" aria-label="Settings"><Icons.Settings size={18} /></NavLink>
            </div>
          </div>
        </aside>

        <header className="header">
          <button ref={mobileMenuButton} className="icon-btn mobile-menu" onClick={() => setMobile(!mobile)} aria-label="Open menu"><Icons.Menu size={20} /></button>
          <h1 className="page-title">{label}</h1>
          <div className="header-actions">
            <button ref={searchButton} className="search-trigger" onClick={() => setSearch(true)} aria-label="Search workspace"><Icons.Search size={16} /><span>Search workspace…</span><kbd>⌘K</kbd></button>
            <button className="icon-btn" onClick={() => setAiPanel(!aiPanel)} aria-label="AI Assistant" title="AI Assistant"><Icons.Sparkles size={18} /></button>
            <div style={{ position: "relative" }}>
              <button className="icon-btn" onClick={() => setNotificationMenu(!notificationMenu)} aria-label={unreadCount ? `Notifications, ${unreadCount} unread` : "Notifications"} title="Notifications" aria-haspopup="dialog" aria-expanded={notificationMenu}>
                <Icons.Bell size={18} />
                {unreadCount > 0 && <span className="notification-badge" />}
              </button>
              {notificationMenu && (
                <section ref={notificationMenuRef} className="card header-notifications" role="dialog" aria-modal="false" aria-labelledby="header-notifications-title">
                  <header>
                    <h2 id="header-notifications-title">Notifications</h2>
                    <button className="btn text-btn" onClick={markAllNotificationsRead}>Mark all read</button>
                  </header>
                  <div className="header-notification-list">
                    {recentNotifications.map((n: any) => {
                      const Icon = n.type === "risk" ? Icons.Activity : n.type === "mention" ? Icons.AtSign : Icons.Ticket;
                      return (
                        <a className={cx("header-notification-item", !n.readAt && "unread")} key={n._id} href={n.href || "/notifications"} onClick={() => { void markNotificationRead(n); setNotificationMenu(false); }}>
                          <span className={cx("header-notif-icon", n.type)}><Icon size={14} /></span>
                          <div>
                            <b>{n.title}</b>
                            <p>{n.body}</p>
                            <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString()}>{new Date(n.createdAt).toLocaleDateString()}</time>
                          </div>
                        </a>
                      );
                    })}
                    {!recentNotifications.length && <div className="notifications-empty"><Icons.CheckCircle size={28} /><b>All caught up</b><span>You have no notifications.</span></div>}
                  </div>
                  <footer className="header-notifications-footer">
                    <button className="btn primary wide" onClick={() => { setNotificationMenu(false); navigate("/notifications"); }}>View all notifications <Icons.ArrowRight /></button>
                  </footer>
                </section>
              )}
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>{children}</main>

        {selectedInvitation && (
          <div className="modal-wrap" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedInvitation(null)}>
            <section className="card invite-review" role="dialog" aria-modal="true" aria-labelledby="invite-review-title">
              <button className="icon-btn modal-close" onClick={() => setSelectedInvitation(null)} aria-label="Close invitation"><Icons.X /></button>
              <Badge tone="blue">WORKSPACE INVITATION</Badge>
              <h2 id="invite-review-title">Join {selectedInvitation.organization?.name}</h2>
              <p>{selectedInvitation.invitedBy?.name || "A workspace admin"} invited you to collaborate as <b>{fmt(selectedInvitation.role)}</b>.</p>
              <div className="invite-summary">
                <span>Workspace <b>{selectedInvitation.organization?.name}</b></span>
                <span>Role <b>{fmt(selectedInvitation.role)}</b></span>
                <span>Email <b>{selectedInvitation.email}</b></span>
              </div>
              <div className="form-actions">
                <button className="btn" onClick={() => setSelectedInvitation(null)}>Not now</button>
                <button className="btn primary" onClick={acceptPendingInvitation}>Accept and open workspace</button>
              </div>
            </section>
          </div>
        )}

        <nav className="bottom-nav" aria-label="Mobile navigation">
          {[
            ["/dashboard", "House", "Home"],
            ["/projects", "FolderKanban", "Projects"],
            ["/my-work", "CircleUserRound", "Work"],
            ["/reports", "ChartNoAxesCombined", "Reports"],
            ["/settings", "Menu", "More"],
          ].map(([p, i, l]) => {
            const Icon = (Icons as any)[i];
            return (
              <NavLink to={p} key={p}>
                <Icon />
                <span>{l}</span>
              </NavLink>
            );
          })}
        </nav>

        {mobile && <button className="scrim" onClick={() => { setMobile(false); mobileMenuButton.current?.focus(); }} aria-label="Close navigation" />}
        {search && <Command close={() => { setSearch(false); requestAnimationFrame(() => searchButton.current?.focus()); }} navigate={navigate} />}
        {(effectiveRole === "admin" || effectiveRole === "manager") && (
          <button className="fab" onClick={() => navigate("/tickets/new")} aria-label="Create ticket" title="Create ticket"><Icons.Plus /></button>
        )}
        <AiAgentPanel open={aiPanel} onClose={() => setAiPanel(false)} />
      </div>
    </AiAgentProvider>
  );
}
