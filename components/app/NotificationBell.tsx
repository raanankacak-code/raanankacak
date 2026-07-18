"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api-client";
import { BellIcon } from "@/components/app/icons";

type Notification = {
  id: string;
  type: string;
  title: string;
  description: string | null;
  read: boolean;
  createdAt: string;
};

const NTF_ICON: Record<string, string> = {
  report: "🗒️",
  request: "✅",
  attendance: "👷",
  project: "🏗️",
  invite: "✉️",
  document: "📄",
  deadline: "⏰",
};

function timeAgo(iso: string) {
  const d = new Date(iso);
  const diffMin = Math.round((Date.now() - d.getTime()) / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.round(diffH / 24);
  return `${diffD}d ago`;
}

export default function NotificationBell({ compact }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [unread, setUnread] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await apiFetch<{ notifications: Notification[]; unread: number }>("/api/notifications");
      setItems(data.notifications);
      setUnread(data.unread);
    } catch {
      // notifications are non-critical; ignore fetch failures
    }
  }

  useEffect(() => {
    queueMicrotask(load);
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  async function markRead(id: string) {
    setItems((its) => its.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnread((u) => Math.max(0, u - 1));
    await apiFetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function markAllRead() {
    setItems((its) => its.map((n) => ({ ...n, read: true })));
    setUnread(0);
    await apiFetch("/api/notifications", { method: "PATCH" }).catch(() => {});
  }

  const list = items.slice(0, 6);

  return (
    <div ref={rootRef} style={{ position: "relative", flex: compact ? "none" : undefined, marginLeft: compact ? 0 : "auto" }}>
      <button
        className="bell"
        style={compact ? { marginLeft: 0 } : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
      >
        <BellIcon />
        <span className="bell-n" hidden={!unread}>
          {unread > 9 ? "9+" : unread}
        </span>
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="ntf-h">
            <h3>Notifications</h3>
            {unread > 0 && (
              <span className="badge b-amber">
                <span className="dot" />
                {unread} unread
              </span>
            )}
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: "auto" }} onClick={markAllRead} disabled={!unread}>
              Mark all read
            </button>
          </div>
          {list.length ? (
            list.map((n) => (
              <div
                key={n.id}
                className={`ntf${n.read ? "" : " unread"}`}
                style={{ cursor: "pointer" }}
                onClick={() => markRead(n.id)}
              >
                <div className="ntf-ic">{NTF_ICON[n.type] || "🔔"}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="ntf-t">
                    {n.title}
                    {!n.read && <span className="ntf-dot" title="Unread" />}
                  </div>
                  <div className="ntf-d">{n.description}</div>
                  <div className="ntf-m">{timeAgo(n.createdAt)}</div>
                </div>
              </div>
            ))
          ) : (
            <div className="empty" style={{ padding: "30px 16px" }}>
              <div className="e-ic">🔔</div>
              <div className="e-t">All caught up</div>
              <p>No notifications yet — activity from your sites will show up here.</p>
            </div>
          )}
          <div className="ntf-h" style={{ borderTop: "1px solid var(--line)", borderBottom: 0, position: "static" }}>
            <button
              className="btn btn-sm"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
