"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import Modal from "@/components/app/Modal";

type EventType = "DEADLINE" | "DELIVERY" | "INSPECTION" | "MEETING" | "LEAVE" | "HOLIDAY";
type Priority = "LOW" | "MEDIUM" | "HIGH";
type EvStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

type Project = { id: string; name: string };
type CalEvent = {
  id: string;
  projectId: string | null;
  type: EventType;
  title: string;
  date: string;
  time: string | null;
  endTime: string | null;
  priority: Priority;
  status: EvStatus;
  location: string | null;
  withWho: string | null;
  description: string | null;
};

const EV_TYPES: Record<EventType, { label: string; c: string; ic: string }> = {
  DEADLINE: { label: "Project Deadline", c: "#FF6161", ic: "🏁" },
  DELIVERY: { label: "Material Delivery", c: "#FFB020", ic: "🚚" },
  INSPECTION: { label: "Safety Inspection", c: "#4FD8C8", ic: "🦺" },
  MEETING: { label: "Site Meeting", c: "#5EA8FF", ic: "📅" },
  LEAVE: { label: "Worker Leave", c: "#C9A7FF", ic: "🌴" },
  HOLIDAY: { label: "Public Holiday", c: "#3ECF8E", ic: "🎉" },
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}
function pad(n: number) {
  return String(n).padStart(2, "0");
}

function effStatus(e: CalEvent): EvStatus | "OVERDUE" {
  return e.status === "SCHEDULED" && e.date < todayISO() ? "OVERDUE" : e.status;
}

function projName(projects: Project[], id: string | null) {
  if (!id) return "Company-wide";
  return projects.find((p) => p.id === id)?.name ?? "—";
}

