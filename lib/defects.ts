import type { Defect, DefectSeverity, DefectStatus } from "@/lib/db/types";

/**
 * Defect domain rules, with no database in sight.
 *
 * Separate from lib/db/defects.ts for the same reason lib/safety.ts is
 * separate: a route test that mocks the data layer still gets the real logic
 * rather than `undefined` from a stubbed module.
 */

export const DEFECT_SEVERITIES: DefectSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export const DEFECT_STATUSES: DefectStatus[] = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

export const SEVERITY_LABELS: Record<DefectSeverity, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const STATUS_LABELS: Record<DefectStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In progress",
  RESOLVED: "Resolved",
  CLOSED: "Closed",
};

/** Badge classes from globals.css, so severity reads at a glance in a list. */
export const SEVERITY_BADGE: Record<DefectSeverity, string> = {
  LOW: "b-mut",
  MEDIUM: "b-info",
  HIGH: "b-amber",
  CRITICAL: "b-bad",
};

export const STATUS_BADGE: Record<DefectStatus, string> = {
  OPEN: "b-bad",
  IN_PROGRESS: "b-amber",
  RESOLVED: "b-info",
  CLOSED: "b-ok",
};

/**
 * A defect still needing work.
 *
 * RESOLVED counts as outstanding on purpose: somebody has said it is fixed,
 * and nobody has yet agreed. Treating it as done would let a snag list empty
 * itself without anyone checking, which is the failure mode the whole module
 * exists to prevent.
 */
export function isOutstanding(status: DefectStatus): boolean {
  return status !== "CLOSED";
}

/**
 * Which status changes are allowed, and from where.
 *
 * Encoded rather than left to the UI because the API has to enforce it too,
 * and two copies of a rule is one copy too many.
 */
const ALLOWED_TRANSITIONS: Record<DefectStatus, DefectStatus[]> = {
  OPEN: ["IN_PROGRESS", "RESOLVED", "CLOSED"],
  IN_PROGRESS: ["OPEN", "RESOLVED", "CLOSED"],
  // Reopening a resolved defect is the point of having someone else close it.
  RESOLVED: ["OPEN", "IN_PROGRESS", "CLOSED"],
  // Closed is the end. Reopening would leave closed_at and closed_by_name
  // describing an event that is no longer true; raise a new defect instead.
  CLOSED: [],
};

export function canTransition(from: DefectStatus, to: DefectStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/**
 * Every storage object a defect references — both sets of photos.
 *
 * One function rather than each caller reaching for `.photos`, because
 * forgetting the resolution photos is silent: the row goes, the objects stay,
 * and nothing is left to say they were ever referenced. That bug has been
 * fixed twice in this codebase already, which is why lib/safety.ts has the
 * same helper.
 */
export function defectPhotoUrls(defect: {
  photos?: string[] | null;
  resolutionPhotos?: string[] | null;
}): string[] {
  return [...(defect.photos ?? []), ...(defect.resolutionPhotos ?? [])];
}

/**
 * Overdue means past its due date and not yet closed.
 *
 * `today` is passed in rather than read from the clock so the caller decides
 * the timezone. The app runs in Asia/Kuching and a server in UTC would
 * otherwise mark things overdue up to eight hours early.
 */
export function isOverdue(defect: Pick<Defect, "dueDate" | "status">, today: string): boolean {
  if (!defect.dueDate) return false;
  if (!isOutstanding(defect.status)) return false;
  return defect.dueDate < today;
}

/** Counts for the dashboard and the project overview. */
export interface DefectSummary {
  total: number;
  outstanding: number;
  overdue: number;
  critical: number;
}

export function summariseDefects(
  defects: Pick<Defect, "dueDate" | "status" | "severity">[],
  today: string,
): DefectSummary {
  return {
    total: defects.length,
    outstanding: defects.filter((d) => isOutstanding(d.status)).length,
    overdue: defects.filter((d) => isOverdue(d, today)).length,
    // Critical *and* still outstanding — a closed critical defect is a
    // success, and counting it as a warning would train people to ignore
    // the number.
    critical: defects.filter((d) => d.severity === "CRITICAL" && isOutstanding(d.status)).length,
  };
}
