import type { ApprovalStatus } from "@/lib/db/types";
import { ORG_TIMEZONE } from "@/lib/today";

/**
 * The rules a sign-off has to obey.
 *
 * Kept away from the database module and the route handlers because these
 * are the parts worth being able to read in one place: what a client is
 * allowed to do to a request, and what a decision means once it is made.
 * The same rules are enforced a second time by CHECK constraints in
 * supabase/schema.sql — if these are ever wrong, the database still refuses.
 */

export const APPROVAL_STATUSES: ApprovalStatus[] = ["PENDING", "APPROVED", "REJECTED", "WITHDRAWN"];

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Awaiting client",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  WITHDRAWN: "Withdrawn",
};

export const APPROVAL_STATUS_BADGE: Record<ApprovalStatus, string> = {
  PENDING: "b-amber",
  APPROVED: "b-ok",
  REJECTED: "b-bad",
  WITHDRAWN: "b-mut",
};

/** Still waiting on the client. */
export function isAwaitingClient(status: ApprovalStatus): boolean {
  return status === "PENDING";
}

/**
 * A decision is final.
 *
 * Rejected does not go back to pending: the site team puts the work right and
 * raises a fresh request, so the record shows the rejection and the eventual
 * approval as two separate events rather than one row that quietly changed
 * its mind.
 */
export function isDecided(status: ApprovalStatus): boolean {
  return status === "APPROVED" || status === "REJECTED";
}

/** Only a pending request can be decided, and only APPROVED/REJECTED are decisions. */
export function canDecide(status: ApprovalStatus, decision: ApprovalStatus): boolean {
  if (status !== "PENDING") return false;
  return decision === "APPROVED" || decision === "REJECTED";
}

/** Withdrawal is the contractor's way out, and only before the client has answered. */
export function canWithdraw(status: ApprovalStatus): boolean {
  return status === "PENDING";
}

/**
 * A rejection has to say why. An approval may, but need not.
 *
 * Returns the reason it is invalid, or null when it is fine — the shape the
 * route handler wants, so the message a client sees is written here rather
 * than assembled at the call site.
 */
export function decisionCommentProblem(decision: ApprovalStatus, comment: string | undefined | null): string | null {
  const text = (comment ?? "").trim();
  if (decision === "REJECTED" && text.length === 0) {
    return "Say what is wrong, so the site team knows what to put right.";
  }
  if (text.length > 2000) return "Keep the comment under 2000 characters.";
  return null;
}

/** How a decided request reads on the record. */
export function signOffLine(input: {
  status: ApprovalStatus;
  decidedByName: string | null;
  decidedAt: Date | null;
}): string | null {
  if (!isDecided(input.status) || !input.decidedByName || !input.decidedAt) return null;
  const verb = input.status === "APPROVED" ? "Approved" : "Rejected";
  // In the workspace's zone, not the server's. This line goes on the record
  // a client signed: rendered in UTC, a sign-off at 07:00 in Kuching would
  // carry the previous day's date.
  const date = input.decidedAt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: ORG_TIMEZONE,
  });
  return `${verb} by ${input.decidedByName} on ${date}`;
}
