"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatDate, formatDateTime } from "@/lib/format";
import { APPROVAL_STATUS_BADGE, APPROVAL_STATUS_LABELS, isAwaitingClient, isDecided } from "@/lib/approvals";
import type { ApprovalStatus } from "@/lib/db/types";

export type PortalApproval = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  photos: string[];
  status: ApprovalStatus;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
};

/**
 * The one thing a client can do rather than read.
 *
 * Approve is one tap; reject asks why, because a rejection with no reason
 * lands on the site team as "no" with nothing to act on and someone has to
 * ring them anyway. Neither can be taken back — the answer is the record.
 */
export default function PortalApprovals({ approvals }: { approvals: PortalApproval[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");

  const waiting = approvals.filter((a) => isAwaitingClient(a.status));
  const answered = approvals.filter((a) => isDecided(a.status));

  async function decide(id: string, decision: "APPROVED" | "REJECTED") {
    if (decision === "APPROVED" && !confirm("Approve this? Your name and the date go on the record, and it cannot be undone.")) {
      return;
    }
    setBusyId(id);
    setError("");
    try {
      await apiFetch(`/api/portal/approvals/${id}`, {
        method: "POST",
        body: JSON.stringify({ decision, comment: comment.trim() || undefined }),
      });
      setRejecting(null);
      setComment("");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send your answer. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (approvals.length === 0) return null;

  return (
    <>
      {waiting.length > 0 && (
        <div className="card">
          <div className="card-h">
            <h3>Waiting for you</h3>
            <span className="right small faint">{waiting.length} to answer</span>
          </div>
          <div className="card-b approval-list">
            {error && <div className="auth-err">{error}</div>}
            {waiting.map((a) => (
              <article key={a.id} className="approval">
                <div className="approval-h">
                  <span className="num small faint">{a.code}</span>
                  <b>{a.title}</b>
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

                {rejecting === a.id ? (
                  <div style={{ marginTop: 11 }}>
                    <label htmlFor={`reject-${a.id}`}>What is wrong? *</label>
                    <textarea
                      id={`reject-${a.id}`}
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="So the site team knows what to put right."
                    />
                    <div className="approval-actions">
                      <button
                        className="btn"
                        onClick={() => {
                          setRejecting(null);
                          setComment("");
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        className="btn btn-danger"
                        disabled={busyId === a.id || comment.trim().length === 0}
                        onClick={() => decide(a.id, "REJECTED")}
                      >
                        {busyId === a.id ? "Sending…" : "Send rejection"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="approval-actions">
                    <button className="btn" disabled={busyId === a.id} onClick={() => setRejecting(a.id)}>
                      Reject
                    </button>
                    <button className="btn btn-amber" disabled={busyId === a.id} onClick={() => decide(a.id, "APPROVED")}>
                      {busyId === a.id ? "Sending…" : "Approve"}
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        </div>
      )}

      {answered.length > 0 && (
        <div className="card">
          <div className="card-h">
            <h3>What you have answered</h3>
          </div>
          <div className="card-b approval-list">
            {answered.map((a) => (
              <article key={a.id} className="approval">
                <div className="approval-h">
                  <span className="num small faint">{a.code}</span>
                  <b>{a.title}</b>
                  <span className={`badge ${APPROVAL_STATUS_BADGE[a.status]}`}>
                    <i className="dot" />
                    {APPROVAL_STATUS_LABELS[a.status]}
                  </span>
                </div>
                {a.decidedByName && a.decidedAt && (
                  <div className="small faint">
                    {a.status === "APPROVED" ? "Approved" : "Rejected"} by {a.decidedByName} ·{" "}
                    {formatDateTime(a.decidedAt)}
                  </div>
                )}
                {a.decisionComment && <p className="small">“{a.decisionComment}”</p>}
              </article>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
