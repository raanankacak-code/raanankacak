import { describe, expect, it } from "vitest";
import { canTransition, defectPhotoUrls, isOutstanding, isOverdue } from "@/lib/defects";
import { todayInOrgTimezone } from "@/lib/today";
import type { DefectStatus } from "@/lib/db/types";

describe("isOutstanding", () => {
  it.each(["OPEN", "IN_PROGRESS", "RESOLVED"] as DefectStatus[])("counts %s as still needing work", (status) => {
    expect(isOutstanding(status)).toBe(true);
  });

  it("counts RESOLVED as outstanding, because nobody has agreed it is fixed yet", () => {
    // The whole point of a snag list is that somebody else looks. Treating
    // "the person who fixed it says it is fixed" as done lets the list empty
    // itself.
    expect(isOutstanding("RESOLVED")).toBe(true);
  });

  it("counts only CLOSED as done", () => {
    expect(isOutstanding("CLOSED")).toBe(false);
  });
});

describe("canTransition", () => {
  it("allows the ordinary path", () => {
    expect(canTransition("OPEN", "IN_PROGRESS")).toBe(true);
    expect(canTransition("IN_PROGRESS", "RESOLVED")).toBe(true);
    expect(canTransition("RESOLVED", "CLOSED")).toBe(true);
  });

  it("allows a resolved defect to be pushed back", () => {
    // Someone signing it off has to be able to disagree, or the second pair
    // of eyes is decorative.
    expect(canTransition("RESOLVED", "OPEN")).toBe(true);
    expect(canTransition("RESOLVED", "IN_PROGRESS")).toBe(true);
  });

  it.each(["OPEN", "IN_PROGRESS", "RESOLVED"] as DefectStatus[])("refuses to reopen a closed defect as %s", (to) => {
    // closed_at and closed_by_name would be left describing an event that is
    // no longer true. Raise a new defect instead.
    expect(canTransition("CLOSED", to)).toBe(false);
  });

  it("treats a no-op as allowed, so a PATCH that resends the status is not an error", () => {
    expect(canTransition("CLOSED", "CLOSED")).toBe(true);
  });
});

describe("isOverdue", () => {
  const today = "2026-07-29";

  it("is true past the due date while still open", () => {
    expect(isOverdue({ dueDate: "2026-07-28", status: "OPEN" }, today)).toBe(true);
  });

  it("is false on the due date itself — you have until the end of the day", () => {
    expect(isOverdue({ dueDate: today, status: "OPEN" }, today)).toBe(false);
  });

  it("is false once closed, however late it was", () => {
    expect(isOverdue({ dueDate: "2020-01-01", status: "CLOSED" }, today)).toBe(false);
  });

  it("is true for a resolved defect past its date, because it is not signed off", () => {
    expect(isOverdue({ dueDate: "2026-07-01", status: "RESOLVED" }, today)).toBe(true);
  });

  it("is false with no due date — undated is not late", () => {
    expect(isOverdue({ dueDate: null, status: "OPEN" }, today)).toBe(false);
  });
});

describe("defectPhotoUrls", () => {
  it("returns both sets, because forgetting the second orphans the objects", () => {
    expect(
      defectPhotoUrls({ photos: ["/a.jpg", "/b.jpg"], resolutionPhotos: ["/fixed.jpg"] }),
    ).toEqual(["/a.jpg", "/b.jpg", "/fixed.jpg"]);
  });

  it("survives either side being missing", () => {
    expect(defectPhotoUrls({})).toEqual([]);
    expect(defectPhotoUrls({ photos: null, resolutionPhotos: undefined })).toEqual([]);
  });
});

describe("todayInOrgTimezone", () => {
  it("uses the workspace timezone, not the server's", () => {
    // 2026-07-29T22:30Z is already the 30th in Kuching (UTC+8). A server in
    // UTC would mark work overdue up to eight hours early.
    const lateEvening = new Date("2026-07-29T22:30:00Z");
    expect(todayInOrgTimezone(lateEvening)).toBe("2026-07-30");
    expect(todayInOrgTimezone(lateEvening, "UTC")).toBe("2026-07-29");
  });

  it("produces the shape a Postgres DATE compares against", () => {
    expect(todayInOrgTimezone()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
