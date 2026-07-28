"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import Modal from "@/components/app/Modal";
import PhotoStrip from "@/components/app/PhotoStrip";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";
import { SAFETY_CHECKLIST } from "@/lib/safetyChecklist";
import type { SafetyInspection, SafetyItemResult } from "@/lib/db/types";
import type { SafetyInspectionListItem } from "@/lib/db/safety";

const OUTCOME_LABEL: Record<string, string> = {
  PASS: "Pass",
  ACTIONS_REQUIRED: "Actions required",
  FAIL: "Fail",
};

const OUTCOME_BADGE: Record<string, string> = {
  PASS: "b-ok",
  ACTIONS_REQUIRED: "b-amber",
  FAIL: "b-bad",
};

type SortKey = "date" | "code" | "project" | "inspector" | "outcome" | "status";

function valueOf(r: SafetyInspectionListItem, key: SortKey): string | number {
  switch (key) {
    case "date":
      return r.date;
    case "code":
      return r.code;
    case "project":
      return r.project?.name ?? "";
    case "inspector":
      return r.inspectorName;
    case "outcome":
      return r.outcome;
    case "status":
      return r.status;
  }
}

export default function SafetyView({
  rows,
  projects,
  total,
  offset,
  pageSize,
  selectedProjectId,
  canSubmit,
  canClose,
}: {
  rows: SafetyInspectionListItem[];
  projects: { id: string; name: string }[];
  total: number;
  offset: number;
  pageSize: number;
  selectedProjectId?: string;
  canSubmit: boolean;
  canClose: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [detail, setDetail] = useState<SafetyInspection | null>(null);

  const sorted = useMemo(() => sortRows(rows, sort, valueOf), [rows, sort]);

  const firstShown = rows.length === 0 ? 0 : offset + 1;
  const lastShown = offset + rows.length;
  const hasOlder = lastShown < total;

  function pageHref(nextOffset: number) {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("projectId", selectedProjectId);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return `/safety${qs ? `?${qs}` : ""}`;
  }

  async function openDetail(id: string) {
    try {
      const res = await apiFetch<{ inspection: SafetyInspection }>(`/api/safety/${id}`);
      setDetail(res.inspection);
    } catch {
      // The row is already on screen; failing to expand it is not worth an
      // error banner over the whole page.
    }
  }

  return (
    <>
      <div className="topbar">
        <h2>Safety</h2>
        {canSubmit && (
          <div className="top-actions">
            <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
              + New inspection
            </button>
          </div>
        )}
        <div className="sub">
          Site safety inspections — dated, attributed, and kept as filed.
          {total > rows.length ? ` Showing ${firstShown}–${lastShown} of ${total}.` : ""}
        </div>
      </div>

      <div className="filters">
        <ProjectFilterSelect projects={projects} selected={selectedProjectId} basePath="/safety" />
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🦺</div>
            <div className="e-t">{offset > 0 ? "Nothing on this page" : "No inspections yet"}</div>
            <p>
              {offset > 0
                ? `There are ${total} inspections in total — go back to see them.`
                : "File one from site: walk the checklist, mark what fails, attach photos as evidence."}
            </p>
            {offset > 0 ? (
              <Link href={pageHref(0)} className="btn btn-amber">
                Back to the latest
              </Link>
            ) : (
              canSubmit && (
                <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
                  + New inspection
                </button>
              )
            )}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <SortableTh label="Ref" sortKey="code" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Date" sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Project" sortKey="project" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Inspector" sortKey="inspector" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Outcome" sortKey="outcome" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => (
                  <tr key={r.id} className="rowlink" tabIndex={0} onClick={() => openDetail(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          openDetail(r.id);
                        }
                      }}>
                    <td className="num">{r.code}</td>
                    <td className="num">{formatDate(r.date)}</td>
                    <td>{r.project?.name ?? "—"}</td>
                    <td>{r.inspectorName}</td>
                    <td>
                      <span className={`badge ${OUTCOME_BADGE[r.outcome]}`}>
                        {OUTCOME_LABEL[r.outcome]}
                        {r.failedCount > 0 ? ` · ${r.failedCount}` : ""}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${r.status === "CLOSED" ? "b-ok" : "b-mut"}`}>
                        <i className="dot" />
                        {r.status === "CLOSED" ? "Closed" : "Open"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {(offset > 0 || hasOlder) && (
        <div className="filters">
          {offset > 0 && (
            <Link href={pageHref(Math.max(0, offset - pageSize))} className="btn">
              ← Newer
            </Link>
          )}
          {hasOlder && (
            <Link href={pageHref(offset + pageSize)} className="btn">
              Older →
            </Link>
          )}
        </div>
      )}

      {newOpen && (
        <NewInspectionModal
          projects={projects}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}

      {detail && (
        <DetailModal
          inspection={detail}
          canClose={canClose}
          onClose={() => setDetail(null)}
          onClosed={() => {
            setDetail(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewInspectionModal({
  projects,
  onClose,
  onSaved,
}: {
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Everything starts as a pass. An inspector marks the exceptions, which is
  // how a site walk actually goes — you note what is wrong, not what is fine.
  const [results, setResults] = useState<SafetyItemResult[]>(() => SAFETY_CHECKLIST.map(() => "PASS"));
  const [notesByIndex, setNotesByIndex] = useState<Record<number, string>>({});
  const [photosByIndex, setPhotosByIndex] = useState<Record<number, string[]>>({});
  const [photos, setPhotos] = useState<string[]>([]);

  const failed = results.filter((r) => r === "FAIL").length;

  function setResult(i: number, result: SafetyItemResult) {
    setResults((prev) => prev.map((r, idx) => (idx === i ? result : r)));
  }

  async function submit() {
    setError("");
    if (!projectId) return setError("Choose a project.");
    setSaving(true);
    try {
      await apiFetch("/api/safety", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          date,
          notes: notes || undefined,
          photos: photos.length ? photos : undefined,
          items: SAFETY_CHECKLIST.map((t, i) => ({
            category: t.category,
            item: t.item,
            result: results[i],
            note: notesByIndex[i] || undefined,
            // Only failures carry evidence. A photo of something that passed
            // is noise in a record someone has to read under time pressure.
            photos: results[i] === "FAIL" && photosByIndex[i]?.length ? photosByIndex[i] : undefined,
          })),
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not file the inspection.");
    } finally {
      setSaving(false);
    }
  }

  // Group by category, preserving template order.
  const grouped = SAFETY_CHECKLIST.reduce<Record<string, number[]>>((acc, t, i) => {
    (acc[t.category] ??= []).push(i);
    return acc;
  }, {});

  return (
    <Modal
      title="New safety inspection"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={submit} disabled={saving}>
            {saving ? "Filing…" : failed > 0 ? `File with ${failed} finding${failed === 1 ? "" : "s"}` : "File inspection"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      {projects.length === 0 && <div className="auth-err">Create a project first.</div>}

      <div className="form-grid">
        <div>
          <label htmlFor="safety-project">Project</label>
          <select id="safety-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="safety-date">Date inspected</label>
          <input id="safety-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      </div>

      <div className="field-label" style={{ marginTop: 16 }}>
        Checklist — mark anything that fails
      </div>

      {Object.entries(grouped).map(([category, indexes]) => (
        <fieldset key={category} style={{ border: 0, padding: 0, margin: "0 0 14px" }}>
          <legend className="field-label" style={{ marginBottom: 6 }}>
            {category}
          </legend>
          {indexes.map((i) => (
            <div key={i} style={{ padding: "7px 0", borderBottom: "1px solid var(--line)" }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 180, fontSize: 13.5 }}>{SAFETY_CHECKLIST[i].item}</span>
                <div role="group" aria-label={SAFETY_CHECKLIST[i].item} style={{ display: "flex", gap: 6 }}>
                  {(["PASS", "FAIL", "NA"] as SafetyItemResult[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`btn btn-sm${results[i] === r ? (r === "FAIL" ? " btn-danger" : " btn-amber") : ""}`}
                      aria-pressed={results[i] === r}
                      onClick={() => setResult(i, r)}
                    >
                      {r === "NA" ? "N/A" : r === "FAIL" ? "Fail" : "Pass"}
                    </button>
                  ))}
                </div>
              </div>
              {results[i] === "FAIL" && (
                <>
                  <input
                    aria-label={`What is wrong: ${SAFETY_CHECKLIST[i].item}`}
                    placeholder="What is wrong, and where"
                    value={notesByIndex[i] ?? ""}
                    onChange={(e) => setNotesByIndex((p) => ({ ...p, [i]: e.target.value }))}
                    style={{ marginTop: 7 }}
                  />
                  <div style={{ marginTop: 7 }}>
                    <PhotoStrip
                      label={SAFETY_CHECKLIST[i].item}
                      max={6}
                      photos={photosByIndex[i] ?? []}
                      onChange={(next) => setPhotosByIndex((p) => ({ ...p, [i]: next }))}
                    />
                  </div>
                </>
              )}
            </div>
          ))}
        </fieldset>
      ))}

      <div>
        <label htmlFor="safety-notes">General notes (optional)</label>
        <textarea id="safety-notes" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
      </div>

      <div style={{ marginTop: 14 }}>
        <div className="field-label">General site photos (optional)</div>
        <PhotoStrip label="the site overall" max={20} photos={photos} onChange={setPhotos} />
      </div>
    </Modal>
  );
}

function DetailModal({
  inspection,
  canClose,
  onClose,
  onClosed,
}: {
  inspection: SafetyInspection;
  canClose: boolean;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const failures = inspection.items.filter((i) => i.result === "FAIL");

  async function close() {
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/safety/${inspection.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "CLOSED" }),
      });
      onClosed();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not close the inspection.");
      setBusy(false);
    }
  }

  return (
    <Modal
      title={`${inspection.code} — ${OUTCOME_LABEL[inspection.outcome]}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          {canClose && inspection.status === "OPEN" && (
            <button className="btn btn-amber" onClick={close} disabled={busy}>
              {busy ? "Closing…" : "Mark findings actioned"}
            </button>
          )}
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}

      <div className="form-grid">
        <div>
          <div className="field-label">Date inspected</div>
          <div className="num">{formatDate(inspection.date)}</div>
        </div>
        <div>
          <div className="field-label">Inspector</div>
          <div>{inspection.inspectorName}</div>
        </div>
        <div>
          <div className="field-label">Findings</div>
          <div className="num">{inspection.failedCount}</div>
        </div>
        <div>
          <div className="field-label">Status</div>
          <div>
            {inspection.status === "CLOSED"
              ? `Closed${inspection.closedByName ? ` by ${inspection.closedByName}` : ""}`
              : "Open"}
          </div>
        </div>
      </div>

      <div className="field-label" style={{ marginTop: 16 }}>
        {failures.length > 0 ? "What failed" : "Result"}
      </div>
      {failures.length === 0 ? (
        <p className="small mut">Every item on the checklist passed or was not applicable.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 18 }}>
          {failures.map((f, i) => (
            <li key={i} style={{ marginBottom: 12, fontSize: 13.5 }}>
              <b>{f.category}</b> — {f.item}
              {f.note ? <div className="small mut">{f.note}</div> : null}
              {f.photos && f.photos.length > 0 && (
                <div className="photo-strip" style={{ marginTop: 6 }}>
                  {f.photos.map((url) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer" className="thumb-box">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={url} alt={`Evidence: ${f.item}`} className="thumb" />
                    </a>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {inspection.notes && (
        <>
          <div className="field-label" style={{ marginTop: 16 }}>
            Notes
          </div>
          <p style={{ fontSize: 13.5 }}>{inspection.notes}</p>
        </>
      )}

      {inspection.photos.length > 0 && (
        <>
          <div className="field-label" style={{ marginTop: 16 }}>
            Site photos
          </div>
          <div className="photo-strip">
            {inspection.photos.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer" className="thumb-box">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Site photo" className="thumb" />
              </a>
            ))}
          </div>
        </>
      )}
    </Modal>
  );
}