export default function CalendarView({ canEdit }: { canEdit: boolean }) {
  const [events, setEvents] = useState<CalEvent[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [view, setView] = useState<"month" | "week" | "day">("month");
  const [date, setDate] = useState(todayISO());
  const [projFilter, setProjFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [prioFilter, setPrioFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [formOpen, setFormOpen] = useState<{ id: string | null; presetDate?: string } | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [e, p] = await Promise.all([
        apiFetch<{ events: CalEvent[] }>("/api/calendar"),
        apiFetch<{ projects: Project[] }>("/api/projects"),
      ]);
      setEvents(e.events);
      setProjects(p.projects);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load calendar.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  const filtered = useMemo(() => {
    return events
      .filter(
        (e) =>
          (projFilter === "all" || e.projectId === projFilter) &&
          (typeFilter === "all" || e.type === typeFilter) &&
          (prioFilter === "all" || e.priority === prioFilter) &&
          (statusFilter === "all" || effStatus(e) === statusFilter),
      )
      .sort((a, b) => (a.date + (a.time || "00:00")).localeCompare(b.date + (b.time || "00:00")));
  }, [events, projFilter, typeFilter, prioFilter, statusFilter]);

  const hasFilters = projFilter !== "all" || typeFilter !== "all" || prioFilter !== "all" || statusFilter !== "all";
  const todayList = filtered.filter((e) => e.date === todayISO());
  const upcoming = filtered.filter((e) => e.date > todayISO() && effStatus(e) === "SCHEDULED").slice(0, 5);
  const overdue = filtered.filter((e) => effStatus(e) === "OVERDUE");

  function shift(dir: number) {
    const d = new Date(date + "T00:00:00");
    if (view === "month") d.setMonth(d.getMonth() + dir);
    else if (view === "week") d.setDate(d.getDate() + 7 * dir);
    else d.setDate(d.getDate() + dir);
    setDate(iso(d));
  }

  function goDay(dISO: string) {
    setDate(dISO);
    setView("day");
  }

  const d = new Date(date + "T00:00:00");
  const label =
    view === "month"
      ? d.toLocaleString("en-MY", { month: "long", year: "numeric" })
      : view === "week"
        ? (() => {
            const s = new Date(d);
            s.setDate(s.getDate() - s.getDay());
            const e2 = new Date(s);
            e2.setDate(e2.getDate() + 6);
            return `${formatDate(iso(s))} – ${formatDate(iso(e2))}`;
          })()
        : `${d.toLocaleString("en-MY", { weekday: "long" })}, ${formatDate(date)}`;

  return (
    <>
      <div className="topbar">
        <h2>Calendar</h2>
        <div className="top-actions">
          {canEdit && (
            <button className="btn btn-amber" onClick={() => setFormOpen({ id: null })}>
              ＋ Add Event
            </button>
          )}
          <div className="seg">
            <button className={view === "month" ? "on" : ""} onClick={() => setView("month")}>
              Month
            </button>
            <button className={view === "week" ? "on" : ""} onClick={() => setView("week")}>
              Week
            </button>
            <button className={view === "day" ? "on" : ""} onClick={() => setView("day")}>
              Day
            </button>
          </div>
        </div>
        <div className="sub">Deadlines, deliveries, inspections, meetings, leave and holidays.</div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      <div className="filters">
        <select aria-label="Filter by project" value={projFilter} onChange={(e) => setProjFilter(e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select aria-label="Filter by event type" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All event types</option>
          {Object.entries(EV_TYPES).map(([k, t]) => (
            <option key={k} value={k}>
              {t.ic} {t.label}
            </option>
          ))}
        </select>
        <select aria-label="Filter by priority" value={prioFilter} onChange={(e) => setPrioFilter(e.target.value)}>
          <option value="all">All priorities</option>
          <option value="HIGH">High</option>
          <option value="MEDIUM">Medium</option>
          <option value="LOW">Low</option>
        </select>
        <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All statuses</option>
          <option value="SCHEDULED">Scheduled</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
          <option value="OVERDUE">Overdue</option>
        </select>
        {hasFilters && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setProjFilter("all");
              setTypeFilter("all");
              setPrioFilter("all");
              setStatusFilter("all");
            }}
          >
            Clear filters
          </button>
        )}
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-h">
            <h3>{label}</h3>
            <div className="right" style={{ display: "flex", gap: 6 }}>
              <button className="btn btn-sm" onClick={() => shift(-1)} aria-label="Previous">
                ←
              </button>
              <button className="btn btn-sm" onClick={() => setDate(todayISO())}>
                Today
              </button>
              <button className="btn btn-sm" onClick={() => shift(1)} aria-label="Next">
                →
              </button>
            </div>
          </div>
          <div className="card-b">
            {loading ? (
              <p className="mut small">Loading…</p>
            ) : filtered.length === 0 ? (
              <div className="empty">
                <div className="e-ic">📅</div>
                <div className="e-t">No events</div>
                <p>Nothing matches your filters. Clear them, or events from your projects will appear here.</p>
              </div>
            ) : view === "month" ? (
              <MonthGrid date={date} events={filtered} onOpenDay={goDay} onOpenEvent={setDetailId} />
            ) : view === "week" ? (
              <WeekGrid date={date} events={filtered} onOpenDay={goDay} onOpenEvent={setDetailId} />
            ) : (
              <DayAgenda
                date={date}
                events={filtered}
                projects={projects}
                canEdit={canEdit}
                onOpenEvent={setDetailId}
                onAdd={() => setFormOpen({ id: null, presetDate: date })}
              />
            )}
            <div className="cal-legend">
              {Object.values(EV_TYPES).map((t) => (
                <span key={t.label}>
                  <i style={{ background: t.c }} />
                  {t.label}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Today&rsquo;s schedule</h3>
              <span className="right small faint">{formatDate(todayISO())}</span>
            </div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {todayList.length ? (
                todayList.map((e) => <SideRow key={e.id} event={e} projects={projects} onClick={() => setDetailId(e.id)} />)
              ) : (
                <div className="empty" style={{ padding: 18 }}>
                  <div className="e-t">Free day</div>
                  <p>Nothing scheduled for today.</p>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h3>Upcoming events</h3>
              <span className="right small faint">next 5</span>
            </div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {upcoming.length ? (
                upcoming.map((e) => <SideRow key={e.id} event={e} projects={projects} onClick={() => setDetailId(e.id)} />)
              ) : (
                <div className="empty" style={{ padding: 18 }}>
                  <div className="e-t">Nothing upcoming</div>
                  <p>Scheduled events will appear here.</p>
                </div>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h3>Overdue events</h3>
              {overdue.length > 0 && (
                <span className="right badge b-bad">
                  <span className="dot" />
                  {overdue.length}
                </span>
              )}
            </div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {overdue.length ? (
                overdue.map((e) => (
                  <div key={e.id} className="dl-row over" style={{ margin: "0 0 6px", cursor: "pointer" }} onClick={() => setDetailId(e.id)}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <b className="small" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {EV_TYPES[e.type].ic} {e.title}
                      </b>
                      <span className="small faint">{projName(projects, e.projectId)}</span>
                    </div>
                    <div style={{ textAlign: "right", flex: "none" }}>
                      <div className="num small">{formatDate(e.date)}</div>
                      <div className="small" style={{ color: "var(--bad-text)", fontWeight: 700 }}>
                        {Math.round((new Date(todayISO()).getTime() - new Date(e.date).getTime()) / 86400000)}d overdue
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty" style={{ padding: 18 }}>
                  <div className="e-t">Nothing overdue</div>
                  <p>You&rsquo;re on top of everything. 🎯</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {formOpen && (
        <EventFormModal
          eventId={formOpen.id}
          presetDate={formOpen.presetDate}
          projects={projects}
          events={events}
          onClose={() => setFormOpen(null)}
          onSaved={() => {
            setFormOpen(null);
            load();
          }}
        />
      )}

      {detailId && (
        <EventDetailModal
          event={events.find((e) => e.id === detailId) ?? null}
          projects={projects}
          canEdit={canEdit}
          onClose={() => setDetailId(null)}
          onEdit={() => {
            setFormOpen({ id: detailId });
            setDetailId(null);
          }}
          onChanged={() => {
            setDetailId(null);
            load();
          }}
        />
      )}
    </>
  );
}

function EvChip({ event, onClick }: { event: CalEvent; onClick: () => void }) {
  const t = EV_TYPES[event.type];
  const done = effStatus(event) !== "SCHEDULED" && effStatus(event) !== "OVERDUE";
  return (
    <button
      className={`ev${done ? " done" : ""}`}
      style={{ background: `${t.c}18`, borderLeft: `3px solid ${t.c}` }}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      title={`${t.label} — ${event.title}`}
    >
      {event.time && <span className="mono" style={{ opacity: 0.75 }}>{event.time} </span>}
      {t.ic} {event.title}
    </button>
  );
}

function MonthGrid({
  date,
  events,
  onOpenDay,
  onOpenEvent,
}: {
  date: string;
  events: CalEvent[];
  onOpenDay: (d: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  const d = new Date(date + "T00:00:00");
  const y = d.getFullYear();
  const m = d.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const start = new Date(y, m, 1).getDay();
  const prevDim = new Date(y, m, 0).getDate();
  const byDay: Record<string, CalEvent[]> = {};
  events.forEach((e) => {
    (byDay[e.date] = byDay[e.date] || []).push(e);
  });

  const cells: React.ReactNode[] = ["S", "M", "T", "W", "T", "F", "S"].map((x, i) => (
    <div className="dow" key={`dow${i}`}>
      {x}
    </div>
  ));
  for (let i = start - 1; i >= 0; i--) {
    cells.push(
      <div className="cm-cell dim" key={`prev${i}`}>
        <span className="cm-d">{prevDim - i}</span>
      </div>,
    );
  }
  for (let day = 1; day <= dim; day++) {
    const dISO = `${y}-${pad(m + 1)}-${pad(day)}`;
    const list = byDay[dISO] || [];
    cells.push(
      <div className={`cm-cell${dISO === todayISO() ? " today" : ""}`} key={dISO}>
        <button className="cm-d" onClick={() => onOpenDay(dISO)} title="Open day agenda">
          {day}
        </button>
        {list.slice(0, 3).map((e) => (
          <EvChip key={e.id} event={e} onClick={() => onOpenEvent(e.id)} />
        ))}
        {list.length > 3 && (
          <button className="cm-more" onClick={() => onOpenDay(dISO)}>
            +{list.length - 3} more
          </button>
        )}
      </div>,
    );
  }
  const rem = (start + dim) % 7;
  if (rem) {
    for (let i = 1; i <= 7 - rem; i++) {
      cells.push(
        <div className="cm-cell dim" key={`next${i}`}>
          <span className="cm-d">{i}</span>
        </div>,
      );
    }
  }
  return <div className="cm">{cells}</div>;
}

function WeekGrid({
  date,
  events,
  onOpenDay,
  onOpenEvent,
}: {
  date: string;
  events: CalEvent[];
  onOpenDay: (d: string) => void;
  onOpenEvent: (id: string) => void;
}) {
  const d = new Date(date + "T00:00:00");
  d.setDate(d.getDate() - d.getDay());
  const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const cols: React.ReactNode[] = [];
  for (let i = 0; i < 7; i++) {
    const dISO = iso(d);
    const list = events.filter((e) => e.date === dISO);
    cols.push(
      <div className={`wk-col${dISO === todayISO() ? " today" : ""}`} key={dISO}>
        <button className="wk-h" onClick={() => onOpenDay(dISO)}>
          <span>{DOW[i]}</span>
          <b>{d.getDate()}</b>
        </button>
        {list.length ? (
          list.map((e) => <EvChip key={e.id} event={e} onClick={() => onOpenEvent(e.id)} />)
        ) : (
          <span className="small faint" style={{ textAlign: "center", paddingTop: 8 }}>
            —
          </span>
        )}
      </div>,
    );
    d.setDate(d.getDate() + 1);
  }
  return <div className="wk">{cols}</div>;
}

function DayAgenda({
  date,
  events,
  projects,
  canEdit,
  onOpenEvent,
  onAdd,
}: {
  date: string;
  events: CalEvent[];
  projects: Project[];
  canEdit: boolean;
  onOpenEvent: (id: string) => void;
  onAdd: () => void;
}) {
  const list = events.filter((e) => e.date === date);
  if (!list.length) {
    return (
      <div className="empty">
        <div className="e-ic">📅</div>
        <div className="e-t">Nothing scheduled</div>
        <p>No events on {formatDate(date)} matching your filters. Enjoy the quiet — it won&rsquo;t last.</p>
        {canEdit && (
          <button className="btn btn-amber" onClick={onAdd}>
            ＋ Add Event on this date
          </button>
        )}
      </div>
    );
  }
  return (
    <>
      {list.map((e) => {
        const t = EV_TYPES[e.type];
        const s = effStatus(e);
        return (
          <div key={e.id} className="ag-row" onClick={() => onOpenEvent(e.id)}>
            <div className="ag-t">
              {e.time ? (
                <>
                  {e.time}
                  {e.endTime && (
                    <>
                      <br />
                      <span className="faint">{e.endTime}</span>
                    </>
                  )}
                </>
              ) : (
                "All day"
              )}
            </div>
            <div className="ag-bar" style={{ background: t.c }} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <b>{e.title}</b>
                <span
                  className={`badge ${s === "SCHEDULED" ? "b-info" : s === "COMPLETED" ? "b-ok" : s === "CANCELLED" ? "b-mut" : "b-bad"}`}
                >
                  <span className="dot" />
                  {s === "OVERDUE" ? "Overdue" : s.charAt(0) + s.slice(1).toLowerCase()}
                </span>
              </div>
              <div className="small mut">
                {t.ic} {t.label}
                {e.projectId && ` · ${projName(projects, e.projectId)}`}
                {e.location && ` · ${e.location}`}
              </div>
              {e.description && <div className="small faint" style={{ marginTop: 2 }}>{e.description.slice(0, 110)}</div>}
            </div>
            <span className={`badge ${e.priority === "HIGH" ? "b-bad" : e.priority === "MEDIUM" ? "b-amber" : "b-mut"}`}>
              <span className="dot" />
              {e.priority.charAt(0) + e.priority.slice(1).toLowerCase()} priority
            </span>
          </div>
        );
      })}
    </>
  );
}

function SideRow({ event, projects, onClick }: { event: CalEvent; projects: Project[]; onClick: () => void }) {
  const t = EV_TYPES[event.type];
  return (
    <div className="up-row" onClick={onClick}>
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          flex: "none",
          display: "grid",
          placeItems: "center",
          fontSize: 14,
          background: `${t.c}16`,
          border: `1px solid ${t.c}44`,
        }}
      >
        {t.ic}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <b className="small" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {event.title}
        </b>
        <span className="small faint">
          {formatDate(event.date)}
          {event.time ? ` · ${event.time}` : ""}
          {event.projectId ? ` · ${projName(projects, event.projectId)}` : ""}
        </span>
      </div>
    </div>
  );
}

function EventDetailModal({
  event,
  projects,
  canEdit,
  onClose,
  onEdit,
  onChanged,
}: {
  event: CalEvent | null;
  projects: Project[];
  canEdit: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  if (!event) return null;
  const t = EV_TYPES[event.type];
  const s = effStatus(event);

  async function complete() {
    setBusy(true);
    try {
      await apiFetch(`/api/calendar/${event!.id}`, { method: "PATCH", body: JSON.stringify({ status: "COMPLETED" }) });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${event!.title} (${formatDate(event!.date)})?`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/calendar/${event!.id}`, { method: "DELETE" });
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${t.ic} ${event.title}`}
      onClose={onClose}
      footer={
        <>
          {canEdit && s !== "COMPLETED" && (
            <button className="btn btn-amber" disabled={busy} onClick={complete}>
              Mark completed
            </button>
          )}
          {canEdit && (
            <button className="btn" disabled={busy} onClick={onEdit}>
              Edit
            </button>
          )}
          {canEdit && (
            <button className="btn btn-danger" disabled={busy} onClick={remove}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <span className={`badge ${s === "SCHEDULED" ? "b-info" : s === "COMPLETED" ? "b-ok" : s === "CANCELLED" ? "b-mut" : "b-bad"}`}>
          <span className="dot" />
          {s === "OVERDUE" ? "Overdue" : s.charAt(0) + s.slice(1).toLowerCase()}
        </span>
        <span className={`badge ${event.priority === "HIGH" ? "b-bad" : event.priority === "MEDIUM" ? "b-amber" : "b-mut"}`}>
          <span className="dot" />
          {event.priority.charAt(0) + event.priority.slice(1).toLowerCase()} priority
        </span>
      </div>
      <div className="form-grid">
        <div>
          <div className="field-label">Type</div>
          <div>
            {t.ic} {t.label}
          </div>
        </div>
        <div>
          <div className="field-label">Project</div>
          <div>{projName(projects, event.projectId)}</div>
        </div>
        <div>
          <div className="field-label">Date</div>
          <div className="num">{formatDate(event.date)}</div>
        </div>
        <div>
          <div className="field-label">Time</div>
          <div className="num">{event.time ? `${event.time}${event.endTime ? ` – ${event.endTime}` : ""}` : "All day"}</div>
        </div>
        {event.withWho && (
          <div>
            <div className="field-label">Assigned to</div>
            <div>{event.withWho}</div>
          </div>
        )}
        {event.location && (
          <div>
            <div className="field-label">Location</div>
            <div>{event.location}</div>
          </div>
        )}
        {event.description && (
          <div className="full">
            <div className="field-label">Description</div>
            <div>{event.description}</div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function EventFormModal({
  eventId,
  presetDate,
  projects,
  events,
  onClose,
  onSaved,
}: {
  eventId: string | null;
  presetDate?: string;
  projects: Project[];
  events: CalEvent[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const existing = eventId ? events.find((e) => e.id === eventId) ?? null : null;
  const [title, setTitle] = useState(existing?.title ?? "");
  const [projectId, setProjectId] = useState(existing?.projectId ?? "");
  const [type, setType] = useState<EventType>(existing?.type ?? "INSPECTION");
  const [date, setDate] = useState(existing?.date ?? presetDate ?? todayISO());
  const [priority, setPriority] = useState<Priority>(existing?.priority ?? "MEDIUM");
  const [time, setTime] = useState(existing?.time ?? "");
  const [endTime, setEndTime] = useState(existing?.endTime ?? "");
  const [location, setLocation] = useState(existing?.location ?? "");
  const [withWho, setWithWho] = useState(existing?.withWho ?? "");
  const [description, setDescription] = useState(existing?.description ?? "");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setError("");
    if (!title.trim()) return setError("Event title is required.");
    if (!date) return setError("Event date is required.");
    if (time && endTime && endTime <= time) return setError(`End time must be after the start time (${time}).`);
    setSaving(true);
    try {
      const body = {
        type,
        title: title.trim(),
        description: description.trim() || undefined,
        projectId: projectId || null,
        date,
        time: time || undefined,
        endTime: endTime || undefined,
        priority,
        location: location.trim() || undefined,
        withWho: withWho.trim() || undefined,
      };
      if (existing) {
        await apiFetch(`/api/calendar/${existing.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/calendar", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save event.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title={existing ? "Edit Calendar Event" : "Add Calendar Event"}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" disabled={saving} onClick={save}>
            Save Event
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      <div className="form-grid">
        <div className="full">
          <label htmlFor="calendarview-title">Title *</label>
          <input id="calendarview-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. JKKP site safety inspection" />
        </div>
        <div>
          <label htmlFor="calendarview-project">Project</label>
          <select id="calendarview-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">Company-wide</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="calendarview-event-type">Event type</label>
          <select id="calendarview-event-type" value={type} onChange={(e) => setType(e.target.value as EventType)}>
            {Object.entries(EV_TYPES).map(([k, t]) => (
              <option key={k} value={k}>
                {t.ic} {t.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="calendarview-date">Date *</label>
          <input id="calendarview-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="calendarview-priority">Priority</label>
          <select id="calendarview-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
        </div>
        <div>
          <label htmlFor="calendarview-time-empty-all-day">
            Time <span className="faint">(empty = all day)</span>
          </label>
          <input id="calendarview-time-empty-all-day" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="calendarview-end-time-optional">
            End time <span className="faint">(optional)</span>
          </label>
          <input id="calendarview-end-time-optional" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
        </div>
        <div>
          <label htmlFor="calendarview-assigned-to">Assigned to</label>
          <input id="calendarview-assigned-to" value={withWho} onChange={(e) => setWithWho(e.target.value)} placeholder="e.g. Sarah Lim" />
        </div>
        <div>
          <label htmlFor="calendarview-location-optional">
            Location <span className="faint">(optional)</span>
          </label>
          <input id="calendarview-location-optional" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Site cabin, Piasau" />
        </div>
        <div className="full">
          <label htmlFor="calendarview-description-optional">
            Description <span className="faint">(optional)</span>
          </label>
          <textarea id="calendarview-description-optional" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Agenda, scope or notes…" />
        </div>
      </div>
    </Modal>
  );
}
