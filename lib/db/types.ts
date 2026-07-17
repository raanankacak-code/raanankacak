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
