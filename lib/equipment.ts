import type { Equipment, EquipmentStatus } from "@/lib/db/types";

/**
 * Equipment domain rules, with no database in sight.
 *
 * Separate from lib/db/equipment.ts for the same reason lib/safety.ts and
 * lib/defects.ts are: a route test that mocks the data layer still gets the
 * real logic rather than `undefined` from a stubbed module.
 */

export const EQUIPMENT_STATUSES: EquipmentStatus[] = ["ACTIVE", "MAINTENANCE", "IDLE", "RETIRED"];

export const STATUS_LABELS: Record<EquipmentStatus, string> = {
  ACTIVE: "Active",
  MAINTENANCE: "In maintenance",
  IDLE: "Idle",
  RETIRED: "Retired",
};

export const STATUS_BADGE: Record<EquipmentStatus, string> = {
  ACTIVE: "b-ok",
  MAINTENANCE: "b-amber",
  IDLE: "b-mut",
  RETIRED: "b-mut",
};

/** How far ahead a due date starts being worth mentioning. */
export const DUE_SOON_DAYS = 30;

/**
 * Retired plant is out of scope for every warning below.
 *
 * A machine that has been sold or scrapped will sit permanently past its
 * service date, and counting it would put a number on the dashboard that can
 * never be cleared — which is how a dashboard becomes wallpaper.
 */
function isTracked(status: EquipmentStatus): boolean {
  return status !== "RETIRED";
}

/** Whole days from `today` to `date`; negative once it has passed. */
export function daysUntil(date: string | null, today: string): number | null {
  if (!date) return null;
  const then = Date.parse(`${date}T00:00:00Z`);
  const now = Date.parse(`${today}T00:00:00Z`);
  if (Number.isNaN(then) || Number.isNaN(now)) return null;
  return Math.round((then - now) / 86_400_000);
}

export function isServiceOverdue(e: Pick<Equipment, "nextServiceDate" | "status">, today: string): boolean {
  if (!isTracked(e.status)) return false;
  const days = daysUntil(e.nextServiceDate, today);
  return days !== null && days < 0;
}

export function isServiceDueSoon(e: Pick<Equipment, "nextServiceDate" | "status">, today: string): boolean {
  if (!isTracked(e.status)) return false;
  const days = daysUntil(e.nextServiceDate, today);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

/**
 * A statutory inspection that has lapsed.
 *
 * Deliberately separate from service: a machine overdue a service is a
 * maintenance decision, while a machine with an expired DOSH certificate is
 * one that must not be operated. Folding them into one "needs attention"
 * count would hide the difference at exactly the moment it matters.
 */
export function isInspectionExpired(e: Pick<Equipment, "inspectionExpiry" | "status">, today: string): boolean {
  if (!isTracked(e.status)) return false;
  const days = daysUntil(e.inspectionExpiry, today);
  return days !== null && days < 0;
}

export function isInspectionExpiringSoon(
  e: Pick<Equipment, "inspectionExpiry" | "status">,
  today: string,
): boolean {
  if (!isTracked(e.status)) return false;
  const days = daysUntil(e.inspectionExpiry, today);
  return days !== null && days >= 0 && days <= DUE_SOON_DAYS;
}

export type EquipmentWarning =
  | "INSPECTION_EXPIRED"
  | "INSPECTION_EXPIRING"
  | "SERVICE_OVERDUE"
  | "SERVICE_DUE";

/**
 * Everything wrong with one machine, worst first.
 *
 * Ordered rather than a set, because the UI shows the first one and the
 * order is the judgement: an expired certificate outranks a late service,
 * and both outrank something merely approaching.
 */
export function equipmentWarnings(
  e: Pick<Equipment, "nextServiceDate" | "inspectionExpiry" | "status">,
  today: string,
): EquipmentWarning[] {
  const warnings: EquipmentWarning[] = [];
  if (isInspectionExpired(e, today)) warnings.push("INSPECTION_EXPIRED");
  if (isServiceOverdue(e, today)) warnings.push("SERVICE_OVERDUE");
  if (isInspectionExpiringSoon(e, today)) warnings.push("INSPECTION_EXPIRING");
  if (isServiceDueSoon(e, today)) warnings.push("SERVICE_DUE");
  return warnings;
}

export const WARNING_LABELS: Record<EquipmentWarning, string> = {
  INSPECTION_EXPIRED: "Inspection expired",
  SERVICE_OVERDUE: "Service overdue",
  INSPECTION_EXPIRING: "Inspection expiring",
  SERVICE_DUE: "Service due",
};

export const WARNING_BADGE: Record<EquipmentWarning, string> = {
  INSPECTION_EXPIRED: "b-bad",
  SERVICE_OVERDUE: "b-bad",
  INSPECTION_EXPIRING: "b-amber",
  SERVICE_DUE: "b-amber",
};

/** Every storage object a machine references. */
export function equipmentPhotoUrls(e: { photos?: string[] | null }): string[] {
  return e.photos ?? [];
}
