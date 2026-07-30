"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDate } from "@/lib/format";
import Modal from "@/components/app/Modal";
import PhotoStrip from "@/components/app/PhotoStrip";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";
import {
  EQUIPMENT_STATUSES,
  STATUS_BADGE,
  STATUS_LABELS,
  WARNING_BADGE,
  WARNING_LABELS,
  equipmentWarnings,
} from "@/lib/equipment";
import type { Equipment, EquipmentStatus, EquipmentUsageLog } from "@/lib/db/types";
import type { EquipmentListItem } from "@/lib/db/equipment";

type SortKey = "code" | "name" | "type" | "project" | "status" | "service" | "inspection" | "hours";

function valueOf(r: EquipmentListItem, key: SortKey): string | number {
  switch (key) {
    case "code":
      return r.code;
    case "name":
      return r.name;
    case "type":
      return r.type ?? "";
    case "project":
      return r.project?.name ?? "";
    case "status":
      return r.status;
    case "hours":
      return r.totalHours;
    case "service":
      // Undated last however it is sorted — no date is not "due first".
      return r.nextServiceDate ?? "9999-99-99";
    case "inspection":
      return r.inspectionExpiry ?? "9999-99-99";
  }
}

/** A due date with its warning said in words, not only in colour. */
function DueCell({ date, warning }: { date: string | null; warning: string | null }) {
  if (!date) return <span className="faint">—</span>;
  return (
    <>
      {formatDate(date)}
      {warning && (
        <div className="small" style={{ color: "var(--bad-text)", fontWeight: 700 }}>
          {warning}
        </div>
      )}
    </>
  );
}

