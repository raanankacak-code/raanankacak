"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { statusBadgeClass, statusLabel, formatDate } from "@/lib/format";
import Modal from "@/components/app/Modal";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";
import { todayInOrgTimezone as todayISO, daysAheadInOrgTimezone as daysAhead } from "@/lib/today";

const UNITS = ["bags", "m³", "tonnes", "pcs", "m", "litres", "rolls", "sets"];
const STATES = ["all", "DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "ORDERED", "DELIVERED"] as const;
type Status = (typeof STATES)[number];

const TL_COLOR: Record<string, string> = {
  DRAFT: "var(--faint)",
  SUBMITTED: "var(--amber)",
  APPROVED: "var(--info)",
  REJECTED: "var(--bad)",
  ORDERED: "var(--info)",
  DELIVERED: "var(--ok)",
};

type Project = { id: string; name: string };
type Request = {
  id: string;
  code: string;
  projectId: string;
  material: string;
  qty: number;
  unit: string;
  neededBy: string | null;
  status: Exclude<Status, "all">;
  receivedQty: number | null;
  requestedById: string;
  updatedAt: string;
  project: { id: string; name: string };
};
type TimelineEntry = { id: string; state: string; comment: string | null; actorName: string; createdAt: string };
type RequestDetail = Request & { timeline: TimelineEntry[]; justification: string | null };


export default function MaterialsView({
  canSubmit,
  canApprove,
  myId,
}: {
  canSubmit: boolean;
  canApprove: boolean;
  myId: string;
}) {
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get("projectId") || "all";
  const [requests, setRequests] = useState<Request[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectFilter, setProjectFilter] = useState(presetProjectId);
  const [statusFilter, setStatusFilter] = useState<Status>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [sort, setSort] = useState<SortState<"ref" | "material" | "qty" | "needed" | "status" | "updated">>(null);
  const [totalRequests, setTotalRequests] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([
        apiFetch<{ requests: Request[]; total: number }>("/api/materials"),
        apiFetch<{ projects: Project[] }>("/api/projects"),
      ]);
      setRequests(r.requests);
      setTotalRequests(r.total ?? r.requests.length);
      setProjects(p.projects);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load material requests.");
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    setLoadingMore(true);
    try {
      const r = await apiFetch<{ requests: Request[]; total: number }>(
        `/api/materials?offset=${requests.length}`,
      );
      // Append rather than replace: the point is to reach older records
      // without losing the ones already on screen.
      setRequests((current) => [...current, ...r.requests]);
      setTotalRequests(r.total ?? totalRequests);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load more requests.");
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
  }, []);

  const submittedCount = requests.filter((r) => r.status === "SUBMITTED").length;
  const list = useMemo(() => {
    const filtered = requests.filter(
      (r) => (projectFilter === "all" || r.projectId === projectFilter) && (statusFilter === "all" || r.status === statusFilter),
    );
    return sortRows(filtered, sort, (r, key) => {
      switch (key) {
        case "ref":
          return r.code;
        case "material":
          return r.material;
        case "qty":
          return r.qty;
        case "needed":
          return r.neededBy || "";
        case "status":
          return r.status;
        case "updated":
          return r.updatedAt;
      }
    });
  }, [requests, projectFilter, statusFilter, sort]);

  return (
    <>
      <div className="topbar">
        <h2>Material Requests</h2>
        <div className="top-actions">
          {canSubmit && (
            <button className="btn btn-amber" disabled={loading} onClick={() => setNewOpen(true)}>
              ＋ New request
            </button>
          )}
        </div>
        <div className="sub">
          Request from site, approve from anywhere — full audit trail.
          {totalRequests > requests.length ? ` Showing ${requests.length} of ${totalRequests}.` : ""}
        </div>
      </div>

      {error && <div className="auth-err">{error}</div>}

      <div className="filters">
        <select aria-label="Filter by project" value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)}>
          <option value="all">All projects</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <div className="seg" style={{ alignItems: "center" }}>
          {STATES.map((s) => (
            <button key={s} className={statusFilter === s ? "on" : ""} onClick={() => setStatusFilter(s)}>
              {s === "all" ? "All" : statusLabel(s)}
              {s === "SUBMITTED" && submittedCount ? ` (${submittedCount})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="card-b">
            <p className="mut small">Loading…</p>
          </div>
        ) : list.length ? (
          <div className="tbl-wrap">
            {/* `cards` — one card per request below 700px. See globals.css. */}
            <table className="cards">
              <thead>
                <tr>
                  <SortableTh label="Ref" sortKey="ref" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Material" sortKey="material" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Qty" sortKey="qty" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} numeric />
                  <SortableTh label="Needed by" sortKey="needed" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                  <SortableTh label="Last update" sortKey="updated" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
                </tr>
              </thead>
              <tbody>
                {list.map((r) => {
                  const overdue = r.neededBy && r.neededBy <= daysAhead(2) && !["DELIVERED", "REJECTED"].includes(r.status);
                  return (
                    <tr key={r.id} className="rowlink" onClick={() => setOpenId(r.id)}>
                      <td className="num" data-label="Ref">{r.code}</td>
                      <td className="card-t">
                        <b>{r.material}</b>
                        <div className="small faint">{r.project.name}</div>
                      </td>
                      <td className="num" data-label="Qty">
                        {r.qty} {r.unit}
                      </td>
                      <td className="num" data-label="Needed by" style={{ color: overdue ? "var(--bad-text)" : "inherit" }}>
                        {formatDate(r.neededBy)}
                      </td>
                      <td data-label="Status">
                        <span className={`badge ${statusBadgeClass(r.status)}`}>
                          <i className="dot" />
                          {statusLabel(r.status)}
                        </span>
                      </td>
                      <td className="small faint" data-label="Last update">{new Date(r.updatedAt).toLocaleString()}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
        {!loading && requests.length > 0 && totalRequests > requests.length && (
          <div className="card-b" style={{ textAlign: "center" }}>
            <button className="btn" disabled={loadingMore} onClick={loadMore}>
              {loadingMore ? "Loading…" : `Load older requests (${totalRequests - requests.length} more)`}
            </button>
          </div>
        )}
        {/* Only when there is genuinely nothing to show. This was the `else`
            of the Load-older branch, which meant a workspace with requests
            but no further page printed "No Material Requests" underneath a
            table full of them. */}
        {!loading && list.length === 0 && (
          <div className="empty">
            <div className="e-ic">📦</div>
            <div className="e-t">No Material Requests</div>
            <p>Material requests will appear here — raised from site, approved by your PM, tracked through to delivery.</p>
            {canSubmit && (
              <button className="btn btn-amber" onClick={() => setNewOpen(true)}>
                ＋ Create Request
              </button>
            )}
            {statusFilter !== "all" && (
              <button className="btn" onClick={() => setStatusFilter("all")}>
                Clear filter
              </button>
            )}
          </div>
        )}
      </div>

      {openId && (
        <RequestDetailModal
          id={openId}
          canApprove={canApprove}
          canSubmit={canSubmit}
          myId={myId}
          onClose={() => setOpenId(null)}
          onChanged={() => {
            setOpenId(null);
            load();
          }}
        />
      )}

      {newOpen && (
        <NewRequestModal
          projects={projects}
          initialProjectId={presetProjectId !== "all" ? presetProjectId : undefined}
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            load();
          }}
        />
      )}
    </>
  );
}

function RequestDetailModal({
  id,
  canApprove,
  canSubmit,
  myId,
  onClose,
  onChanged,
}: {
  id: string;
  canApprove: boolean;
  canSubmit: boolean;
  myId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [req, setReq] = useState<RequestDetail | null>(null);
  const [comment, setComment] = useState("");
  const [receivedQty, setReceivedQty] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    apiFetch<{ request: RequestDetail }>(`/api/materials/${id}`).then((d) => {
      setReq(d.request);
      setReceivedQty(String(d.request.qty));
    });
  }, [id]);

  if (!req) {
    return (
      <Modal title="Loading…" onClose={onClose}>
        <p className="mut small">Loading…</p>
      </Modal>
    );
  }

  const canApproveNow = canApprove && req.status === "SUBMITTED";
  const canSubmitNow = canSubmit && req.status === "DRAFT" && req.requestedById === myId;
  const canOrder = canApprove && req.status === "APPROVED";
  const canDeliver = canSubmit && req.status === "ORDERED";
  const canDelete = canApprove || (req.status === "DRAFT" && canSubmit && req.requestedById === myId);

  async function transition(status: string) {
    setError("");
    if (status === "REJECTED" && !comment.trim()) {
      setError("A comment is required when rejecting.");
      return;
    }
    setBusy(true);
    try {
      await apiFetch(`/api/materials/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          comment: comment.trim() || undefined,
          receivedQty: status === "DELIVERED" ? Number(receivedQty) || req!.qty : undefined,
        }),
      });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to update request.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm(`Delete ${req!.code} — ${req!.material}? Its approval history goes with it.`)) return;
    setBusy(true);
    try {
      await apiFetch(`/api/materials/${id}`, { method: "DELETE" });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to delete request.");
      setBusy(false);
    }
  }

  const tl = [...req.timeline].reverse();

  return (
    <Modal
      title={`${req.code} — ${req.material}`}
      onClose={onClose}
      footer={
        <>
          {canSubmitNow && (
            <button className="btn btn-amber" disabled={busy} onClick={() => transition("SUBMITTED")}>
              Submit for approval
            </button>
          )}
          {canApproveNow && (
            <>
              <button className="btn btn-danger" disabled={busy} onClick={() => transition("REJECTED")}>
                Reject
              </button>
              <button className="btn btn-amber" disabled={busy} onClick={() => transition("APPROVED")}>
                ✓ Approve
              </button>
            </>
          )}
          {canOrder && (
            <button className="btn btn-amber" disabled={busy} onClick={() => transition("ORDERED")}>
              Mark ordered
            </button>
          )}
          {canDeliver && (
            <button className="btn btn-amber" disabled={busy} onClick={() => transition("DELIVERED")}>
              ✓ Mark delivered
            </button>
          )}
          {canDelete && (
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
      {error && <div className="auth-err">{error}</div>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 14 }}>
        <span className={`badge ${statusBadgeClass(req.status)}`}>
          <i className="dot" />
          {statusLabel(req.status)}
        </span>
        <span className="small mut">{req.project.name}</span>
      </div>
      <div className="form-grid" style={{ marginBottom: 16 }}>
        <div>
          <div className="field-label">Quantity</div>
          <div className="num">
            {req.qty} {req.unit}
            {req.receivedQty != null && <span className="small" style={{ color: "var(--ok-text)" }}> · received {req.receivedQty}</span>}
          </div>
        </div>
        <div>
          <div className="field-label">Needed by</div>
          <div className="num">{formatDate(req.neededBy)}</div>
        </div>
        <div className="full">
          <div className="field-label">Justification</div>
          <div>{req.justification || "—"}</div>
        </div>
      </div>
      {canApproveNow && (
        <div className="full" style={{ marginBottom: 16 }}>
          <label htmlFor="materialsview-decision-comment-required-on">
            Decision comment <span className="faint">(required on rejection)</span>
          </label>
          <textarea id="materialsview-decision-comment-required-on"
            style={{ minHeight: 56 }}
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="e.g. Approved — combine with Friday delivery / Rejected — reuse stock from yard"
          />
        </div>
      )}
      {canDeliver && (
        <div className="full" style={{ marginBottom: 16 }}>
          <label htmlFor="materialsview-received-quantity">Received quantity</label>
          <input id="materialsview-received-quantity" type="number" min="0" style={{ maxWidth: 160 }} value={receivedQty} onChange={(e) => setReceivedQty(e.target.value)} />
        </div>
      )}
      <div className="field-label">Timeline</div>
      <ul className="tline">
        {tl.map((t) => (
          <li key={t.id} style={{ ["--tl" as string]: TL_COLOR[t.state] }}>
            <div className="t-title">
              {statusLabel(t.state)} <span className="small mut" style={{ fontWeight: 400 }}>— {t.actorName}</span>
            </div>
            <div className="t-meta">{new Date(t.createdAt).toLocaleString()}</div>
            {t.comment && <div className="t-note">{t.comment}</div>}
          </li>
        ))}
      </ul>
    </Modal>
  );
}

function NewRequestModal({
  projects,
  initialProjectId,
  onClose,
  onCreated,
}: {
  projects: Project[];
  initialProjectId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [projectId, setProjectId] = useState(initialProjectId ?? projects[0]?.id ?? "");

  // `projects` can still be empty at first mount (e.g. this modal opened
  // right as the parent's initial fetch was landing) — adopt a default once
  // it arrives instead of staying stuck on the empty initializer forever.
  const [seenProjects, setSeenProjects] = useState(projects);
  if (projects !== seenProjects) {
    setSeenProjects(projects);
    if (!projectId && projects.length) setProjectId(initialProjectId ?? projects[0].id);
  }

  const [material, setMaterial] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [neededBy, setNeededBy] = useState(daysAhead(3));
  const [justification, setJustification] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(status: "DRAFT" | "SUBMITTED") {
    setError("");
    if (!projectId) return setError("Create a project first.");
    if (!material.trim()) return setError("Material name is required.");
    if (!qty || Number(qty) < 1) return setError("Quantity is required and must be at least 1.");
    if (!neededBy) return setError("Needed-by date is required.");
    if (!justification.trim()) return setError("Justification is required — it helps your PM approve faster.");
    setSaving(true);
    try {
      await apiFetch("/api/materials", {
        method: "POST",
        body: JSON.stringify({ projectId, material, qty: Number(qty), unit, neededBy, justification, status }),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to save request.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="New Material Request"
      onClose={onClose}
      footer={
        <>
          <button className="btn" disabled={saving} onClick={() => save("DRAFT")}>
            Save as draft
          </button>
          <button className="btn btn-amber" disabled={saving} onClick={() => save("SUBMITTED")}>
            Submit for approval
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      <div className="form-grid">
        <div className="full">
          <label htmlFor="materialsview-project">Project</label>
          <select id="materialsview-project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="full">
          <label htmlFor="materialsview-material">Material *</label>
          <input id="materialsview-material" value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="e.g. Cement (OPC 50kg)" />
        </div>
        <div>
          <label htmlFor="materialsview-quantity">Quantity *</label>
          <input id="materialsview-quantity" type="number" min="1" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
        </div>
        <div>
          <label htmlFor="materialsview-unit">Unit</label>
          <select id="materialsview-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            {UNITS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="materialsview-needed-by">Needed by *</label>
          <input id="materialsview-needed-by" type="date" min={todayISO()} value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
        </div>
        <div className="full">
          <label htmlFor="materialsview-justification">Justification *</label>
          <textarea id="materialsview-justification" value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="What is it for? Which work front?" />
        </div>
      </div>
    </Modal>
  );
}
