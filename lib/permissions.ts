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
  CLIENT: "Client",
};

export type Permission =
  | "manageProjects"
  | "deleteProjects"
  | "manageWorkers"
  | "submitReports"
  | "reviewReports"
  | "viewReports"
  | "takeAttendance"
  | "manageOrg"
  | "manageUsers"
  | "updateProgress"
  | "approveRequests"
  | "submitRequests"
  | "viewMaterials"
  | "uploadDocs"
  | "manageDocs"
  | "costReports"
  | "manageCalendar"
  | "submitInspections"
  | "closeInspections"
  | "raiseDefects"
  | "closeDefects"
  | "manageEquipment"
  | "logEquipmentUsage"
  | "viewAuditLog";

/** Role -> permission matrix, mirroring the BinaWorks design prototype's ROLE_PERMS. */
const MATRIX: Record<Role, Permission[]> = {
  OWNER: [
    "manageUsers",
    "manageProjects",
    "deleteProjects",
    "updateProgress",
    "approveRequests",
    "submitRequests",
    "submitReports",
    "reviewReports",
    "viewReports",
    "takeAttendance",
    "manageWorkers",
    "viewMaterials",
    "manageDocs",
    "uploadDocs",
    "costReports",
    "manageOrg",
    "manageCalendar",
    "submitInspections",
    "closeInspections",
    "raiseDefects",
    "closeDefects",
    "manageEquipment",
    "logEquipmentUsage",
    "viewAuditLog",
  ],
  ADMIN: [
    "manageUsers",
    "manageProjects",
    "updateProgress",
    "viewReports",
    "manageDocs",
    "uploadDocs",
    "manageOrg",
    "manageCalendar",
    "submitInspections",
    "closeInspections",
    "raiseDefects",
    "closeDefects",
    "manageEquipment",
    "logEquipmentUsage",
    "viewAuditLog",
  ],
  PROJECT_MANAGER: [
    "manageProjects",
    "updateProgress",
    "approveRequests",
    "reviewReports",
    "viewReports",
    "manageWorkers",
    "viewMaterials",
    "manageCalendar",
    // Deliberately beyond the original prototype's matrix: it gave an
    // Engineer uploadDocs but left the Project Manager — who runs the
    // project end to end — unable to add so much as a drawing. Documents
    // are part of running a project, so the PM gets the same level as Admin.
    "uploadDocs",
    "manageDocs",
    "submitInspections",
    "closeInspections",
    "raiseDefects",
    "closeDefects",
    "manageEquipment",
    "logEquipmentUsage",
  ],
  SITE_SUPERVISOR: [
    "submitReports",
    "takeAttendance",
    "submitRequests",
    "viewReports",
    "viewMaterials",
    "manageCalendar",
    "submitInspections",
    "raiseDefects",
    "logEquipmentUsage",
  ],
  ENGINEER: ["viewReports", "submitReports", "uploadDocs", "updateProgress", "raiseDefects", "logEquipmentUsage"],
  QUANTITY_SURVEYOR: ["viewMaterials", "costReports"],
  SAFETY_OFFICER: ["viewReports", "submitReports", "submitInspections", "closeInspections", "raiseDefects"],
  STOREKEEPER: ["viewMaterials", "submitRequests"],
  FINANCE: ["viewMaterials", "costReports"],
  VIEWER: ["viewReports", "viewMaterials"],
  // Deliberately empty. A client is not staff: every permission here gates an
  // internal feature, and the client portal is served by its own routes that
  // check project access explicitly. requireMember() refuses a CLIENT
  // outright unless a route opts in, so this matrix is the second lock
  // rather than the only one.
  CLIENT: [],
};

