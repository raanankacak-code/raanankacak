import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDateTime,
  formatInstantDate,
  statusBadgeClass,
  statusLabel,
} from "@/lib/format";

// Intl.NumberFormat renders MYR as "RM" + U+00A0 (non-breaking space) + amount.
const rm = (amount: string) => "RM\u00A0" + amount;

describe("formatCurrency", () => {
  it("formats a number as MYR with no decimals", () => {
    expect(formatCurrency(4500000)).toBe(rm("4,500,000"));
  });

  it("treats null/undefined as zero instead of throwing or showing NaN", () => {
    expect(formatCurrency(null)).toBe(rm("0"));
    expect(formatCurrency(undefined)).toBe(rm("0"));
  });

  it("parses numeric strings (e.g. from Postgres numeric columns)", () => {
    expect(formatCurrency("160.00")).toBe(rm("160"));
  });

  it("does not choke on a negative or zero value", () => {
    expect(formatCurrency(0)).toBe(rm("0"));
    expect(() => formatCurrency(-500)).not.toThrow();
  });
});

describe("formatDate", () => {
  // UTC on purpose: a Postgres DATE parses to midnight UTC, so UTC is the
  // only zone that reads it back as the day it says.
  it("formats a date-only value as DD/MM/YYYY in UTC", () => {
    expect(formatDate(new Date("2026-07-19T00:00:00.000Z"))).toBe("19/07/2026");
  });

  it("formats an ISO date string the same way as a Date object", () => {
    expect(formatDate("2026-07-19")).toBe("19/07/2026");
  });

  it("returns an em dash for null/undefined instead of throwing", () => {
    expect(formatDate(null)).toBe("\u2014");
    expect(formatDate(undefined)).toBe("\u2014");
  });
});

describe("formatInstantDate", () => {
  it("gives a timestamp the day it fell on in Kuching, not in UTC", () => {
    // 07:00 on the 11th in Kuching is 23:00 on the 10th in UTC. Rendered in
    // UTC, a defect raised first thing was dated to the day before.
    const at0700Kuching = new Date("2026-08-10T23:00:00.000Z");

    expect(formatInstantDate(at0700Kuching)).toBe("11/08/2026");
    expect(formatDate(at0700Kuching)).toBe("10/08/2026");
  });

  it("agrees with the UTC date once the day has caught up", () => {
    const midMorning = new Date("2026-08-11T04:00:00.000Z");

    expect(formatInstantDate(midMorning)).toBe("11/08/2026");
    expect(formatDate(midMorning)).toBe("11/08/2026");
  });

  it("returns an em dash for null/undefined instead of throwing", () => {
    expect(formatInstantDate(null)).toBe("\u2014");
    expect(formatInstantDate(undefined)).toBe("\u2014");
  });
});

describe("formatDateTime", () => {
  it("shows the time the workspace saw, not the server's", () => {
    // A client sign-off at 22:05 in Kuching. Rendered in UTC this read
    // 14:05 — a statement about when someone did something, eight hours out.
    expect(formatDateTime(new Date("2026-07-19T14:05:00.000Z"))).toBe("19/07/2026, 22:05");
  });

  it("carries the date across midnight with the time", () => {
    // 00:30 on the 11th locally, still the 10th in UTC.
    expect(formatDateTime(new Date("2026-08-10T16:30:00.000Z"))).toBe("11/08/2026, 00:30");
  });

  it("returns an em dash for null/undefined instead of throwing", () => {
    expect(formatDateTime(null)).toBe("\u2014");
    expect(formatDateTime(undefined)).toBe("\u2014");
  });
});

describe("statusBadgeClass", () => {
  it("maps known statuses to their badge class", () => {
    expect(statusBadgeClass("ACTIVE")).toBe("b-ok");
    expect(statusBadgeClass("ABSENT")).toBe("b-bad");
    expect(statusBadgeClass("PLANNING")).toBe("b-info");
  });

  it("falls back to a neutral badge class for an unknown status", () => {
    expect(statusBadgeClass("SOME_FUTURE_STATUS")).toBe("b-mut");
  });
});

describe("statusLabel", () => {
  it("replaces underscores with spaces", () => {
    expect(statusLabel("ON_HOLD")).toBe("ON HOLD");
    expect(statusLabel("ACTIVE")).toBe("ACTIVE");
  });
});
