import { ORG_TIMEZONE } from "@/lib/today";

type Numeric = number | string | { toString(): string } | null | undefined;

/**
 * A headline figure, to the ringgit — a contract value, earned value, a
 * plan price. These are whole numbers or near enough that sen would be
 * noise.
 *
 * Not for anything derived from a daily rate: see `formatWages`.
 */
export function formatCurrency(value: Numeric, currency = "MYR") {
  const n = value == null ? 0 : typeof value === "number" ? value : parseFloat(value.toString());
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(n);
}

/**
 * Money that can carry sen, shown to the sen.
 *
 * A half day is worth half a daily rate, so any odd rate puts wages on .50.
 * Rounded to the ringgit, each cell rounds on its own and the column stops
 * adding up to its own total: four workers at RM 155 for 12.5 days showed
 * four rows of RM 1,938 above a header of RM 7,750, which is a figure
 * someone reconciles against a bank transfer.
 */
export function formatWages(value: Numeric, currency = "MYR") {
  const n = value == null ? 0 : typeof value === "number" ? value : parseFloat(value.toString());
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

/**
 * A calendar date that carries no time — a Postgres DATE, such as a report's
 * date or a project's start.
 *
 * Rendered in UTC on purpose. `new Date("2026-08-11")` is midnight UTC, so
 * UTC is the only zone that reads it back as the day it says. Formatting it
 * in Kuching would be harmless; formatting it anywhere west of Greenwich
 * would show the day before.
 *
 * Not for timestamps — see `formatInstantDate` and `formatDateTime`, which
 * have the opposite requirement.
 */
export function formatDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

/**
 * The date part of a moment in time — when a defect was raised, when an
 * invitation expires, when a client signed off.
 *
 * These are timestamptz, and the day they fall on depends on where you are
 * standing. Rendered in UTC, anything between midnight and 08:00 in Kuching
 * belongs to the previous UTC day, so a defect raised at 07:00 on the 11th
 * was shown as the 10th.
 */
export function formatInstantDate(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: ORG_TIMEZONE,
  }).format(d);
}

/**
 * A moment in time, shown as the workspace experienced it.
 *
 * Rendered in UTC this was eight hours early on every audit entry, every
 * inspection and every client decision — a sign-off at 17:00 read as 09:00,
 * which is a statement about when someone did something.
 */
export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: ORG_TIMEZONE,
  }).format(d);
}

export function statusBadgeClass(status: string) {
  switch (status) {
    case "ACTIVE":
      return "b-ok";
    case "PLANNING":
      return "b-info";
    case "ON_HOLD":
      return "b-amber";
    case "COMPLETED":
      return "b-mut";
    case "SUBMITTED":
      return "b-amber";
    case "REVIEWED":
      return "b-ok";
    case "PRESENT":
      return "b-ok";
    case "HALF_DAY":
      return "b-amber";
    case "ABSENT":
      return "b-bad";
    case "PENDING":
    case "DRAFT":
      return "b-mut";
    case "ACCEPTED":
    case "APPROVED":
    case "DELIVERED":
    case "SCHEDULED":
      return "b-ok";
    case "REJECTED":
    case "CANCELLED":
    case "EXPIRED":
      return "b-bad";
    case "ORDERED":
      return "b-info";
    default:
      return "b-mut";
  }
}

export function statusLabel(status: string) {
  return status.replaceAll("_", " ");
}
