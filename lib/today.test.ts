import { describe, expect, it } from "vitest";

const { todayInOrgTimezone, shiftDays, daysAgoInOrgTimezone, daysAheadInOrgTimezone, orgDateOf } =
  await import("@/lib/today");

/** What the deleted `todayISO()` helpers did: the server's UTC date. */
const utcDate = (d: Date) => d.toISOString().slice(0, 10);

describe("todayInOrgTimezone", () => {
  it("is a day ahead of UTC through the Kuching small hours", () => {
    // 00:30 in Kuching is still the previous day in UTC. This eight-hour
    // window is when the dashboard used to show yesterday's attendance,
    // report count and calendar under today's heading — and when a report
    // filed first thing would have been dated to the day before.
    const at0030Kuching = new Date("2026-08-10T16:30:00Z");

    expect(todayInOrgTimezone(at0030Kuching)).toBe("2026-08-11");
    expect(utcDate(at0030Kuching)).toBe("2026-08-10");
  });

  it("agrees with UTC once Kuching passes 08:00", () => {
    const at0900Kuching = new Date("2026-08-11T01:00:00Z");

    expect(todayInOrgTimezone(at0900Kuching)).toBe("2026-08-11");
    expect(utcDate(at0900Kuching)).toBe("2026-08-11");
  });

  it("disagrees with UTC for exactly the eight hours before 08:00 local", () => {
    const disagreeing = Array.from({ length: 24 }, (_, h) => new Date(Date.UTC(2026, 7, 10, h, 30)))
      .filter((d) => todayInOrgTimezone(d) !== utcDate(d));

    expect(disagreeing).toHaveLength(8);
  });

  it("rolls over at local midnight, not at UTC midnight", () => {
    expect(todayInOrgTimezone(new Date("2026-08-10T15:59:59Z"))).toBe("2026-08-10");
    expect(todayInOrgTimezone(new Date("2026-08-10T16:00:00Z"))).toBe("2026-08-11");
  });

  it("honours a timezone other than the default", () => {
    const noon = new Date("2026-08-10T12:00:00Z");

    expect(todayInOrgTimezone(noon, "Pacific/Kiritimati")).toBe("2026-08-11");
    expect(todayInOrgTimezone(noon, "Pacific/Midway")).toBe("2026-08-10");
  });
});

describe("shiftDays", () => {
  it("moves whole calendar days", () => {
    expect(shiftDays("2026-08-10", 1)).toBe("2026-08-11");
    expect(shiftDays("2026-08-10", -1)).toBe("2026-08-09");
    expect(shiftDays("2026-08-10", 0)).toBe("2026-08-10");
  });

  it("crosses month and year boundaries", () => {
    expect(shiftDays("2026-08-31", 1)).toBe("2026-09-01");
    expect(shiftDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("handles a leap day", () => {
    expect(shiftDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(shiftDays("2028-03-01", -1)).toBe("2028-02-29");
  });

  it("survives a shift long enough to cross a DST change elsewhere", () => {
    // Anchored at noon UTC precisely so a zone's clock change cannot push
    // the result onto the wrong calendar day.
    expect(shiftDays("2026-03-01", 30)).toBe("2026-03-31");
    expect(shiftDays("2026-11-01", -30)).toBe("2026-10-02");
  });
});

describe("daysAgo / daysAhead in the org timezone", () => {
  it("counts from the workspace's today, not the server's", () => {
    const at0030Kuching = new Date("2026-08-10T16:30:00Z");

    expect(daysAgoInOrgTimezone(6, at0030Kuching)).toBe("2026-08-05");
    expect(daysAheadInOrgTimezone(30, at0030Kuching)).toBe("2026-09-10");
  });

  it("is the same day for an offset of zero", () => {
    const now = new Date("2026-08-10T16:30:00Z");

    expect(daysAgoInOrgTimezone(0, now)).toBe(todayInOrgTimezone(now));
    expect(daysAheadInOrgTimezone(0, now)).toBe(todayInOrgTimezone(now));
  });
});

describe("orgDateOf", () => {
  it("dates an instant by the workspace's clock, not by slicing the ISO string", () => {
    // 00:30 on the 11th in Kuching. Slicing the ISO string gives the 10th,
    // which is how a notification that had just arrived came to be grouped
    // under Yesterday once "today" moved to the org timezone.
    const justNow = "2026-08-10T16:30:00.000Z";

    expect(orgDateOf(justNow)).toBe("2026-08-11");
    expect(justNow.slice(0, 10)).toBe("2026-08-10");
    expect(orgDateOf(justNow)).toBe(todayInOrgTimezone(new Date(justNow)));
  });

  it("accepts a Date as readily as a string", () => {
    const d = new Date("2026-08-10T16:30:00.000Z");

    expect(orgDateOf(d)).toBe(orgDateOf(d.toISOString()));
  });

  it("agrees with the sliced string outside the early-morning window", () => {
    const midAfternoon = "2026-08-11T06:00:00.000Z";

    expect(orgDateOf(midAfternoon)).toBe("2026-08-11");
    expect(midAfternoon.slice(0, 10)).toBe("2026-08-11");
  });
});
