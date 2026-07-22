"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";

type Row = {
  id: string;
  name: string;
  siteAddress: string | null;
  client: string | null;
  contractValue: number | null;
  startDate: string | null;
  endDate: string | null;
  progressPct: number;
  status: string;
  workerCount: number;
};

type SortKey = "name" | "client" | "value" | "start" | "progress" | "status" | "workers";

const STATUSES = ["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED"];

export default function ProjectsView({
  rows,
  canEdit,
  canDelete,
  summary,
}: {
  rows: Row[];
  canEdit: boolean;
  canDelete: boolean;
  summary: string;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [localRows, setLocalRows] = useState(rows);

  function onSort(key: SortKey) {
    setSort((s) => toggleSort(s, key));
  }

  function valueOf(p: Row, key: SortKey): string | number {
    switch (key) {
      case "name":
        return p.name;
      case "client":
        return p.client || "";
      case "value":
        return p.contractValue || 0;
      case "start":
        return p.startDate || "";
      case "progress":
        return p.progressPct;
      case "status":
        return p.status;
      case "workers":
        return p.workerCount;
    }
  }

  const filtered = useMemo(() => {
    let list = localRows;
    if (status !== "all") list = list.filter((p) => p.status === status);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => `${p.name} ${p.siteAddress || ""} ${p.client || ""}`.toLowerCase().includes(q));
    return sortRows(list, sort, valueOf);
  }, [localRows, search, status, sort]);

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Delete "${name}"? This removes its reports, attendance and worker roster too.`)) return;
    setDeletingId(id);
    try {
      await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
      setLocalRows((rs) => rs.filter((r) => r.id !== id));
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setDeletingId(null);
    }
  }

  const hasFilters = search.trim() !== "" || status !== "all";

  return (
    <>
      <div className="topbar">
        <h2>Projects</h2>
        {canEdit && (
          <div className="top-actions">
            <Link href="/projects/new" className="btn btn-amber">
              + New project
            </Link>
          </div>
        )}
        <div className="sub">{summary}</div>
      </div>

      {rows.length > 0 && (
        <div className="filters">
          <input placeholder="Search name, site or client…" value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 230 }} />
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
          {hasFilters && (
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}

      <div className="card">
        {localRows.length === 0 ? (
          <div className="empty">
            <div className="e-ic">▤</div>
            <div className="e-t">No projects yet</div>
            <p>Create your first project to start tracking daily reports and attendance.</p>
            {canEdit && (
              <Link href="/projects/new" className="btn btn-amber">
                + New project
              </Link>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🔍</div>
            <div className="e-t">No projects match</div>
            <p>
              Nothing matches &ldquo;{search}&rdquo;
              {status !== "all" ? ` with status ${statusLabel(status)}` : ""}. Try different keywords or clear the filters.
            </p>
            <button
              className="btn"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <SortableTh label="Project" sortKey="name" sort={sort} onSort={onSort} />
                  <SortableTh label="Client" sortKey="client" sort={sort} onSort={onSort} />
                  <SortableTh label="Contract value" sortKey="value" sort={sort} onSort={onSort} numeric />
                  <SortableTh label="Duration" sortKey="start" sort={sort} onSort={onSort} />
                  <SortableTh label="Progress" sortKey="progress" sort={sort} onSort={onSort} numeric />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={onSort} />
                  <SortableTh label="Workers" sortKey="workers" sort={sort} onSort={onSort} numeric />
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="rowlink" onClick={() => router.push(`/projects/${p.id}`)}>
                    <td style={{ minWidth: 220 }}>
                      <b>{p.name}</b>
                      <div className="small faint">{p.siteAddress || "—"}</div>
                    </td>
                    <td className="small">{p.client || "—"}</td>
                    <td className="num">{formatCurrency(p.contractValue)}</td>
                    <td className="num small">
                      {formatDate(p.startDate)} → {formatDate(p.endDate)}
                    </td>
                    <td style={{ minWidth: 130 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 7, borderRadius: 99, background: "var(--panel2)", border: "1px solid var(--line2)", overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${p.progressPct}%`, background: "linear-gradient(90deg,var(--amber-deep),var(--amber))" }} />
                        </div>
                        <span className="num small">{p.progressPct}%</span>
                      </div>
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(p.status)}`}>
                        <i className="dot" />
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="num">{p.workerCount}</td>
                    <td style={{ whiteSpace: "nowrap" }} onClick={(e) => e.stopPropagation()}>
                      {canEdit || canDelete ? (
                        <>
                          {canEdit && (
                            <Link href={`/projects/${p.id}/edit`} className="btn btn-ghost btn-sm" aria-label={`Edit ${p.name}`}>
                              Edit
                            </Link>
                          )}
                          {canDelete && (
                            <button
                              className="btn btn-danger btn-sm"
                              type="button"
                              disabled={deletingId === p.id}
                              onClick={() => handleDelete(p.id, p.name)}
                              aria-label={`Delete ${p.name}`}
                            >
                              Delete
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="small faint">View →</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
