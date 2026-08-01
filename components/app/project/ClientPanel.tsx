"use client";

import { useEffect, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import Modal from "@/components/app/Modal";
import PhotoStrip from "@/components/app/PhotoStrip";
import { formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_STATUS_BADGE, APPROVAL_STATUS_LABELS, canWithdraw, isDecided } from "@/lib/approvals";
import type { ApprovalStatus } from "@/lib/db/types";

type Approval = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  photos: string[];
  status: ApprovalStatus;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedByEmail: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
};

type ProjectClient = {
  memberId: string;
  name: string;
  email: string;
  active: boolean;
  grantedByName: string | null;
  grantedAt: string;
};

type Member = { id: string; name: string; email: string; role: string; active: boolean };

/**
 * The client side of a project, from the contractor's chair: who outside the
 * company can see it, and what has been sent to them for sign-off.
 *
 * Both halves live here rather than in two places because they are one
 * question — "what does our customer see, and what have they agreed to?" —
 * and the answer is useless in halves.
 */
export default function ClientPanel({
  projectId,
  canRequest,
  canManageAccess,
}: {
  projectId: string;
  canRequest: boolean;
  canManageAccess: boolean;
}) {
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [clients, setClients] = useState<ProjectClient[]>([]);
  const [clientAccounts, setClientAccounts] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [a, c] = await Promise.all([
        apiFetch<{ approvals: Approval[] }>(`/api/approvals?projectId=${projectId}`),
        canManageAccess
          ? apiFetch<{ clients: ProjectClient[] }>(`/api/projects/${projectId}/client-access`)
          : Promise.resolve({ clients: [] as ProjectClient[] }),
      ]);
      setApprovals(a.approvals);
      setClients(c.clients);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load client access.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // Only needed to offer "give an existing client access too", so it is
  // fetched once when that list is going to be shown.
  useEffect(() => {
    if (!canManageAccess) return;
    let cancelled = false;
    apiFetch<{ members: Member[] }>("/api/team")
      .then((res) => {
        if (!cancelled) setClientAccounts(res.members.filter((m) => m.role === "CLIENT" && m.active));
      })
      .catch(() => {
        /* the panel still works without it; the grant control simply stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [canManageAccess]);

  async function grant(memberId: string) {
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch<{ clients: ProjectClient[] }>(`/api/projects/${projectId}/client-access`, {
        method: "POST",
        body: JSON.stringify({ memberId }),
      });
      setClients(res.clients);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to give access.");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(client: ProjectClient) {
    if (!confirm(`Remove ${client.name}'s access to this project? What they have already signed off stays on the record.`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await apiFetch<{ clients: ProjectClient[] }>(`/api/projects/${projectId}/client-access`, {
        method: "DELETE",
        body: JSON.stringify({ memberId: client.memberId }),
      });
      setClients(res.clients);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to remove access.");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(approval: Approval) {
    if (!confirm(`Withdraw "${approval.title}" from the client?`)) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/approvals/${approval.id}`, { method: "POST" });
      await load();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to withdraw.");
    } finally {
      setBusy(false);
    }
  }

  const withoutAccess = clientAccounts.filter((m) => !clients.some((c) => c.memberId === m.id));

  return (
    <>
      {error && <div className="auth-err">{error}</div>}

      {canManageAccess && (
        <div className="card">
          <div className="card-h">
            <h3>Who can see this project</h3>
            <span className="right small faint">{clients.length} client account{clients.length === 1 ? "" : "s"}</span>
          </div>
          {loading ? (
            <div className="card-b">
              <p className="mut small">Loading…</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="card-b">
              <p className="mut small">
                Nobody outside your company can see this project. Invite a client from the Team page, or give an
                existing client account access below.
              </p>
            </div>
          ) : (
            <div className="tbl-wrap">
              {/* `cards` — one card per client below 700px. See globals.css. */}
              <table className="cards">
                <thead>
                  <tr>
                    <th>Client</th>
                    <th>Given access</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.memberId}>
                      <td className="card-t">
                        <b>{c.name}</b>
                        {!c.active && <span className="small faint"> (deactivated)</span>}
                        <div className="small faint num">{c.email}</div>
                      </td>
                      <td className="small" data-label="Given access">
                        {formatDate(c.grantedAt)}
                        {c.grantedByName ? ` · by ${c.grantedByName}` : ""}
                      </td>
                      <td className="card-a" style={{ textAlign: "right" }}>
                        <button className="btn btn-danger btn-sm" disabled={busy} onClick={() => revoke(c)}>
                          Remove access
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {withoutAccess.length > 0 && (
            <div className="card-b" style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
              <span className="small mut">Give an existing client account access:</span>
              {withoutAccess.map((m) => (
                <button key={m.id} className="btn btn-sm" disabled={busy} onClick={() => grant(m.id)}>
                  + {m.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="card">
        <div className="card-h">
          <h3>Sign-off</h3>
          <div className="right">
            {canRequest && (
              <button className="btn btn-amber btn-sm" onClick={() => setNewOpen(true)}>
                + Request sign-off
              </button>
            )}
          </div>
        </div>
        {loading ? (
          <div className="card-b">
            <p className="mut small">Loading…</p>
          </div>
        ) : approvals.length === 0 ? (
          <div className="empty">
            <div className="e-ic">✍️</div>
            <div className="e-t">Nothing sent for sign-off</div>
            <p>
              Ask the client to approve a stage, a milestone or a completed section. Their answer is recorded with
              their name and the date.
            </p>
          </div>
        ) : (
          <div className="card-b approval-list">
            {approvals.map((a) => (
              <article key={a.id} className="approval">
                <div className="approval-h">
                  <span className="num small faint">{a.code}</span>
                  <b>{a.title}</b>
                  <span className={`badge ${APPROVAL_STATUS_BADGE[a.status]}`}>
                    <i className="dot" />
                    {APPROVAL_STATUS_LABELS[a.status]}
                  </span>
                </div>
                {a.description && <p className="small">{a.description}</p>}
                {a.photos.length > 0 && (
                  <div className="photo-strip">
                    {a.photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} className="thumb" alt="" />
                    ))}
                  </div>
                )}
                <div className="small faint">
                  Sent by {a.requestedByName} · {formatDate(a.requestedAt)}
                </div>
                {isDecided(a.status) && a.decidedByName && a.decidedAt && (
                  // The record itself: name, email and the exact time, as
                  // they were when it was signed.
                  <div className="approval-sign">
                    <b>
                      {a.status === "APPROVED" ? "Approved" : "Rejected"} by {a.decidedByName}
                    </b>
                    <div className="small faint num">
                      {a.decidedByEmail} · {formatDateTime(a.decidedAt)}
                    </div>
                    {a.decisionComment && <p className="small">“{a.decisionComment}”</p>}
                  </div>
                )}
                {canRequest && canWithdraw(a.status) && (
                  <div style={{ marginTop: 9 }}>
                    <button className="btn btn-sm" disabled={busy} onClick={() => withdraw(a)}>
                      Withdraw
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      {newOpen && (
        <RequestModal
          projectId={projectId}
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

function RequestModal({
  projectId,
  onClose,
  onCreated,
}: {
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<{ emailsSent: number; clientCount: number } | null>(null);

  async function submit() {
    if (title.trim().length < 3) return setError("Say what you are asking them to sign off.");
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch<{ emailsSent: number; clientCount: number }>("/api/approvals", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          title: title.trim(),
          description: description.trim() || undefined,
          photos: photos.length > 0 ? photos : undefined,
        }),
      });
      // The request exists either way, so a failed email is a warning rather
      // than an error — but closing as if they had been told would leave the
      // site team waiting on someone who never heard.
      if (res.emailsSent < res.clientCount) {
        setSent(res);
        return;
      }
      onCreated();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to send.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      title="Request sign-off"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" onClick={sent ? onCreated : submit} disabled={saving}>
            {sent ? "Done" : saving ? "Sending…" : "Send to client"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      {sent && (
        <div className="auth-err">
          The request was created, but the email could not be sent
          {sent.clientCount > 1 ? ` to all ${sent.clientCount} client accounts` : ""}. They will still see it the next
          time they sign in — tell them it is waiting.
        </div>
      )}
      <div className="form-grid">
        <div className="full">
          <label htmlFor="approval-title">What are they signing off? *</label>
          <input
            id="approval-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Substructure complete — Block A"
          />
        </div>
        <div className="full">
          <label htmlFor="approval-description">Details (optional)</label>
          <textarea
            id="approval-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What was done, and anything they should look at before answering."
          />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {/* A photograph of what you are asking them to approve is half the
            question. The column has always been there; nothing filled it. */}
        <PhotoStrip photos={photos} onChange={setPhotos} max={12} label="Photos of the work being signed off" />
      </div>
      <p className="small mut" style={{ marginTop: 10 }}>
        The client sees this in their portal and can approve or reject it. Their answer is recorded with their name,
        their email and the date, and cannot be changed afterwards.
      </p>
    </Modal>
  );
}
