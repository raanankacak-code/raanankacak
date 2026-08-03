/**
 * Today's date, as the workspace sees it.
 *
 * Every organisation in this app is on Asia/Kuching (see the `timezone`
 * column's default in supabase/schema.sql), and a server running in UTC is
 * eight hours behind it. Using the server's date to decide what is overdue
 * would mark work late up to eight hours early — at 08:00 in Kuching the
 * server still thinks it is yesterday.
 *
 * Returned as YYYY-MM-DD so it compares directly against a Postgres DATE,
 * which is how the overdue queries are written.
 */
export const ORG_TIMEZONE = "Asia/Kuching";

export function todayInOrgTimezone(now: Date = new Date(), timeZone: string = ORG_TIMEZONE): string {
  // en-CA gives YYYY-MM-DD, which is the one locale format that is already
  // the shape Postgres wants. Building it from getFullYear/getMonth would
  // read the *server's* zone, which is the bug this exists to avoid.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * Moves a YYYY-MM-DD date by whole calendar days.
 *
 * Done on the date itself rather than by adding 86400000ms to a timestamp:
 * milliseconds are only equivalent to days in a zone with no DST, and
 * writing it that way invites the next timezone to break it quietly. Noon
 * UTC is the anchor so the arithmetic cannot fall off either end of a day.
 */
export function shiftDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const at = new Date(Date.UTC(y, m - 1, d, 12));
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** `n` days before today, as the workspace reckons it. */
export function daysAgoInOrgTimezone(n: number, now: Date = new Date(), timeZone: string = ORG_TIMEZONE): string {
  return shiftDays(todayInOrgTimezone(now, timeZone), -n);
}

/** `n` days after today, as the workspace reckons it. */
export function daysAheadInOrgTimezone(n: number, now: Date = new Date(), timeZone: string = ORG_TIMEZONE): string {
  return shiftDays(todayInOrgTimezone(now, timeZone), n);
}
