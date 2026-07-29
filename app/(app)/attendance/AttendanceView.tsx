"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type Project = { id: string; name: string };
type Worker = {
  id: string;
  name: string;
  trade: string | null;
  cidbNumber: string | null;
  cidbExpiry: string | null;
};
type AttendanceRecord = {
  workerId: string;
  status: "PRESENT" | "HALF_DAY" | "ABSENT";
  timeIn: string | null;
  timeOut: string | null;
};

type RowState = { status: AttendanceRecord["status"] | null; timeIn: string; timeOut: string };

type MonthlyRow = {
  id: string;
  name: string;
  trade: string | null;
  icNumber: string | null;
  dailyRate: number | null;
  cidbNumber: string | null;
  cidbExpiry: string | null;
  daysWorked: number;
  wages: number;
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}
function formatRM(n: number) {
  return new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(n);
}
function csvEscape(v: string) {
  return `"${v.replace(/"/g, '""')}"`;
}

export default function AttendanceView({ canEdit, canManageWorkers }: { canEdit: boolean; canManageWorkers: boolean }) {
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get("projectId") || "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(presetProjectId);
  const [date, setDate] = useState(todayISO());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [now] = useState(() => Date.now());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [mode, setMode] = useState<"daily" | "monthly">("daily");
  const [month, setMonth] = useState(currentMonth());
  const [monthlyProjectId, setMonthlyProjectId] = useState("all");
  const [monthlyRows, setMonthlyRows] = useState<MonthlyRow[]>([]);
  const [monthlyTotal, setMonthlyTotal] = useState(0);
  const [monthlyLoading, setMonthlyLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/projects").then((d) => {
      setProjects(d.projects);
      if (!presetProjectId && d.projects[0]) setProjectId(d.projects[0].id);
    });
  }, [presetProjectId]);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiFetch<{ workers: Worker[]; records: AttendanceRecord[] }>(
        `/api/attendance?projectId=${projectId}&date=${date}`,
      );
      setWorkers(data.workers);
      const next: Record<string, RowState> = {};
      for (const w of data.workers) {
        const rec = data.records.find((r) => r.workerId === w.id);
        next[w.id] = {
          status: rec?.status ?? null,
          timeIn: rec?.timeIn ?? "07:30",
          timeOut: rec?.timeOut ?? "17:30",
        };
      }
      setRows(next);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load attendance.");
    } finally {
      setLoading(false);
    }
  }, [projectId, date]);

  useEffect(() => {
    // Deferred so the effect body itself never synchronously triggers a
    // state update (load() sets loading state before its first await).
    queueMicrotask(load);
  }, [load]);

  const loadMonthly = useCallback(async () => {
    setMonthlyLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ month });
      if (monthlyProjectId !== "all") params.set("projectId", monthlyProjectId);
      const data = await apiFetch<{ rows: MonthlyRow[]; totalWages: number }>(`/api/attendance/monthly?${params}`);
      setMonthlyRows(data.rows);
      setMonthlyTotal(data.totalWages);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load monthly summary.");
    } finally {
      setMonthlyLoading(false);
    }
  }, [month, monthlyProjectId]);

  useEffect(() => {
    if (mode === "monthly") queueMicrotask(loadMonthly);
  }, [mode, loadMonthly]);

  function exportCSV() {
    let csv = "Worker,IC/Passport,Trade,Rate (RM/day),Days,Wages (RM)\n";
    for (const r of monthlyRows) {
      csv += [csvEscape(r.name), csvEscape(r.icNumber || ""), csvEscape(r.trade || ""), r.dailyRate ?? 0, r.daysWorked, r.wages].join(",") + "\n";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `attendance-${month}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function setStatus(workerId: string, status: RowState["status"]) {
    setRows((r) => ({ ...r, [workerId]: { ...r[workerId], status } }));
  }
  function setTime(workerId: string, key: "timeIn" | "timeOut", value: string) {
    setRows((r) => ({ ...r, [workerId]: { ...r[workerId], [key]: value } }));
  }
  function markAllPresent() {
    setRows((r) => {
      const next = { ...r };
      for (const w of workers) next[w.id] = { ...next[w.id], status: "PRESENT" };
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError("");
    try {
      const records = workers
        .filter((w) => rows[w.id]?.status)
        .map((w) => ({
          workerId: w.id,
          status: rows[w.id].status as AttendanceRecord["status"],
          timeIn: rows[w.id].timeIn || undefined,
          timeOut: rows[w.id].timeOut || undefined,
        }));
      await apiFetch("/api/attendance", {
        method: "PUT",
        body: JSON.stringify({ projectId, date, records }),
      });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save attendance.");
    } finally {
      setSaving(false);
    }
  }

  const markedCount = Object.values(rows).filter((r) => r.status).length;
  const presentCount = Object.values(rows).filter((r) => r.status === "PRESENT").length;

  return (
    <>
      <div className="topbar">
        <h2>Attendance</h2>
        <div className="top-actions">
          <div className="seg">
            <button type="button" className={mode === "daily" ? "on" : ""} onClick={() => setMode("daily")}>
              Daily check-in
            </button>
            <button type="button" className={mode === "monthly" ? "on" : ""} onClick={() => setMode("monthly")}>
              Monthly summary
            </button>
          </div>
        </div>
        <div className="sub">Daily check-in from site, wages calculated for you.</div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      {mode === "monthly" ? (
        <>
          <div className="filters">
            <select aria-label="Filter by project" className="proj-select" value={monthlyProjectId} onChange={(e) => setMonthlyProjectId(e.target.value)}>
              <option value="all">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input aria-label="Summary month" type="month" value={month} max={currentMonth()} onChange={(e) => setMonth(e.target.value)} />
            <button className="btn" type="button" onClick={exportCSV} disabled={monthlyRows.length === 0}>
              ⬇ Export CSV
            </button>
            <span className="small mut" style={{ alignSelf: "center" }}>
              Payroll this month: <b className="num" style={{ color: "var(--amber-text)" }}>{formatRM(monthlyTotal)}</b>
            </span>
          </div>
          <div className="card">
            {monthlyLoading ? (
              <div className="card-b">
                <p className="mut small">Loading…</p>
              </div>
            ) : monthlyRows.length === 0 ? (
              <div className="empty">
                <div className="e-ic">👷</div>
                <div className="e-t">No workers</div>
                <p>No active workers match this filter.</p>
              </div>
            ) : (
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Worker</th>
                      <th>Trade</th>
                      <th>Rate/day</th>
                      <th>Days worked</th>
                      <th>Wages</th>
                      <th>Green card</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyRows.map((r) => {
                      const expSoon = r.cidbExpiry && r.cidbExpiry <= new Date(now + 30 * 86400000).toISOString().slice(0, 10);
                      return (
                        <tr key={r.id}>
                          <td>
                            <b>{r.name}</b>
                            <div className="small faint num">{r.icNumber || "—"}</div>
                          </td>
                          <td className="small">{r.trade || "—"}</td>
                          <td className="num">{formatRM(r.dailyRate ?? 0)}</td>
                          <td className="num">{r.daysWorked}</td>
                          <td className="num">
                            <b>{formatRM(r.wages)}</b>
                          </td>
                          <td>
                            {r.cidbExpiry ? (
                              expSoon ? (
                                <span className="badge b-bad">
                                  <i className="dot" />
                                  exp {new Date(r.cidbExpiry).toLocaleDateString("en-GB")}
                                </span>
                              ) : (
                                <span className="small faint">ok · {new Date(r.cidbExpiry).toLocaleDateString("en-GB")}</span>
                              )
                            ) : (
                              <span className="small faint">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <div className="filters">
            <select aria-label="Project" className="proj-select" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <input aria-label="Attendance date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            {canEdit && (
              <button className="btn" type="button" onClick={markAllPresent} disabled={workers.length === 0}>
                Mark all present
              </button>
            )}
            {canManageWorkers && projectId && (
              <Link href={`/projects/${projectId}/workers/new`} className="btn">
                ＋ Add worker
              </Link>
            )}
            <span className="small mut" style={{ alignSelf: "center" }}>
              Marked {markedCount}/{workers.length} · on site {presentCount}
            </span>
          </div>

      <div className="card">
        {loading ? (
          <div className="card-b">
            <p className="mut small">Loading…</p>
          </div>
        ) : workers.length === 0 ? (
          <div className="empty">
            <div className="e-ic">👷</div>
            <div className="e-t">No workers on this project</div>
            <p>Add workers to the project roster before taking attendance.</p>
            {canManageWorkers && projectId ? (
              <Link href={`/projects/${projectId}/workers/new`} className="btn btn-amber">
                ＋ Add worker
              </Link>
            ) : (
              <span className="small faint">Ask a Project Manager or the Owner to add workers.</span>
            )}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Worker</th>
                  <th>CIDB Green Card</th>
                  <th>Status</th>
                  <th>Time in</th>
                  <th>Time out</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((w) => {
                  const row = rows[w.id] ?? { status: null, timeIn: "07:30", timeOut: "17:30" };
                  const expiry = w.cidbExpiry ? new Date(w.cidbExpiry) : null;
                  const expDays = expiry && now ? Math.round((expiry.getTime() - now) / 86400000) : null;
                  return (
                    <tr key={w.id}>
                      <td>
                        <b>{w.name}</b>
                        <div className="small mut">{w.trade || "—"}</div>
                      </td>
                      <td>
                        {w.cidbNumber ? (
                          <>
                            <div className="small mono">{w.cidbNumber}</div>
                            {expDays !== null && expDays < 0 && (
                              <span className="badge b-bad"><i className="dot" />Expired</span>
                            )}
                            {expDays !== null && expDays >= 0 && expDays <= 30 && (
                              <span className="badge b-amber"><i className="dot" />Exp soon</span>
                            )}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        <div className="att-status">
                          <button
                            type="button"
                            className={`p${row.status === "PRESENT" ? " on" : ""}`}
                            disabled={!canEdit}
                            onClick={() => setStatus(w.id, "PRESENT")}
                          >
                            P
                          </button>
                          <button
                            type="button"
                            className={`h${row.status === "HALF_DAY" ? " on" : ""}`}
                            disabled={!canEdit}
                            onClick={() => setStatus(w.id, "HALF_DAY")}
                          >
                            ½
                          </button>
                          <button
                            type="button"
                            className={`a${row.status === "ABSENT" ? " on" : ""}`}
                            disabled={!canEdit}
                            onClick={() => setStatus(w.id, "ABSENT")}
                          >
                            A
                          </button>
                        </div>
                      </td>
                      <td>
                        <input
                          // One input per worker per column: the column
                          // header alone does not say whose row this is.
                          aria-label={`Time in for ${w.name}`}
                          className="tm"
                          type="time"
                          value={row.timeIn}
                          disabled={!canEdit}
                          onChange={(e) => setTime(w.id, "timeIn", e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          aria-label={`Time out for ${w.name}`}
                          className="tm"
                          type="time"
                          value={row.timeOut}
                          disabled={!canEdit}
                          onChange={(e) => setTime(w.id, "timeOut", e.target.value)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {canEdit && workers.length > 0 && (
          <div className="modal-f" style={{ borderTop: "1px solid var(--line)" }}>
            <button className="btn btn-amber" type="button" onClick={handleSave} disabled={saving}>
              {saving ? "Saving…" : "Save attendance"}
            </button>
          </div>
        )}
      </div>
        </>
      )}
    </>
  );
}
