import { describe, expect, it } from "vitest";
import {
  APPROVAL_STATUSES,
  APPROVAL_STATUS_BADGE,
  APPROVAL_STATUS_LABELS,
  canDecide,
  canWithdraw,
  decisionCommentProblem,
  isAwaitingClient,
  isDecided,
  signOffLine,
} from "@/lib/approvals";
import type { ApprovalStatus } from "@/lib/db/types";

describe("what a client may do", () => {
  it("can approve or reject something still waiting on them", () => {
    expect(canDecide("PENDING", "APPROVED")).toBe(true);
    expect(canDecide("PENDING", "REJECTED")).toBe(true);
  });

  it("cannot decide something already decided", () => {
    // The point of a sign-off record: nothing that was signed can be quietly
    // re-signed, and a rejection stays on the record.
    for (const already of ["APPROVED", "REJECTED", "WITHDRAWN"] as ApprovalStatus[]) {
      expect(canDecide(already, "APPROVED"), `${already} could be approved again`).toBe(false);
      expect(canDecide(already, "REJECTED"), `${already} could be rejected again`).toBe(false);
    }
  });

  it("cannot put a request back to pending or withdraw it", () => {
    // Withdrawal is the contractor's, not the client's, and "un-deciding" is
    // nobody's.
    expect(canDecide("PENDING", "PENDING")).toBe(false);
    expect(canDecide("PENDING", "WITHDRAWN")).toBe(false);
  });
});

describe("what the contractor may do", () => {
  it("can withdraw a request the client has not answered", () => {
    expect(canWithdraw("PENDING")).toBe(true);
  });

  it("cannot withdraw one that has been decided", () => {
    // Otherwise a rejection could be made to disappear, which is exactly the
    // thing this record exists to prevent.
    expect(canWithdraw("REJECTED")).toBe(false);
    expect(canWithdraw("APPROVED")).toBe(false);
    expect(canWithdraw("WITHDRAWN")).toBe(false);
  });
});

describe("a rejection says why", () => {
  it("refuses a rejection with no comment", () => {
    expect(decisionCommentProblem("REJECTED", "")).toMatch(/what is wrong/i);
    expect(decisionCommentProblem("REJECTED", "   ")).toMatch(/what is wrong/i);
    expect(decisionCommentProblem("REJECTED", undefined)).toMatch(/what is wrong/i);
  });

  it("accepts a rejection that does", () => {
    expect(decisionCommentProblem("REJECTED", "Tiling to the lobby is not the specified finish.")).toBeNull();
  });

  it("lets an approval be wordless", () => {
    expect(decisionCommentProblem("APPROVED", "")).toBeNull();
    expect(decisionCommentProblem("APPROVED", undefined)).toBeNull();
  });

  it("caps the length either way", () => {
    expect(decisionCommentProblem("APPROVED", "x".repeat(2001))).toMatch(/2000/);
  });
});

describe("status helpers", () => {
  it("knows what is still waiting on the client", () => {
    expect(isAwaitingClient("PENDING")).toBe(true);
    expect(isAwaitingClient("APPROVED")).toBe(false);
    expect(isAwaitingClient("WITHDRAWN")).toBe(false);
  });

  it("counts a rejection as decided, because it is", () => {
    expect(isDecided("REJECTED")).toBe(true);
    expect(isDecided("APPROVED")).toBe(true);
    expect(isDecided("PENDING")).toBe(false);
    // Withdrawn is not a decision — the client never answered.
    expect(isDecided("WITHDRAWN")).toBe(false);
  });

  it("has a label and a badge for every status", () => {
    for (const status of APPROVAL_STATUSES) {
      expect(APPROVAL_STATUS_LABELS[status], `no label for ${status}`).toBeTruthy();
      expect(APPROVAL_STATUS_BADGE[status], `no badge for ${status}`).toBeTruthy();
    }
  });
});

describe("the line that goes on the record", () => {
  it("names the person and the date", () => {
    expect(
      signOffLine({ status: "APPROVED", decidedByName: "Sarawak Energy", decidedAt: new Date("2026-08-14T02:15:00Z") }),
    ).toBe("Approved by Sarawak Energy on 14 August 2026");
  });

  it("says rejected when it was rejected", () => {
    expect(
      signOffLine({ status: "REJECTED", decidedByName: "Sarawak Energy", decidedAt: new Date("2026-08-14T02:15:00Z") }),
    ).toMatch(/^Rejected by/);
  });

  it("says nothing about a request nobody has answered", () => {
    expect(signOffLine({ status: "PENDING", decidedByName: null, decidedAt: null })).toBeNull();
  });

  it("says nothing when the row is half-filled, rather than inventing a signature", () => {
    // The CHECK constraint in the schema makes this state unreachable through
    // the database; this is the belt to that pair of braces.
    expect(signOffLine({ status: "APPROVED", decidedByName: null, decidedAt: new Date() })).toBeNull();
    expect(signOffLine({ status: "APPROVED", decidedByName: "Someone", decidedAt: null })).toBeNull();
  });
});
