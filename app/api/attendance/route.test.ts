import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getProjectByIdMock = vi.fn();
const listActiveWorkersForProjectMock = vi.fn();
const listWorkerIdsForProjectMock = vi.fn();
const listAttendanceForProjectDateMock = vi.fn();
const upsertAttendanceRecordsMock = vi.fn();
const notifyMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/projects", () => ({
  getProjectById: getProjectByIdMock,
}));

vi.mock("@/lib/db/workers", () => ({
  listActiveWorkersForProject: listActiveWorkersForProjectMock,
  listWorkerIdsForProject: listWorkerIdsForProjectMock,
}));

vi.mock("@/lib/db/attendance", () => ({
  listAttendanceForProjectDate: listAttendanceForProjectDateMock,
  upsertAttendanceRecords: upsertAttendanceRecordsMock,
}));

vi.mock("@/lib/db/notifications", () => ({
  notify: notifyMock,
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
  listAttendanceForProjectDateMock.mockReset();
  upsertAttendanceRecordsMock.mockReset();
  notifyMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
  getProjectByIdMock.mockResolvedValue(PROJECT_A);
  notifyMock.mockResolvedValue(undefined);
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
