import { Role } from "@/lib/db/types";

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  PROJECT_MANAGER: "Project Manager",
  SITE_SUPERVISOR: "Site Supervisor",
  ENGINEER: "Engineer",
  QUANTITY_SURVEYOR: "Quantity Surveyor",
  SAFETY_OFFICER: "Safety Officer",
  STOREKEEPER: "Storekeeper",
  FINANCE: "Finance",
  VIEWER: "Viewer",
};

export type Permission =
  | "manageProjects"
  | "deleteProjects"
  | "manageWorkers"
  | "submitReports"
  | "reviewReports"
  | "takeAttendance"
  | "manageOrg"
  | "manageUsers";

/** Baseline role -> permission matrix for the core site-ops workflow (Phase 1). */
const MATRIX: Record<Role, Permission[]> = {
  OWNER: [
    "manageProjects",
    "deleteProjects",
    "manageWorkers",
    "submitReports",
    "reviewReports",
    "takeAttendance",
    "manageOrg",
    "manageUsers",
  ],
  ADMIN: ["manageProjects", "manageWorkers", "manageOrg", "manageUsers"],
  PROJECT_MANAGER: [
    "manageProjects",
    "manageWorkers",
    "submitReports",
    "reviewReports",
    "takeAttendance",
  ],
  SITE_SUPERVISOR: ["submitReports", "takeAttendance"],
  ENGINEER: ["submitReports"],
  QUANTITY_SURVEYOR: [],
  SAFETY_OFFICER: ["submitReports"],
  STOREKEEPER: [],
  FINANCE: [],
  VIEWER: [],
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}
