import { describe, expect, it } from "vitest";
import {
  daysUntil,
  equipmentWarnings,
  isInspectionExpired,
  isInspectionExpiringSoon,
  isServiceDueSoon,
  isServiceOverdue,
} from "@/lib/equipment";
import type { EquipmentStatus } from "@/lib/db/types";

const TODAY = "2026-07-29";

function machine(over: Partial<{ nextServiceDate: string | null; inspectionExpiry: string | null; status: EquipmentStatus }> = {}) {
  return {
    nextServiceDate: null,
    inspectionExpiry: null,
    status: "ACTIVE" as EquipmentStatus,
    ...over,
  };
}

describe("daysUntil", () => {
  it("counts forward and backward from today", () => {
    expect(daysUntil("2026-08-05", TODAY)).toBe(7);
    expect(daysUntil("2026-07-22", TODAY)).toBe(-7);
    expect(daysUntil(TODAY, TODAY)).toBe(0);
  });

  it("returns null rather than NaN for a missing or unparseable date", () => {
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil("not-a-date", TODAY)).toBeNull();
  });

  it("does not drift across a month boundary", () => {
    // Both parsed as UTC midnight, so no daylight-saving or local-offset
    // arithmetic can push this off by one.
    expect(daysUntil("2026-08-01", "2026-07-31")).toBe(1);
    expect(daysUntil("2027-01-01", "2026-12-31")).toBe(1);
  });
});

describe("service warnings", () => {
  it("is overdue the day after the date, not on it", () => {
    expect(isServiceOverdue(machine({ nextServiceDate: TODAY }), TODAY)).toBe(false);
    expect(isServiceOverdue(machine({ nextServiceDate: "2026-07-28" }), TODAY)).toBe(true);
  });

  it("is due soon within thirty days, and not before", () => {
    expect(isServiceDueSoon(machine({ nextServiceDate: "2026-08-20" }), TODAY)).toBe(true);
    expect(isServiceDueSoon(machine({ nextServiceDate: "2026-10-01" }), TODAY)).toBe(false);
  });

  it("is neither when no date is set", () => {
    expect(isServiceOverdue(machine(), TODAY)).toBe(false);
    expect(isServiceDueSoon(machine(), TODAY)).toBe(false);
  });
});

describe("inspection warnings", () => {
  it("flags a lapsed certificate", () => {
    expect(isInspectionExpired(machine({ inspectionExpiry: "2026-07-01" }), TODAY)).toBe(true);
  });

  it("flags one about to lapse", () => {
    expect(isInspectionExpiringSoon(machine({ inspectionExpiry: "2026-08-10" }), TODAY)).toBe(true);
  });

  it("does not call a valid certificate expired on its last day", () => {
    expect(isInspectionExpired(machine({ inspectionExpiry: TODAY }), TODAY)).toBe(false);
  });
});

describe("retired plant", () => {
  it.each([
    ["service overdue", isServiceOverdue, { nextServiceDate: "2020-01-01" }],
    ["service due soon", isServiceDueSoon, { nextServiceDate: "2026-08-01" }],
    ["inspection expired", isInspectionExpired, { inspectionExpiry: "2020-01-01" }],
    ["inspection expiring", isInspectionExpiringSoon, { inspectionExpiry: "2026-08-01" }],
  ])("never reports %s", (_label, check, dates) => {
    // A machine that has been sold or scrapped sits permanently past its
    // dates. Counting it would put a number on the dashboard that can never
    // be cleared, which is how a dashboard becomes wallpaper.
    expect(check(machine({ ...dates, status: "RETIRED" }), TODAY)).toBe(false);
  });
});

describe("equipmentWarnings", () => {
  it("puts the expired certificate first, because it is the one that stops work", () => {
    const warnings = equipmentWarnings(
      machine({ inspectionExpiry: "2026-07-01", nextServiceDate: "2026-07-02" }),
      TODAY,
    );
    expect(warnings[0]).toBe("INSPECTION_EXPIRED");
    expect(warnings).toContain("SERVICE_OVERDUE");
  });

  it("ranks something overdue above something approaching", () => {
    const warnings = equipmentWarnings(
      machine({ nextServiceDate: "2026-07-01", inspectionExpiry: "2026-08-10" }),
      TODAY,
    );
    expect(warnings).toEqual(["SERVICE_OVERDUE", "INSPECTION_EXPIRING"]);
  });

  it("is empty for a machine with nothing due", () => {
    expect(equipmentWarnings(machine({ nextServiceDate: "2027-01-01" }), TODAY)).toEqual([]);
  });

  it("is empty for a machine with no dates at all", () => {
    expect(equipmentWarnings(machine(), TODAY)).toEqual([]);
  });
});
