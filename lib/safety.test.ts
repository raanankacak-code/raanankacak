import { describe, expect, it } from "vitest";
import { deriveOutcome, inspectionPhotoUrls } from "@/lib/safety";
import type { SafetyInspectionItem } from "@/lib/db/types";

describe("deriveOutcome", () => {
  const item = (result: SafetyInspectionItem["result"]): SafetyInspectionItem => ({
    category: "PPE",
    item: "Hard hats",
    result,
  });

  it("passes when nothing failed", () => {
    expect(deriveOutcome([item("PASS"), item("PASS"), item("NA")])).toEqual({ outcome: "PASS", failedCount: 0 });
  });

  it("does not count N/A as a failure", () => {
    // An item that does not apply to this site is not a finding against it.
    expect(deriveOutcome([item("NA"), item("NA")])).toEqual({ outcome: "PASS", failedCount: 0 });
  });

  it("calls a handful of failures actions-required", () => {
    expect(deriveOutcome([item("FAIL"), item("PASS")])).toEqual({ outcome: "ACTIONS_REQUIRED", failedCount: 1 });
    expect(deriveOutcome(Array(4).fill(item("FAIL")))).toEqual({ outcome: "ACTIONS_REQUIRED", failedCount: 4 });
  });

  it("calls five or more a failure — that is a site that should stop", () => {
    expect(deriveOutcome(Array(5).fill(item("FAIL")))).toEqual({ outcome: "FAIL", failedCount: 5 });
  });

  it("is a pure function of the items, so a caller cannot dictate the outcome", () => {
    // The API schema refuses `outcome` on input; this is the other half of
    // that guarantee. A failing inspection can never be filed as a pass.
    const items = [item("FAIL"), item("PASS")];
    const withExtra = items.map((i) => ({ ...i, outcome: "PASS" }) as SafetyInspectionItem);
    expect(deriveOutcome(withExtra).outcome).toBe("ACTIONS_REQUIRED");
  });
});

describe("inspectionPhotoUrls", () => {
  it("collects the inspection's own photos", () => {
    expect(inspectionPhotoUrls({ photos: ["a.jpg", "b.jpg"], items: [] })).toEqual(["a.jpg", "b.jpg"]);
  });

  it("collects evidence attached to individual findings", () => {
    // The one that matters. Per-finding photos are easy to forget when
    // sweeping storage, and the symptom is silent: the row goes, the objects
    // stay, and nothing is left to say they were ever referenced.
    const urls = inspectionPhotoUrls({
      photos: ["site.jpg"],
      items: [
        { category: "PPE", item: "Hard hats", result: "FAIL", photos: ["f1.jpg", "f2.jpg"] },
        { category: "PPE", item: "Boots", result: "PASS" },
        { category: "Access", item: "Walkways", result: "FAIL", photos: ["f3.jpg"] },
      ],
    });

    expect(urls).toEqual(["site.jpg", "f1.jpg", "f2.jpg", "f3.jpg"]);
  });

  it("survives missing and null fields rather than throwing mid-delete", () => {
    // This runs inside a delete path. Throwing here would leave the row gone
    // and the objects behind — the exact failure it exists to prevent.
    expect(inspectionPhotoUrls({})).toEqual([]);
    expect(inspectionPhotoUrls({ photos: null, items: null })).toEqual([]);
    expect(inspectionPhotoUrls({ items: [{ category: "x", item: "y", result: "PASS" }] })).toEqual([]);
  });
});
