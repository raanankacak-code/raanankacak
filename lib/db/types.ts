export type Role =
  | "OWNER"
  | "ADMIN"
  | "PROJECT_MANAGER"
  | "SITE_SUPERVISOR"
  | "ENGINEER"
  | "QUANTITY_SURVEYOR"
  | "SAFETY_OFFICER"
  | "STOREKEEPER"
  | "FINANCE"
  | "VIEWER"
  // The client's own login. Not a member of staff: scoped to the projects
  // listed for them in project_access, and refused every internal route.
  | "CLIENT";

export type ProjectStatus = "PLANNING" | "ACTIVE" | "COMPLETED" | "ON_HOLD";

export type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT";

export type ReportStatus = "SUBMITTED" | "REVIEWED";

export interface Organization {
  id: string;
  name: string;
  shortName: string | null;
  ssmNumber: string | null;
  cidbNumber: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  description: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postcode: string | null;
  state: string | null;
  country: string;
  currency: string;
  timezone: string;
  logoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface OrgMember {
  id: string;
  orgId: string;
  userId: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  client: string | null;
  siteAddress: string | null;
  contractValue: number | null;
  startDate: Date | null;
  endDate: Date | null;
  status: ProjectStatus;
  progressPct: number;
  plannedPct: number;
  managerName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectWithWorkerCount extends Project {
  _count: { workers: number };
}

export interface ProjectWithWorkers extends Project {
  workers: Worker[];
}

export interface Worker {
  id: string;
  orgId: string;
  projectId: string;
  name: string;
  trade: string | null;
  dailyRate: number | null;
  icNumber: string | null;
  cidbNumber: string | null;
  cidbExpiry: Date | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceRecord {
  id: string;
  orgId: string;
  projectId: string;
  workerId: string;
  date: Date;
  status: AttendanceStatus;
  timeIn: string | null;
  timeOut: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyReport {
  id: string;
  orgId: string;
  projectId: string;
  date: Date;
  weather: string | null;
  manpower: Record<string, number> | null;
  workCompleted: string | null;
  delays: string | null;
  notes: string | null;
  photos: string[] | null;
  status: ReportStatus;
  submittedById: string;
  submittedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DailyReportWithProject extends DailyReport {
  project: { id: string; name: string };
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "WITHDRAWN";

/**
 * A sign-off: what was sent to the client, and what they said.
 *
 * decidedByName and decidedByEmail are copies taken at the moment of signing,
 * not a join — the account may later be renamed or removed, and "some uuid
 * approved this" is not evidence of anything.
 */
export interface ProjectApproval {
  id: string;
  orgId: string;
  projectId: string;
  code: string;
  title: string;
  description: string | null;
  photos: string[];
  status: ApprovalStatus;
  requestedById: string;
  requestedByName: string;
  requestedAt: Date;
  decidedByMemberId: string | null;
  decidedByName: string | null;
  decidedByEmail: string | null;
  decidedAt: Date | null;
  decisionComment: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InviteStatus = "PENDING" | "ACCEPTED" | "EXPIRED" | "CANCELLED";

export interface OrgInvite {
  id: string;
  orgId: string;
  token: string;
  name: string;
  email: string;
  role: Role;
  phone: string | null;
  department: string | null;
  projectIds: string[];
  status: InviteStatus;
  invitedByName: string;
  invitedAt: Date;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type MaterialRequestStatus = "DRAFT" | "SUBMITTED" | "APPROVED" | "REJECTED" | "ORDERED" | "DELIVERED";

export interface MaterialRequestEvent {
  id: string;
  requestId: string;
  state: MaterialRequestStatus;
  comment: string | null;
  actorName: string;
  createdAt: Date;
}

export interface MaterialRequest {
  id: string;
  orgId: string;
  projectId: string;
  code: string;
  material: string;
  qty: number;
  unit: string;
  neededBy: Date | null;
  justification: string | null;
  status: MaterialRequestStatus;
  receivedQty: number | null;
  requestedById: string;
  requestedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MaterialRequestWithTimeline extends MaterialRequest {
  timeline: MaterialRequestEvent[];
  project: { id: string; name: string };
}

export interface ProjectDocument {
  id: string;
  orgId: string;
  projectId: string;
  folder: string;
  name: string;
  url: string;
  sizeBytes: number;
  mimeType: string | null;
  uploadedById: string;
  uploadedByName: string;
  createdAt: Date;
}

export type CalendarEventType = "DEADLINE" | "DELIVERY" | "INSPECTION" | "MEETING" | "LEAVE" | "HOLIDAY";
export type CalendarEventPriority = "LOW" | "MEDIUM" | "HIGH";
export type CalendarEventStatus = "SCHEDULED" | "COMPLETED" | "CANCELLED";

export interface CalendarEvent {
  id: string;
  orgId: string;
  projectId: string | null;
  type: CalendarEventType;
  title: string;
  /** Plain YYYY-MM-DD (not a Date) — calendar grid logic compares/sorts these as strings. */
  date: string;
  time: string | null;
  endTime: string | null;
  priority: CalendarEventPriority;
  status: CalendarEventStatus;
  location: string | null;
  withWho: string | null;
  description: string | null;
  createdByName: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AppNotification {
  id: string;
  orgId: string;
  type: string;
  title: string;
  description: string | null;
  read: boolean;
  createdAt: Date;
}

export interface BugReport {
  id: string;
  ref: string;
  orgId: string;
  reportedByUserId: string;
  reportedByName: string;
  reportedByEmail: string;
  area: string;
  severity: string;
  description: string;
  steps: string | null;
  status: string;
  createdAt: Date;
}

/**
 * Everything the compliance trail records.
 *
 * Deliberately not "every write". Trivial personal writes — notification read
 * state, your own display name, bug reports — are excluded for the same
 * reason requireWritableMember excludes them: they are not changes to the
 * company's record, and burying a role change under a thousand
 * marked-as-read rows makes the trail worse, not better.
 *
 * The column is plain text with no CHECK constraint, so adding a value here
 * needs no migration.
 */
export type AuditAction =
  | "PROJECT_CREATED"
  | "PROJECT_CONTRACT_VALUE_CHANGED"
  | "PROJECT_DELETED"
  | "WORKER_ADDED"
  | "WORKER_RATE_CHANGED"
  | "WORKER_REMOVED"
  | "MATERIAL_REQUEST_CREATED"
  | "MATERIAL_REQUEST_APPROVED"
  | "MATERIAL_REQUEST_REJECTED"
  | "MATERIAL_REQUEST_ORDERED"
  | "MATERIAL_REQUEST_DELIVERED"
  | "MATERIAL_REQUEST_DELETED"
  | "REPORT_SUBMITTED"
  | "REPORT_REVIEWED"
  | "REPORT_DELETED"
  | "DOCUMENT_UPLOADED"
  | "DOCUMENT_DELETED"
  | "CALENDAR_EVENT_CREATED"
  | "CALENDAR_EVENT_UPDATED"
  | "CALENDAR_EVENT_DELETED"
  | "ATTENDANCE_RECORDED"
  | "SAFETY_INSPECTION_FILED"
  | "SAFETY_INSPECTION_CLOSED"
  | "SAFETY_INSPECTION_DELETED"
  | "SAFETY_PHOTO_ADDED"
  | "SAFETY_PHOTO_REMOVED"
  | "DEFECT_RAISED"
  | "DEFECT_UPDATED"
  | "DEFECT_CLOSED"
  | "DEFECT_DELETED"
  | "EQUIPMENT_REGISTERED"
  | "EQUIPMENT_UPDATED"
  | "EQUIPMENT_RETIRED"
  | "EQUIPMENT_DELETED"
  | "EQUIPMENT_USAGE_LOGGED"
  | "ORG_SETTINGS_CHANGED"
  | "SUBSCRIPTION_CHANGED"
  | "MEMBER_ROLE_CHANGED"
  | "MEMBER_DEACTIVATED"
  | "MEMBER_REACTIVATED"
  | "MEMBER_REMOVED"
  | "MEMBER_INVITED"
  | "APPROVAL_REQUESTED"
  | "APPROVAL_WITHDRAWN"
  | "APPROVAL_DECIDED"
  | "CLIENT_ACCESS_GRANTED"
  | "CLIENT_ACCESS_REVOKED"
  | "MEMBER_INVITE_REVOKED"
  | "MEMBER_INVITE_RESENT"
  | "MEMBER_JOINED";

export interface AuditLogEntry {
  id: string;
  orgId: string;
  actorMemberId: string | null;
  actorName: string;
  action: AuditAction;
  entityType: string;
  entityId: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
}

/**
 * Safety inspections.
 *
 * The checklist is stored as filled-in items rather than references to a
 * template, because a template changes and a compliance record must not. An
 * inspection filed in March has to still say what was actually checked in
 * March, even after someone edits the checklist in June.
 */
export type SafetyInspectionOutcome = "PASS" | "ACTIONS_REQUIRED" | "FAIL";
export type SafetyInspectionStatus = "OPEN" | "CLOSED";
export type SafetyItemResult = "PASS" | "FAIL" | "NA";

export interface SafetyInspectionItem {
  category: string;
  item: string;
  result: SafetyItemResult;
  note?: string;
  /**
   * Evidence for this specific finding. Attached per item rather than only to
   * the inspection, because "the scaffold on level 3" and "the blocked exit"
   * are different findings and a pile of photos at the bottom does not say
   * which is which.
   */
  photos?: string[];
}

export interface SafetyInspection {
  id: string;
  orgId: string;
  projectId: string;
  code: string;
  /** Plain YYYY-MM-DD — the date inspected, which is what a record is filed under. */
  date: string;
  inspectorId: string;
  inspectorName: string;
  outcome: SafetyInspectionOutcome;
  status: SafetyInspectionStatus;
  items: SafetyInspectionItem[];
  failedCount: number;
  notes: string | null;
  photos: string[];
  closedAt: Date | null;
  closedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type DefectSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type DefectStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Defect {
  id: string;
  orgId: string;
  projectId: string;
  code: string;
  title: string;
  /** Free text: "Blk A L3 U12", "north stair core". See supabase/schema.sql. */
  location: string | null;
  description: string | null;
  severity: DefectSeverity;
  status: DefectStatus;
  raisedById: string;
  raisedByName: string;
  assignedToId: string | null;
  assignedToName: string | null;
  /** Plain YYYY-MM-DD, or null when nobody has committed to a date. */
  dueDate: string | null;
  /** Evidence of the problem, attached when it was raised. */
  photos: string[];
  resolutionNotes: string | null;
  /** Evidence of the fix. The pair is what makes this a record and not a claim. */
  resolutionPhotos: string[];
  closedAt: Date | null;
  closedByName: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type EquipmentStatus = "ACTIVE" | "MAINTENANCE" | "IDLE" | "RETIRED";

export interface Equipment {
  id: string;
  orgId: string;
  /** null means it is in the yard rather than on a site. */
  projectId: string | null;
  code: string;
  name: string;
  type: string | null;
  registrationNo: string | null;
  /** Owned plant is serviced on hours; hired plant is invoiced on them. */
  owned: boolean;
  supplier: string | null;
  status: EquipmentStatus;
  lastServiceDate: string | null;
  nextServiceDate: string | null;
  /** Statutory (DOSH) inspection. Expiring means the machine must stop. */
  inspectionExpiry: string | null;
  notes: string | null;
  photos: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface EquipmentUsageLog {
  id: string;
  orgId: string;
  equipmentId: string;
  projectId: string | null;
  date: string;
  hours: number;
  operatorName: string | null;
  notes: string | null;
  loggedById: string;
  loggedByName: string;
  createdAt: Date;
}
