import { describe, expect, it } from "vitest";
import { can, ROLE_LABELS, ROLE_META, type Permission } from "@/lib/permissions";
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

describe("manageCalendar", () => {
  it("is granted only to the roles that run the schedule", () => {
    for (const role of ["OWNER", "ADMIN", "PROJECT_MANAGER", "SITE_SUPERVISOR"] as const) {
      expect(can(role, "manageCalendar"), role).toBe(true);
    }
  });

  it("is withheld from every read-oriented and specialist role", () => {
    // Verified live before this existed: with no permission check on the
    // calendar routes, a Viewer could create, edit and delete the whole
    // company's calendar despite being documented as having no editing
    // rights.
    for (const role of [
      "VIEWER",
      "FINANCE",
      "QUANTITY_SURVEYOR",
      "SAFETY_OFFICER",
      "STOREKEEPER",
      "ENGINEER",
    ] as const) {
      expect(can(role, "manageCalendar"), role).toBe(false);
    }
  });
});

describe("VIEWER is genuinely read-only", () => {
  it("holds no permission that mutates company data", () => {
    const mutating = [
      "manageProjects",
      "deleteProjects",
      "manageWorkers",
      "submitReports",
      "reviewReports",
      "takeAttendance",
      "manageOrg",
      "manageUsers",
      "updateProgress",
      "approveRequests",
      "submitRequests",
      "uploadDocs",
      "manageDocs",
      "manageCalendar",
    ] as const;

    for (const permission of mutating) {
      expect(can("VIEWER", permission), permission).toBe(false);
    }
  });
});

describe("document permissions", () => {
  it("lets the Project Manager handle project documents", () => {
    // The original prototype's matrix gave an Engineer uploadDocs but left
    // the Project Manager — who runs the project end to end — unable to
    // upload a drawing at all. Deliberately diverged from.
    expect(can("PROJECT_MANAGER", "uploadDocs")).toBe(true);
    expect(can("PROJECT_MANAGER", "manageDocs")).toBe(true);
  });

  it("keeps Engineer able to upload but not to remove other people's documents", () => {
    expect(can("ENGINEER", "uploadDocs")).toBe(true);
    expect(can("ENGINEER", "manageDocs")).toBe(false);
  });

  it("does not hand document access to roles that had none", () => {
    for (const role of [
      "SITE_SUPERVISOR",
      "QUANTITY_SURVEYOR",
      "SAFETY_OFFICER",
      "STOREKEEPER",
      "FINANCE",
      "VIEWER",
    ] as const) {
      expect(can(role, "uploadDocs"), role).toBe(false);
      expect(can(role, "manageDocs"), role).toBe(false);
    }
  });
});

/**
 * The role descriptions shown in the Team UI are the only place the app
 * explains what a role is for, and they were written from the prototype's
 * ambitions rather than from the matrix below them. The Safety Officer
 * promised safety inspections, incident reports and toolbox meetings — three
 * features that do not exist. The Storekeeper promised inventory and stock
 * levels, also absent, and "receive material requests", which needs
 * approveRequests and it does not have. Finance promised to process payments;
 * there is no payments feature.
 *
 * A wrong permission is caught by the tests above. A wrong *description* is
 * caught by nobody, because it breaks no code — it only misleads whoever is
 * choosing which role to give a new employee.
 */
describe("role descriptions describe features that exist", () => {
  // Nothing in the app does any of these. If one is built, remove it here.
  const ABSENT_FEATURES = [
    "inventory",
    "stock level",
    "safety inspection",
    "incident report",
    "toolbox",
    "process payment",
    "defect",
    "snag",
    "equipment log",
  ];

  it.each(Object.entries(ROLE_META))("%s claims nothing the app cannot do", (role, meta) => {
    const text = [meta.desc, ...meta.resp].join(" ").toLowerCase();
    for (const feature of ABSENT_FEATURES) {
      expect(text, `${role} mentions "${feature}", which the app does not have`).not.toContain(feature);
    }
  });

  it("does not tell an Owner to give a client the Viewer role", () => {
    // A Viewer reads every project in the org, so handing it to a client
    // shows them every other client's work. The description used to
    // recommend exactly that.
    const viewer = [ROLE_META.VIEWER.desc, ...ROLE_META.VIEWER.resp].join(" ").toLowerCase();
    expect(viewer).toContain("every project");
    expect(viewer).not.toMatch(/read-only access for clients/);
  });

  it("only claims approval or review work for roles that can actually do it", () => {
    for (const [role, meta] of Object.entries(ROLE_META)) {
      const text = [meta.desc, ...meta.resp].join(" ").toLowerCase();
      if (/\bapprove\b|\breject\b/.test(text)) {
        expect(can(role as Role, "approveRequests"), `${role} claims approval`).toBe(true);
      }
      if (/take .*attendance|record attendance/.test(text)) {
        expect(can(role as Role, "takeAttendance"), `${role} claims attendance`).toBe(true);
      }
      if (/cost report/.test(text)) {
        expect(can(role as Role, "costReports"), `${role} claims cost reports`).toBe(true);
      }
      if (/upload .*(document|drawing)/.test(text)) {
        expect(can(role as Role, "uploadDocs"), `${role} claims uploads`).toBe(true);
      }
    }
  });
});
