"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import Modal from "@/components/app/Modal";
import PhotoStrip from "@/components/app/PhotoStrip";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";
import {
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  SEVERITY_BADGE,
  SEVERITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  isOverdue,
} from "@/lib/defects";
import type { Defect, DefectSeverity } from "@/lib/db/types";
import type { DefectListItem } from "@/lib/db/defects";

type SortKey = "code" | "title" | "project" | "severity" | "status" | "assigned" | "due";

/** Sort order for severity is by how bad it is, not alphabetically. */
const SEVERITY_RANK: Record<DefectSeverity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function valueOf(r: DefectListItem, key: SortKey): string | number {
  switch (key) {
    case "code":
      return r.code;
    case "title":
      return r.title;
    case "project":
      return r.project?.name ?? "";
    case "severity":
      return SEVERITY_RANK[r.severity];
    case "status":
      return r.status;
    case "assigned":
      return r.assignedToName ?? "";
    case "due":
      // Undated last, however the column is sorted — a defect with no
      // deadline is not "due first".
      return r.dueDate ?? "9999-99-99";
  }
}

export default function DefectsView({
  rows,
  projects,
  members,
  total,
  offset,
  pageSize,
  selectedProjectId,
  selectedStatus,
  today,
  canRaise,
  canClose,
}: {
  rows: DefectListItem[];
  projects: { id: string; name: string }[];
  members: { id: string; name: string }[];
  total: number;
  offset: number;
  pageSize: number;
  selectedProjectId?: string;
  selectedStatus?: string;
  /** YYYY-MM-DD in the workspace's timezone, decided on the server. */
  today: string;
  canRaise: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<Defect | null>(null);

  const sorted = useMemo(() => sortRows(rows, sort, valueOf), [rows, sort]);

  const firstShown = rows.length === 0 ? 0 : offset + 1;
  const lastShown = offset + rows.length;
  const hasOlder = lastShown < total;

  function hrefWith(next: { status?: string; offset?: number }) {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("projectId", selectedProjectId);
    const status = next.status !== undefined ? next.status : selectedStatus;
    if (status && status !== "all") params.set("status", status);
    if (next.offset && next.offset > 0) params.set("offset", String(next.offset));
    const qs = params.toString();
    return `/defects${qs ? `?${qs}` : ""}`;
  }

  async function openDetail(id: string) {
    try {
      const res = await apiFetch<{ defect: Defect }>(`/api/defects/${id}`);
      setDetail(res.defect);
    } catch {
      // The row is already on screen; failing to expand it is not worth an
      // error banner over the whole page.
    }
  }

  return (
    <>
      <div className="topbar">
        <h2>Defects</h2>
        {canRaise && (
          <div className="top-actions">
            <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
              + Raise defect
            </button>
          </div>
        )}
        <div className="sub">
          Snag lists per project — what was wrong, who is fixing it, and what it looks like now.
          {total > rows.length ? ` Showing ${firstShown}–${lastShown} of ${total}.` : ""}
        </div>
      </div>

      <div className="filters">
        <ProjectFilterSelect projects={projects} selected={selectedProjectId} basePath="/defects" />
        <select
          aria-label="Filter by status"
          value={selectedStatus ?? "all"}
          onChange={(e) => router.push(hrefWith({ status: e.target.value, offset: 0 }))}
        >
          <option value="all">All statuses</option>
          {DEFECT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🔧</div>
            <div className="e-t">{offset > 0 ? "Nothing on this page" : "No defects recorded"}</div>
            <p>
              {offset > 0
                ? `There are ${total} defects in total — go back to see them.`
                : "Raise one from site: what is wrong, where, how bad, and who is fixing it."}
            </p>
            {offset > 0 ? (
              <Link href={hrefWith({ offset: 0 })} className="btn btn-amber">
                Back to the start
              </Link>
            ) : (
              canRaise && (
                <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
                  + Raise defect
                </button>
              )
            )}
          </div>
        ) : (
          <div className="tbl-wrap">
            {/* `cards` — one card per defect below 700px, so severity, due
                date and status survive a phone screen. See globals.css. */}
            <table className="cards">
              <thead>
                <tr>
                  <SortableTh label="Ref" sortKey="code" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Defect" sortKey="title" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Project" sortKey="project" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Severity" sortKey="severity" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Assigned" sortKey="assigned" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Due" sortKey="due" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const overdue = isOverdue(r, today);
                  return (
                    <tr
                      key={r.id}
                      className="rowlink"
                      tabIndex={0}
                      onClick={() => openDetail(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(r.id);
                        }
                      }}
                    >
                      <td className="num" data-label="Ref">{r.code}</td>
                      <td className="card-t">
                        <div style={{ fontWeight: 600 }}>{r.title}</div>
                        {r.location && <div className="small mut">{r.location}</div>}
                      </td>
                      <td data-label="Project">{r.project?.name ?? "—"}</td>
                      <td data-label="Severity">
                        <span className={`badge ${SEVERITY_BADGE[r.severity]}`}>{SEVERITY_LABELS[r.severity]}</span>
                      </td>
                      <td data-label="Assigned">{r.assignedToName ?? <span className="faint">Unassigned</span>}</td>
                      <td className="num" data-label="Due">
                        {r.dueDate ? (
                          // The word, not just a colour: overdue has to
                          // survive a printout and a screen reader.
                          <span style={overdue ? { color: "var(--bad-text)", fontWeight: 700 } : undefined}>
                            {formatDate(r.dueDate)}
                            {overdue && " · overdue"}
                          </span>
                        ) : (
                          <span className="faint">—</span>
                        )}
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${STATUS_BADGE[r.status]}`}>
                          <i className="dot" />
                          {STATUS_LABELS[r.status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(offset > 0 || hasOlder) && (
        <div className="filters">
          {offset > 0 && (
            <Link href={hrefWith({ offset: Math.max(0, offset - pageSize) })} className="btn">
              ← Previous
            </Link>
          )}
          {hasOlder && (
            <Link href={hrefWith({ offset: offset + pageSize })} className="btn">
              Next →
            </Link>
          )}
        </div>
      )}

      {newOpen && (
        <NewDefectModal
          projects={projects}
          members={members}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}

      {detail && (
        <DefectDetailModal
          defect={detail}
          members={members}
          today={today}
          canRaise={canRaise}
          canClose={canClose}
          onClose={() => setDetail(null)}
          onChanged={(next) => {
            setDetail(next);
            router.refresh();
          }}
          onDeleted={() => {
            setDetail(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewDefectModal({
  projects,
  members,
  onClose,
  onSaved,
}: {
  projects: { id: string; name: string }[];
  members: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [severity, setSeverity] = useState<DefectSeverity>("MEDIUM");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (!projectId) return setError("Choose a project.");
    if (title.trim().length < 3) return setError("Describe the defect in a few words.");
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/defects", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          location: location.trim() || undefined,
          description: description.trim() || undefined,
          severity,
          assignedToId: assignedToId || undefined,
          dueDate: dueDate || undefined,
          photos,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not raise the defect.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Raise a defect"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Raise defect"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}

      <div className="fld">
        <label htmlFor="d-project">Project</label>
        <select id="d-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <div className="fld">
        <label htmlFor="d-title">What is wrong</label>
        <input
          id="d-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Cracked tiles in the lobby"
        />
      </div>

      <div className="fld fld-2">
        <div>
          <label htmlFor="d-location">Where</label>
          <input
            id="d-location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g. Blk A, Level 3, Unit 12"
          />
        </div>
        <div>
          <label htmlFor="d-severity">Severity</label>
          <select id="d-severity" value={severity} onChange={(e) => setSeverity(e.target.value as DefectSeverity)}>
            {DEFECT_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="fld fld-2">
        <div>
          <label htmlFor="d-assignee">Assign to</label>
          <select id="d-assignee" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="d-due">Due by</label>
          <input id="d-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>

      <div className="fld">
        <label htmlFor="d-desc">Detail</label>
        <textarea
          id="d-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Anything the person fixing it needs to know."
        />
      </div>

      <div className="fld">
        <div className="field-label">Photos of the problem</div>
        <PhotoStrip label="the defect" photos={photos} onChange={setPhotos} max={12} />
      </div>
    </Modal>
  );
}

function DefectDetailModal({
  defect,
  members,
  today,
  canRaise,
  canClose,
  onClose,
  onChanged,
  onDeleted,
}: {
  defect: Defect;
  members: { id: string; name: string }[];
  today: string;
  canRaise: boolean;
  canClose: boolean;
  onClose: () => void;
  onChanged: (next: Defect) => void;
  onDeleted: () => void;
}) {
  const [resolutionNotes, setResolutionNotes] = useState(defect.resolutionNotes ?? "");
  const [resolutionPhotos, setResolutionPhotos] = useState<string[]>(defect.resolutionPhotos);
  const [assignedToId, setAssignedToId] = useState(defect.assignedToId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const closed = defect.status === "CLOSED";
  const overdue = isOverdue(defect, today);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ defect: Defect }>(`/api/defects/${defect.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      onChanged(res.defect);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the defect.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete defect ${defect.code}? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await apiFetch(`/api/defects/${defect.id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete the defect.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title={`${defect.code} — ${defect.title}`}
      onClose={onClose}
      footer={
        <>
          {canClose && !closed && (
            <button className="btn btn-danger btn-sm" onClick={remove} disabled={saving}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={saving}>
            Close
          </button>
          {canRaise && !closed && defect.status !== "RESOLVED" && (
            <button
              className="btn"
              onClick={() => patch({ status: "IN_PROGRESS" })}
              disabled={saving || defect.status === "IN_PROGRESS"}
            >
              Mark in progress
            </button>
          )}
          {canRaise && !closed && (
            <button
              className="btn btn-amber"
              onClick={() =>
                patch({ status: "RESOLVED", resolutionNotes: resolutionNotes.trim() || null, resolutionPhotos })
              }
              disabled={saving || defect.status === "RESOLVED"}
            >
              Mark resolved
            </button>
          )}
          {canClose && !closed && (
            <button className="btn btn-amber" onClick={() => patch({ status: "CLOSED" })} disabled={saving}>
              Sign off &amp; close
            </button>
          )}
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}

      <div className="filters" style={{ marginBottom: 14 }}>
        <span className={`badge ${SEVERITY_BADGE[defect.severity]}`}>{SEVERITY_LABELS[defect.severity]}</span>
        <span className={`badge ${STATUS_BADGE[defect.status]}`}>
          <i className="dot" />
          {STATUS_LABELS[defect.status]}
        </span>
        {overdue && <span className="badge b-bad">Overdue</span>}
      </div>

      <div className="fld">
        <div className="field-label">Where</div>
        <div>{defect.location || <span className="faint">Not recorded</span>}</div>
      </div>

      {defect.description && (
        <div className="fld">
          <div className="field-label">Detail</div>
          <div style={{ whiteSpace: "pre-wrap" }}>{defect.description}</div>
        </div>
      )}

      <div className="fld fld-2">
        <div>
          <div className="field-label">Raised by</div>
          <div>
            {defect.raisedByName} · {formatDate(defect.createdAt)}
          </div>
        </div>
        <div>
          <div className="field-label">Due</div>
          <div>{defect.dueDate ? formatDate(defect.dueDate) : <span className="faint">No date set</span>}</div>
        </div>
      </div>

      {canRaise && !closed ? (
        <div className="fld">
          <label htmlFor="d-reassign">Assigned to</label>
          <select
            id="d-reassign"
            value={assignedToId}
            onChange={(e) => {
              setAssignedToId(e.target.value);
              patch({ assignedToId: e.target.value || null });
            }}
            disabled={saving}
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="fld">
          <div className="field-label">Assigned to</div>
          <div>{defect.assignedToName ?? <span className="faint">Unassigned</span>}</div>
        </div>
      )}

      {defect.photos.length > 0 && (
        <div className="fld">
          <div className="field-label">The problem</div>
          <div className="photo-strip">
            {defect.photos.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={url} src={url} alt={`Defect ${defect.code}`} className="thumb" />
            ))}
          </div>
        </div>
      )}

      <div className="fld">
        <div className="field-label">The fix</div>
        {closed ? (
          <div style={{ whiteSpace: "pre-wrap" }}>
            {defect.resolutionNotes || <span className="faint">Nothing written</span>}
          </div>
        ) : (
          <textarea
            aria-label="What was done to fix this defect"
            value={resolutionNotes}
            onChange={(e) => setResolutionNotes(e.target.value)}
            placeholder="What was done. Required before this can be marked resolved, unless you attach a photo."
            disabled={!canRaise || saving}
          />
        )}
      </div>

      {closed ? (
        defect.resolutionPhotos.length > 0 && (
          <div className="fld">
            <div className="photo-strip">
              {defect.resolutionPhotos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt={`Fix for defect ${defect.code}`} className="thumb" />
              ))}
            </div>
          </div>
        )
      ) : (
        <div className="fld">
          <PhotoStrip
            label="the fix"
            photos={resolutionPhotos}
            onChange={setResolutionPhotos}
            max={12}
            disabled={!canRaise}
          />
        </div>
      )}

      {closed && (
        <div className="fld">
          <div className="field-label">Signed off</div>
          <div>
            {defect.closedByName ?? "—"} · {formatDateTime(defect.closedAt)}
          </div>
        </div>
      )}
    </Modal>
  );
}
