import type { SafetyInspectionItem, SafetyInspectionOutcome } from "@/lib/db/types";

/**
 * Safety domain rules, with no database in sight.
 *
 * Separate from lib/db/safety.ts so that anything needing these — including a
 * route test that mocks the data layer — gets the real logic rather than a
 * stub. A route mocking the whole db module and silently receiving
 * `undefined` for a pure helper is how the project-deletion test started
 * failing for reasons unrelated to what it was testing.
 */

/**
 * The outcome is derived, never supplied by the caller.
 *
 * If the client sent it, a failing inspection could be filed as a pass — and
 * the one thing a safety record has to be is not editable into saying
 * something convenient.
 */
export function deriveOutcome(items: SafetyInspectionItem[]): {
  outcome: SafetyInspectionOutcome;
  failedCount: number;
} {
  const failedCount = items.filter((i) => i.result === "FAIL").length;
  if (failedCount === 0) return { outcome: "PASS", failedCount: 0 };
  // Anything beyond a handful of failures is not "a few actions" — it is a
  // site that should not be working in that state.
  return { outcome: failedCount >= 5 ? "FAIL" : "ACTIONS_REQUIRED", failedCount };
}

/**
 * Every storage object an inspection references — the inspection's own photos
 * and the evidence attached to individual findings.
 *
 * One function rather than the callers each reaching for `.photos`, because
 * per-item photos are easy to forget and the symptom is silent: the row goes,
 * the objects stay, and nothing is left to say they were ever referenced.
 * That exact bug has been fixed twice in this codebase already.
 */
export function inspectionPhotoUrls(inspection: {
  photos?: string[] | null;
  items?: SafetyInspectionItem[] | null;
}): string[] {
  return [
    ...(inspection.photos ?? []),
    ...(inspection.items ?? []).flatMap((i) => i.photos ?? []),
  ];
}
