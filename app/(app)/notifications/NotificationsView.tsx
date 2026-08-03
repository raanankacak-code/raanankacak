"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { todayInOrgTimezone as todayISO, daysAgoInOrgTimezone as daysAgo } from "@/lib/today";

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


function timeLabel(iso: string) {
  const d = iso.slice(0, 10);
  const t = new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (d === todayISO()) return `Today · ${t}`;
  if (d === daysAgo(1)) return `Yesterday · ${t}`;
  return `${new Date(iso).toLocaleDateString()} · ${t}`;
}

function Row({ n, onRead, onDelete }: { n: Notification; onRead: () => void; onDelete: () => void }) {
  return (
    <div className={`ntf${n.read ? "" : " unread"}`}>
      <div className="ntf-ic">{NTF_ICON[n.type] || "🔔"}</div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="ntf-t">
          {n.title}
          {!n.read && <span className="ntf-dot" title="Unread" />}
        </div>
        <div className="ntf-d">{n.description}</div>
        <div className="ntf-m">{timeLabel(n.createdAt)}</div>
      </div>
      <div className="ntf-a">
        {!n.read && (
          <button className="btn btn-ghost btn-sm" title="Mark as read" aria-label={`Mark notification as read: ${n.title}`} onClick={onRead}>
            ✓
          </button>
        )}
        <button className="btn btn-ghost btn-sm" title="Delete" aria-label={`Delete notification: ${n.title}`} onClick={onDelete}>
          ✕
        </button>
      </div>
    </div>
  );
}

export default function NotificationsView() {
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ notifications: Notification[] }>("/api/notifications");
      setItems(data.notifications);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  async function markRead(id: string) {
    setItems((its) => its.map((n) => (n.id === id ? { ...n, read: true } : n)));
    await apiFetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => {});
  }

  async function remove(id: string) {
    setItems((its) => its.filter((n) => n.id !== id));
    await apiFetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => {});
  }

  async function markAllRead() {
    setItems((its) => its.map((n) => ({ ...n, read: true })));
    await apiFetch("/api/notifications", { method: "PATCH" }).catch(() => {});
  }

  const unread = items.filter((n) => !n.read).length;
  const groups: [string, Notification[]][] = (
    [
      ["Today", items.filter((n) => n.createdAt.slice(0, 10) === todayISO())],
      ["Yesterday", items.filter((n) => n.createdAt.slice(0, 10) === daysAgo(1))],
      ["This Week", items.filter((n) => { const d = n.createdAt.slice(0, 10); return d !== todayISO() && d !== daysAgo(1) && d >= daysAgo(6); })],
      ["Older", items.filter((n) => n.createdAt.slice(0, 10) < daysAgo(6))],
    ] as [string, Notification[]][]
  ).filter(([, arr]) => arr.length > 0);

  return (
    <>
      <div className="topbar">
        <h2>Notifications</h2>
        <div className="top-actions">
          <button className="btn" onClick={markAllRead} disabled={!unread}>
            Mark All Read
          </button>
          <Link href="/dashboard" className="btn btn-ghost">
            ← Back
          </Link>
        </div>
        <div className="sub">
          Everything happening across your workspace — {unread ? `${unread} unread of ` : ""}
          {items.length} total.
        </div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      {loading ? (
        <p className="mut small">Loading…</p>
      ) : items.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-ic">🔔</div>
            <div className="e-t">No notifications</div>
            <p>You&rsquo;re all caught up. Daily reports, approvals, uploads and deadlines will appear here as they happen.</p>
            <Link href="/dashboard" className="btn">
              Back to Dashboard
            </Link>
          </div>
        </div>
      ) : (
        groups.map(([label, arr]) => (
          <div className="card" style={{ marginBottom: 14 }} key={label}>
            <div className="card-h">
              <h3>{label}</h3>
              <span className="right small faint">
                {arr.length} notification{arr.length === 1 ? "" : "s"}
              </span>
            </div>
            <div>
              {arr.map((n) => (
                <Row key={n.id} n={n} onRead={() => markRead(n.id)} onDelete={() => remove(n.id)} />
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
