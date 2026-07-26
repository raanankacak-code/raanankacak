import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getProjectByIdMock = vi.fn();
const listActiveWorkersForProjectMock = vi.fn();
const listWorkerIdsForProjectMock = vi.fn();
const listAttendanceForProjectDateViaSessionMock = vi.fn();
const upsertAttendanceRecordsMock = vi.fn();
const notifyMock = vi.fn();
const recordMemberActionMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return {
    ...actual,
    requireMember: requireMemberMock,
    // Mutation handlers use the write-gated variant; route through the same
    // mock so these tests stay focused on their own concern, not billing.
    requireWritableMember: requireMemberMock,
  };
});

vi.mock("@/lib/db/projects", () => ({
  getProjectById: getProjectByIdMock,
}));

vi.mock("@/lib/db/workers", () => ({
  listActiveWorkersForProject: listActiveWorkersForProjectMock,
  listWorkerIdsForProject: listWorkerIdsForProjectMock,
}));

vi.mock("@/lib/db/attendance", () => ({
  listAttendanceForProjectDateViaSession: listAttendanceForProjectDateViaSessionMock,
  upsertAttendanceRecords: upsertAttendanceRecordsMock,
}));

vi.mock("@/lib/db/notifications", () => ({
  notify: notifyMock,
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordMemberAction: recordMemberActionMock,
}));

const { PUT } = await import("@/app/api/attendance/route");

const MEMBER: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Org A Supervisor",
  email: "supervisor@org-a.test",
  role: "SITE_SUPERVISOR",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT_A = { id: "project-A", orgId: "org-A", name: "Riverside Phase 2" };

function putRequest(body: unknown) {
  return new Request("http://localhost/api/attendance", {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getProjectByIdMock.mockReset();
  listActiveWorkersForProjectMock.mockReset();
  listWorkerIdsForProjectMock.mockReset();
  listAttendanceForProjectDateViaSessionMock.mockReset();
  upsertAttendanceRecordsMock.mockReset();
  notifyMock.mockReset();
  recordMemberActionMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
  getProjectByIdMock.mockResolvedValue(PROJECT_A);
  notifyMock.mockResolvedValue(undefined);
});

describe("PUT /api/attendance audit logging", () => {
  it("records who marked attendance, for which day, and the present/absent split", async () => {
    // Attendance is what payroll is computed from, so a wage dispute comes
    // down to exactly this: who said what about which day.
    listWorkerIdsForProjectMock.mockResolvedValue(new Set(["w-1", "w-2", "w-3"]));
    upsertAttendanceRecordsMock.mockResolvedValue([]);

    await PUT(
      putRequest({
        projectId: "project-A",
        date: "2026-07-19",
        records: [
          { workerId: "w-1", status: "PRESENT" },
          { workerId: "w-2", status: "HALF_DAY" },
          { workerId: "w-3", status: "ABSENT" },
        ],
      }),
    );

    expect(recordMemberActionMock).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({
        action: "ATTENDANCE_RECORDED",
        entityType: "attendance",
        // A half day counts as turning up, the same way the notification counts it.
        metadata: { date: "2026-07-19", projectId: "project-A", present: 2, absent: 1, total: 3 },
      }),
    );
  });

  it("records nothing when the write was rejected", async () => {
    listWorkerIdsForProjectMock.mockResolvedValue(new Set(["w-1"]));

    await PUT(
      putRequest({
        projectId: "project-A",
        date: "2026-07-19",
        records: [{ workerId: "worker-from-org-B", status: "PRESENT" }],
      }),
    );

    expect(recordMemberActionMock).not.toHaveBeenCalled();
  });
});

describe("PUT /api/attendance", () => {
  it("rejects a worker id that does not belong to the project, and never writes it", async () => {
    // Regression test: attendance_records has a unique(worker_id, date)
    // constraint, so upserting a foreign worker id could silently overwrite
    // another org's existing attendance row for that worker+date.
    listWorkerIdsForProjectMock.mockResolvedValue(new Set(["worker-legit"]));

    const res = await PUT(
      putRequest({
        projectId: "project-A",
        date: "2026-07-19",
        records: [{ workerId: "worker-from-org-B", status: "PRESENT" }],
      }),
    );

    expect(res.status).toBe(400);
    expect(upsertAttendanceRecordsMock).not.toHaveBeenCalled();
  });

  it("accepts records whose worker ids all belong to the project", async () => {
    listWorkerIdsForProjectMock.mockResolvedValue(new Set(["worker-legit-1", "worker-legit-2"]));
    upsertAttendanceRecordsMock.mockResolvedValue([{ id: "rec-1" }]);

    const res = await PUT(
      putRequest({
        projectId: "project-A",
        date: "2026-07-19",
        records: [
          { workerId: "worker-legit-1", status: "PRESENT" },
          { workerId: "worker-legit-2", status: "ABSENT" },
        ],
      }),
    );

    expect(res.status).toBe(200);
    expect(upsertAttendanceRecordsMock).toHaveBeenCalledWith(
      "org-A",
      "project-A",
      "2026-07-19",
      expect.any(Array),
    );
  });

  it("returns 404 without writing anything when the project isn't in the caller's org", async () => {
    getProjectByIdMock.mockResolvedValue(null);

    const res = await PUT(
      putRequest({
        projectId: "project-not-mine",
        date: "2026-07-19",
        records: [{ workerId: "worker-1", status: "PRESENT" }],
      }),
    );

    expect(res.status).toBe(404);
    expect(listWorkerIdsForProjectMock).not.toHaveBeenCalled();
    expect(upsertAttendanceRecordsMock).not.toHaveBeenCalled();
  });
});