export const ROLE_META: Record<Role, { icon: string; badgeClass: string; desc: string; resp: string[] }> = {
  OWNER: { icon: "👑", badgeClass: "b-amber", desc: "The company account holder — unrestricted access to every module and setting.", resp: ["Oversee the whole company workspace", "Manage users, roles and invitations", "Create and delete projects", "Final say on approvals and costs"] },
  ADMIN: { icon: "🛡️", badgeClass: "b-purple", desc: "Back-office administrator who runs the workspace day to day on behalf of the Owner.", resp: ["Manage users and invitations", "Set up and maintain projects", "Keep company documents in order", "Review reporting across sites"] },
  PROJECT_MANAGER: { icon: "📋", badgeClass: "b-info", desc: "Runs one or more projects end to end — schedule, people and materials.", resp: ["Manage project setup and progress", "Approve or reject material requests", "Assign and manage workers", "Review daily site reports"] },
  SITE_SUPERVISOR: { icon: "👷", badgeClass: "b-ok", desc: "The eyes and hands on site — files the daily record from the field.", resp: ["Submit daily reports with photos", "Take worker attendance", "Raise material requests", "Flag delays and site issues"] },
  ENGINEER: { icon: "🛠", badgeClass: "b-teal", desc: "Monitors technical progress and keeps drawings and records current.", resp: ["Update project progress", "Submit daily reports", "Upload drawings and technical documents", "Review reporting across sites"] },
  QUANTITY_SURVEYOR: { icon: "📐", badgeClass: "b-purple", desc: "Keeps the numbers honest — quantities, materials and cost.", resp: ["Generate cost reports", "Track material movement", "Monitor budget vs progress"] },
  SAFETY_OFFICER: { icon: "🦺", badgeClass: "b-amber", desc: "Owns the site safety record — inspections, findings and close-out.", resp: ["File safety inspections with photo evidence", "Close inspections once findings are actioned", "Submit daily reports", "Review reports across every site"] },
  STOREKEEPER: { icon: "📦", badgeClass: "b-mut", desc: "Raises what the site needs and follows it through to delivery.", resp: ["Raise material requests", "Track requests through to delivery", "Review material history by project"] },
  FINANCE: { icon: "💰", badgeClass: "b-ok", desc: "Watches the cost picture — contract value, labour and materials.", resp: ["Generate per-project cost reports", "Track material spend", "Compare budget against progress"] },
  VIEWER: { icon: "👁️", badgeClass: "b-mut", desc: "Read-only access to reports and materials across every project.", resp: ["View reports and material requests", "No editing rights", "Sees all projects — not for a client who should only see their own"] },
  CLIENT: { icon: "🤝", badgeClass: "b-info", desc: "Your customer, with a login of their own — restricted to the projects you list for them.", resp: ["See progress on their own project only", "Read the site diary and its photos", "See the safety record and the snag list", "Cannot see costs, materials, workers, plant or any other project"] },
};

export const PERM_LABELS: [Permission, string][] = [
  ["manageUsers", "Manage Users"],
  ["manageProjects", "Manage Projects"],
  ["deleteProjects", "Delete Projects"],
  ["updateProgress", "Update Progress"],
  ["approveRequests", "Approve Material Requests"],
  ["submitRequests", "Submit Material Requests"],
  ["viewMaterials", "Track Materials"],
  ["submitReports", "Submit Daily Reports"],
  ["viewReports", "View Reports"],
  ["takeAttendance", "Take Attendance"],
  ["manageWorkers", "Manage Workers"],
  ["uploadDocs", "Upload Documents"],
  ["manageDocs", "Manage Documents"],
  ["costReports", "Cost Reports"],
  ["manageCalendar", "Manage Calendar"],
  ["submitInspections", "File Safety Inspections"],
  ["closeInspections", "Close Safety Inspections"],
  ["raiseDefects", "Raise Defects"],
  ["closeDefects", "Close Defects"],
  ["manageEquipment", "Manage Equipment"],
  ["logEquipmentUsage", "Log Equipment Usage"],
  ["viewAuditLog", "View Audit Log"],
];

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role]?.includes(permission) ?? false;
}

/**
 * A client account rather than a member of staff.
 *
 * Worth a named check rather than `role === "CLIENT"` scattered about: this
 * is the distinction the row-level security policies are built on, and it is
 * the one that must not be got wrong in two places and agree in neither.
 */
export function isClient(role: Role): boolean {
  return role === "CLIENT";
}

/** The roles an Owner or Admin can hand out from the Team page. */
export const ASSIGNABLE_ROLES: Role[] = (Object.keys(ROLE_LABELS) as Role[]).filter((r) => r !== "CLIENT");