export default function EquipmentView({
  rows,
  projects,
  total,
  offset,
  pageSize,
  selectedProjectId,
  selectedStatus,
  today,
  canManage,
  canLogUsage,
}: {
  rows: EquipmentListItem[];
  projects: { id: string; name: string }[];
  total: number;
  offset: number;
  pageSize: number;
  selectedProjectId?: string;
  selectedStatus?: string;
  /** YYYY-MM-DD in the workspace's timezone, decided on the server. */
  today: string;
  canManage: boolean;
  canLogUsage: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const sorted = useMemo(() => sortRows(rows, sort, valueOf), [rows, sort]);

  const firstShown = rows.length === 0 ? 0 : offset + 1;
  const lastShown = offset + rows.length;
  const hasMore = lastShown < total;

  function hrefWith(next: { status?: string; offset?: number }) {
    const params = new URLSearchParams();
    if (selectedProjectId) params.set("projectId", selectedProjectId);
    const status = next.status !== undefined ? next.status : selectedStatus;
    if (status && status !== "all") params.set("status", status);
    if (next.offset && next.offset > 0) params.set("offset", String(next.offset));
    const qs = params.toString();
    return `/equipment${qs ? `?${qs}` : ""}`;
  }

  return (
    <>
      <div className="topbar">
        <h2>Equipment</h2>
        {canManage && (
          <div className="top-actions">
            <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
              + Register equipment
            </button>
          </div>
        )}
        <div className="sub">
          Plant and equipment — where it is, hours worked, and when it is next due for service or inspection.
          {total > rows.length ? ` Showing ${firstShown}–${lastShown} of ${total}.` : ""}
        </div>
      </div>

      <div className="filters">
        <ProjectFilterSelect projects={projects} selected={selectedProjectId} basePath="/equipment" />
        <select
          aria-label="Filter by status"
          value={selectedStatus ?? "all"}
          onChange={(e) => router.push(hrefWith({ status: e.target.value, offset: 0 }))}
        >
          <option value="all">All statuses</option>
          {EQUIPMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <div className="card">
        {rows.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🚜</div>
            <div className="e-t">{offset > 0 ? "Nothing on this page" : "No equipment registered"}</div>
            <p>
              {offset > 0
                ? `There are ${total} machines in total — go back to see them.`
                : "Register your plant so service dates and statutory inspections stop living in someone's head."}
            </p>
            {offset > 0 ? (
              <Link href={hrefWith({ offset: 0 })} className="btn btn-amber">
                Back to the start
              </Link>
            ) : (
              canManage && (
                <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
                  + Register equipment
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
                  <SortableTh label="Machine" sortKey="name" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Where" sortKey="project" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Hours" sortKey="hours" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Next service" sortKey="service" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Inspection" sortKey="inspection" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r) => {
                  const warnings = equipmentWarnings(r, today);
                  const serviceWarning = warnings.find((w) => w.startsWith("SERVICE"));
                  const inspectionWarning = warnings.find((w) => w.startsWith("INSPECTION"));
                  return (
                    <tr
                      key={r.id}
                      className="rowlink"
                      tabIndex={0}
                      onClick={() => setDetailId(r.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setDetailId(r.id);
                        }
                      }}
                    >
                      <td className="num">{r.code}</td>
                      <td>
                        <div style={{ fontWeight: 600 }}>{r.name}</div>
                        <div className="small mut">
                          {[r.type, r.registrationNo, r.owned ? "Owned" : `Hired${r.supplier ? ` · ${r.supplier}` : ""}`]
                            .filter(Boolean)
                            .join(" · ")}
                        </div>
                      </td>
                      <td>{r.project?.name ?? <span className="faint">In the yard</span>}</td>
                      <td className="num">{r.totalHours > 0 ? `${r.totalHours}h` : <span className="faint">—</span>}</td>
                      <td className="num">
                        <DueCell date={r.nextServiceDate} warning={serviceWarning ? WARNING_LABELS[serviceWarning as never] : null} />
                      </td>
                      <td className="num">
                        <DueCell
                          date={r.inspectionExpiry}
                          warning={inspectionWarning ? WARNING_LABELS[inspectionWarning as never] : null}
                        />
                      </td>
                      <td>
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

      {(offset > 0 || hasMore) && (
        <div className="filters">
          {offset > 0 && (
            <Link href={hrefWith({ offset: Math.max(0, offset - pageSize) })} className="btn">
              ← Previous
            </Link>
          )}
          {hasMore && (
            <Link href={hrefWith({ offset: offset + pageSize })} className="btn">
              Next →
            </Link>
          )}
        </div>
      )}

      {newOpen && (
        <EquipmentFormModal
          projects={projects}
          onClose={() => setNewOpen(false)}
          onSaved={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}

      {detailId && (
        <EquipmentDetailModal
          id={detailId}
          today={today}
          canManage={canManage}
          canLogUsage={canLogUsage}
          onClose={() => setDetailId(null)}
          onChanged={() => router.refresh()}
          onDeleted={() => {
            setDetailId(null);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function EquipmentFormModal({
  projects,
  onClose,
  onSaved,
}: {
  projects: { id: string; name: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [registrationNo, setRegistrationNo] = useState("");
  const [projectId, setProjectId] = useState("");
  const [owned, setOwned] = useState(true);
  const [supplier, setSupplier] = useState("");
  const [lastServiceDate, setLastServiceDate] = useState("");
  const [nextServiceDate, setNextServiceDate] = useState("");
  const [inspectionExpiry, setInspectionExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    if (name.trim().length < 2) return setError("Give the machine a name.");
    setSaving(true);
    setError("");
    try {
      await apiFetch("/api/equipment", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type: type.trim() || undefined,
          registrationNo: registrationNo.trim() || undefined,
          projectId: projectId || null,
          owned,
          supplier: owned ? undefined : supplier.trim() || undefined,
          lastServiceDate: lastServiceDate || undefined,
          nextServiceDate: nextServiceDate || undefined,
          inspectionExpiry: inspectionExpiry || undefined,
          notes: notes.trim() || undefined,
          photos,
        }),
      });
      onSaved();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not register the equipment.");
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Register equipment"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Register"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}

      <div className="fld">
        <label htmlFor="eq-name">Machine</label>
        <input id="eq-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Excavator 20T" />
      </div>

      <div className="fld fld-2">
        <div>
          <label htmlFor="eq-type">Type</label>
          <input id="eq-type" value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. Excavator" />
        </div>
        <div>
          <label htmlFor="eq-reg">Plate or serial</label>
          <input id="eq-reg" value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
        </div>
      </div>

      <div className="fld">
        <label htmlFor="eq-project">Where is it</label>
        <select id="eq-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">In the yard</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      <label className="consent" htmlFor="eq-owned">
        <input id="eq-owned" type="checkbox" checked={owned} onChange={(e) => setOwned(e.target.checked)} />
        <span>
          We own this machine. Untick it if it is hired — hours are then what you are invoiced on rather than what
          drives the next service.
        </span>
      </label>

      {!owned && (
        <div className="fld">
          <label htmlFor="eq-supplier">Hired from</label>
          <input id="eq-supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
        </div>
      )}

      <div className="fld fld-2">
        <div>
          <label htmlFor="eq-last">Last serviced</label>
          <input id="eq-last" type="date" value={lastServiceDate} onChange={(e) => setLastServiceDate(e.target.value)} />
        </div>
        <div>
          <label htmlFor="eq-next">Next service due</label>
          <input id="eq-next" type="date" value={nextServiceDate} onChange={(e) => setNextServiceDate(e.target.value)} />
        </div>
      </div>

      <div className="fld">
        <label htmlFor="eq-insp">Statutory inspection expires</label>
        <input id="eq-insp" type="date" value={inspectionExpiry} onChange={(e) => setInspectionExpiry(e.target.value)} />
        <div className="small faint" style={{ marginTop: 5 }}>
          DOSH certificate for lifting gear, pressure vessels and the like. An expired one means the machine stops.
        </div>
      </div>

      <div className="fld">
        <label htmlFor="eq-notes">Notes</label>
        <textarea id="eq-notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="fld">
        <div className="field-label">Photos</div>
        <PhotoStrip label="the machine" photos={photos} onChange={setPhotos} max={12} />
      </div>
    </Modal>
  );
}

function EquipmentDetailModal({
  id,
  today,
  canManage,
  canLogUsage,
  onClose,
  onChanged,
  onDeleted,
}: {
  id: string;
  today: string;
  canManage: boolean;
  canLogUsage: boolean;
  onClose: () => void;
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [data, setData] = useState<{
    equipment: Equipment;
    logs: EquipmentUsageLog[];
    hours: { totalHours: number; lastUsed: string | null; logCount: number };
  } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const [logDate, setLogDate] = useState(today);
  const [logHours, setLogHours] = useState("8");
  const [operatorName, setOperatorName] = useState("");

  // useEffect, not useMemo: this is a side effect. useMemo runs during
  // render, which in React 19 means it can run twice or be discarded, and a
  // fetch fired from there is a fetch nobody is waiting for.
  useEffect(() => {
    let cancelled = false;
    apiFetch<typeof data>(`/api/equipment/${id}`)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load this machine.");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function logUsage() {
    const hours = Number(logHours);
    if (!Number.isFinite(hours) || hours < 0 || hours > 24) {
      return setError("Hours must be between 0 and 24.");
    }
    setSaving(true);
    setError("");
    try {
      await apiFetch(`/api/equipment/${id}/usage`, {
        method: "POST",
        body: JSON.stringify({ date: logDate, hours, operatorName: operatorName.trim() || undefined }),
      });
      const refreshed = await apiFetch<typeof data>(`/api/equipment/${id}`);
      setData(refreshed);
      setOperatorName("");
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not log the hours.");
    } finally {
      setSaving(false);
    }
  }

  async function setStatus(status: EquipmentStatus) {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ equipment: Equipment }>(`/api/equipment/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setData((d) => (d ? { ...d, equipment: res.equipment } : d));
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not update the machine.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!data) return;
    if (
      !confirm(
        `Delete ${data.equipment.code}? Its ${data.hours.logCount} usage log${data.hours.logCount === 1 ? "" : "s"} go with it and this cannot be undone. Retiring it keeps the history.`,
      )
    )
      return;
    setSaving(true);
    try {
      await apiFetch(`/api/equipment/${id}`, { method: "DELETE" });
      onDeleted();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not delete the machine.");
      setSaving(false);
    }
  }

  const equipment = data?.equipment;
  const warnings = equipment ? equipmentWarnings(equipment, today) : [];
  const retired = equipment?.status === "RETIRED";

  return (
    <Modal
      title={equipment ? `${equipment.code} — ${equipment.name}` : "Equipment"}
      onClose={onClose}
      footer={
        <>
          {canManage && equipment && !retired && (
            <button className="btn btn-danger btn-sm" onClick={remove} disabled={saving}>
              Delete
            </button>
          )}
          <button className="btn" onClick={onClose} disabled={saving}>
            Close
          </button>
          {canManage && equipment && !retired && (
            <>
              <button
                className="btn"
                onClick={() => setStatus(equipment.status === "MAINTENANCE" ? "ACTIVE" : "MAINTENANCE")}
                disabled={saving}
              >
                {equipment.status === "MAINTENANCE" ? "Back in service" : "Into maintenance"}
              </button>
              <button className="btn btn-amber" onClick={() => setStatus("RETIRED")} disabled={saving}>
                Retire
              </button>
            </>
          )}
          {canManage && retired && (
            <button className="btn btn-amber" onClick={() => setStatus("ACTIVE")} disabled={saving}>
              Reactivate
            </button>
          )}
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      {!equipment && !error && <p className="mut">Loading…</p>}

      {equipment && (
        <>
          <div className="filters" style={{ marginBottom: 14 }}>
            <span className={`badge ${STATUS_BADGE[equipment.status]}`}>
              <i className="dot" />
              {STATUS_LABELS[equipment.status]}
            </span>
            {warnings.map((w) => (
              <span key={w} className={`badge ${WARNING_BADGE[w]}`}>
                {WARNING_LABELS[w]}
              </span>
            ))}
          </div>

          <div className="fld fld-2">
            <div>
              <div className="field-label">Total hours</div>
              <div className="num" style={{ fontSize: 21, fontWeight: 600 }}>
                {data.hours.totalHours}h
              </div>
              <div className="small mut">
                {data.hours.logCount} log{data.hours.logCount === 1 ? "" : "s"}
                {data.hours.lastUsed ? ` · last used ${formatDate(data.hours.lastUsed)}` : ""}
              </div>
            </div>
            <div>
              <div className="field-label">Ownership</div>
              <div>{equipment.owned ? "Owned" : `Hired${equipment.supplier ? ` from ${equipment.supplier}` : ""}`}</div>
              {equipment.registrationNo && <div className="small mut">{equipment.registrationNo}</div>}
            </div>
          </div>

          <div className="fld fld-2">
            <div>
              <div className="field-label">Next service</div>
              <div>{equipment.nextServiceDate ? formatDate(equipment.nextServiceDate) : <span className="faint">Not set</span>}</div>
            </div>
            <div>
              <div className="field-label">Inspection expires</div>
              <div>{equipment.inspectionExpiry ? formatDate(equipment.inspectionExpiry) : <span className="faint">Not set</span>}</div>
            </div>
          </div>

          {equipment.notes && (
            <div className="fld">
              <div className="field-label">Notes</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{equipment.notes}</div>
            </div>
          )}

          {equipment.photos.length > 0 && (
            <div className="fld">
              <div className="photo-strip">
                {equipment.photos.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="thumb-box">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`${equipment.name}`} className="thumb" />
                  </a>
                ))}
              </div>
            </div>
          )}

          {canLogUsage && !retired && (
            <>
              <div className="field-label" style={{ marginTop: 18 }}>
                Log hours
              </div>
              <div className="fld fld-2">
                <div>
                  <label htmlFor="eq-log-date">Date</label>
                  <input id="eq-log-date" type="date" value={logDate} onChange={(e) => setLogDate(e.target.value)} />
                </div>
                <div>
                  <label htmlFor="eq-log-hours">Hours</label>
                  <input
                    id="eq-log-hours"
                    type="number"
                    min={0}
                    max={24}
                    step={0.5}
                    value={logHours}
                    onChange={(e) => setLogHours(e.target.value)}
                  />
                </div>
              </div>
              <div className="fld">
                <label htmlFor="eq-log-op">Operator</label>
                <input id="eq-log-op" value={operatorName} onChange={(e) => setOperatorName(e.target.value)} />
              </div>
              <button className="btn btn-amber btn-sm" onClick={logUsage} disabled={saving}>
                {saving ? "Saving…" : "Add log"}
              </button>
            </>
          )}

          {data.logs.length > 0 && (
            <>
              <div className="field-label" style={{ marginTop: 18 }}>
                Recent usage
              </div>
              <div className="tbl-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Hours</th>
                      <th>Operator</th>
                      <th>Logged by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.logs.map((l) => (
                      <tr key={l.id}>
                        <td className="num">{formatDate(l.date)}</td>
                        <td className="num">{l.hours}h</td>
                        <td>{l.operatorName ?? <span className="faint">—</span>}</td>
                        <td className="small mut">{l.loggedByName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </Modal>
  );
}
