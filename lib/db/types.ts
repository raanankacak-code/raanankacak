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
  | "VIEWER";

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
