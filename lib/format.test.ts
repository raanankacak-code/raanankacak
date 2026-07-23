import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate, formatDateTime, statusBadgeClass, statusLabel } from "@/lib/format";

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
  it("formats a Date as DD/MM/YYYY in UTC", () => {
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

describe("formatDateTime", () => {
  it("formats a Date as DD/MM/YYYY, HH:MM in UTC", () => {
    expect(formatDateTime(new Date("2026-07-19T14:05:00.000Z"))).toBe("19/07/2026, 14:05");
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
