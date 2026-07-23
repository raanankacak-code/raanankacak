import { describe, expect, it } from "vitest";
import { can, ROLE_LABELS, type Permission } from "@/lib/permissions";
import type { Role } from "@/lib/db/types";

const ALL_ROLES = Object.keys(ROLE_LABELS) as Role[];

const ALL_PERMISSIONS: Permission[] = [
  "manageProjects",
  "deleteProjects",
  "manageWorkers",
  "submitReports",
  "reviewReports",
  "viewReports",
  "takeAttendance",
  "manageOrg",
  "manageUsers",
  "updateProgress",
  "approveRequests",
  "submitRequests",
  "viewMaterials",
  "uploadDocs",
  "manageDocs",
  "costReports",
  "viewAuditLog",
];

describe("can()", () => {
  it("never throws for any known role/permission combination", () => {
    for (const role of ALL_ROLES) {
      for (const permission of ALL_PERMISSIONS) {
        expect(() => can(role, permission)).not.toThrow();
      }
    }
  });

  it("grants OWNER every permission (highest privilege role)", () => {
    for (const permission of ALL_PERMISSIONS) {
      expect(can("OWNER", permission)).toBe(true);
    }
  });

  it("restricts deleteProjects to OWNER only", () => {
    // Regression guard: deleting a project (and its reports/attendance/roster)
    // is the most destructive action in the app — must never widen silently.
    for (const role of ALL_ROLES) {
      expect(can(role, "deleteProjects")).toBe(role === "OWNER");
    }
  });

  it("restricts manageUsers to OWNER and ADMIN only", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "OWNER" || role === "ADMIN";
      expect(can(role, "manageUsers")).toBe(expected);
    }
  });

  it("restricts manageOrg to OWNER and ADMIN only", () => {
    for (const role of ALL_ROLES) {
      const expected = role === "OWNER" || role === "ADMIN";
      expect(can(role, "manageOrg")).toBe(expected);
    }
  });

  it("restricts viewAuditLog to OWNER and ADMIN only", () => {
    // The audit log carries compliance-sensitive detail (rate/contract
    // changes, who removed whom) — must stay limited to the same roles
    // trusted with company administration.
    for (const role of ALL_ROLES) {
      const expected = role === "OWNER" || role === "ADMIN";
      expect(can(role, "viewAuditLog")).toBe(expected);
    }
  });

  it("keeps VIEWER strictly read-only", () => {
    const readOnlyAllowed: Permission[] = ["viewReports", "viewMaterials"];
    for (const permission of ALL_PERMISSIONS) {
      expect(can("VIEWER", permission)).toBe(readOnlyAllowed.includes(permission));
    }
  });

  it("falls back to false for an unrecognized role instead of throwing", () => {
    // Defensive check: a corrupted/unmigrated DB row should fail closed, not
    // crash or silently grant access.
    expect(can("NOT_A_REAL_ROLE" as Role, "manageProjects")).toBe(false);
  });
});
