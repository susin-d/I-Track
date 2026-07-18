import React, { useState } from "react";
import * as Icons from "lucide-react";
import { useWorkspace } from "../workspace";
import { api } from "../../api";
import { Badge, PageHead, Empty } from "../components/ui";

function notificationTitle(title: string) {
  return title.replace(/^ticket ticket\b/i, "Ticket");
}

function notificationTime(value: string) {
  const date = new Date(value);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  return new Intl.DateTimeFormat(undefined, {
    ...(sameDay
      ? {}
      : { month: "short" as const, day: "numeric" as const, year: date.getFullYear() === today.getFullYear() ? undefined : "numeric" as const }),
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function Notifications({ toast }: { toast: (s: string) => void }) {
  const { notifications = [], mutate } = useWorkspace();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const markAll = async () => {
    setMarkingAll(true);
    try {
      await mutate(() => api("/notifications/read-all", { method: "POST" }));
      toast("All notifications marked as read");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to mark all read");
    } finally {
      setMarkingAll(false);
    }
  };

  const markRead = async (id: string) => {
    setMarkingId(id);
    try {
      await mutate(() => api(`/notifications/${id}/read`, { method: "PATCH" }));
      toast("Notification marked read");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Failed to mark notification read");
    } finally {
      setMarkingId(null);
    }
  };

  const displayList = notifications.filter(
    (item: any) => !unreadOnly || !item.readAt,
  );
  const unreadCount = notifications.filter((item: any) => !item.readAt).length;

  return (
    <div className="notifications-page">
      <PageHead title="Notifications" desc="Updates that need your attention.">
        <button
          className="btn"
          onClick={markAll}
          disabled={!unreadCount || markingAll}
          aria-busy={markingAll}
        >
          <Icons.CheckCheck />
          {markingAll ? "Marking read…" : "Mark all as read"}
        </button>
      </PageHead>
      <div className="notification-toolbar">
        <div className="notification-tabs" role="tablist" aria-label="Notification filters">
          <button
            type="button"
            role="tab"
            aria-selected={!unreadOnly}
            className={!unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(false)}
          >
            All <Badge tone="purple">{notifications.length}</Badge>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={unreadOnly}
            className={unreadOnly ? "active" : ""}
            onClick={() => setUnreadOnly(true)}
          >
            Unread
            <Badge tone={unreadCount > 0 ? "orange" : "neutral"}>
              {unreadCount}
            </Badge>
          </button>
        </div>
        <span className="notification-summary">
          {unreadCount ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "You're all caught up"}
        </span>
      </div>
      <section className="card notification-list">
        {displayList.length ? (
          displayList.map((item: any) => {
            const Icon =
              item.type === "risk"
                ? Icons.Activity
                : item.type === "mention"
                  ? Icons.AtSign
                  : item.type === "webhook"
                    ? Icons.Webhook
                    : Icons.Ticket;
            const title = notificationTitle(item.title);
            const content = (
              <div className="notification-main">
                <span className={`notif-icon ${item.type}`}>
                  <Icon />
                </span>
                <div className="notification-copy">
                  <div className="notification-title">
                    <b>{title}</b>
                    {!item.readAt && <span className="unread-label">New</span>}
                  </div>
                  <p>{item.body}</p>
                  <time dateTime={item.createdAt} title={new Date(item.createdAt).toLocaleString()}>
                    <Icons.Clock3 aria-hidden="true" />
                    {notificationTime(item.createdAt)}
                  </time>
                </div>
              </div>
            );
            return (
              <article className={!item.readAt ? "unread notification-item" : "notification-item"} key={item._id}>
                {item.href ? (
                  <a href={item.href} onClick={() => { if (!item.readAt) void markRead(item._id); }}>
                    {content}
                  </a>
                ) : (
                  <div className="notification-content">{content}</div>
                )}
                {!item.readAt && (
                  <button
                    className="icon-btn notification-read-button"
                    aria-label={`Mark ${title} as read`}
                    title="Mark as read"
                    disabled={markingId === item._id}
                    onClick={() => { void markRead(item._id); }}
                  >
                    <Icons.Check />
                  </button>
                )}
              </article>
            );
          })
        ) : (
          <Empty title="No notifications" body="You're all caught up." />
        )}
      </section>
    </div>
  );
}
