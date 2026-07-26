import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getProjectByIdMock = vi.fn();
const getProjectWithWorkersMock = vi.fn();
const updateProjectMock = vi.fn();
const recordAuditEventMock = vi.fn();
const recordMemberActionMock = vi.fn();
const listDocumentsForProjectMock = vi.fn();
const listReportsMock = vi.fn();

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
  getProjectWithWorkers: getProjectWithWorkersMock,
  updateProject: updateProjectMock,
  deleteProject: vi.fn(),
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordAuditEvent: recordAuditEventMock,
  recordMemberAction: recordMemberActionMock,
}));

vi.mock("@/lib/db/documents", () => ({
  listDocumentsForProject: listDocumentsForProjectMock,
}));

vi.mock("@/lib/db/reports", () => ({
  listReports: listReportsMock,
}));

vi.mock("@/lib/uploads", () => ({
  removeObjectsByUrl: vi.fn(),
}));

const { PATCH, DELETE } = await import("@/app/api/projects/[id]/route");

const MEMBER: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Owner Person",
  email: "owner@org-a.test",
  role: "OWNER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const PROJECT = { id: "project-1", orgId: "org-A", name: "Riverside Phase 2", contractValue: 4_500_000 };

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/projects/project-1", { method: "PATCH", body: JSON.stringify(body) });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getProjectByIdMock.mockReset();
  updateProjectMock.mockReset();
  recordAuditEventMock.mockReset();
  recordMemberActionMock.mockReset();
  listDocumentsForProjectMock.mockReset();
  listReportsMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
  getProjectByIdMock.mockResolvedValue(PROJECT);
  listDocumentsForProjectMock.mockResolvedValue([]);
  listReportsMock.mockResolvedValue([]);
});

describe("DELETE /api/projects/[id] audit logging", () => {
  it("records what the cascade took with it, not just that a project went", async () => {
    listDocumentsForProjectMock.mockResolvedValue([
      { url: "https://x/doc-a.pdf" },
      { url: "https://x/doc-b.pdf" },
    ]);
    listReportsMock.mockResolvedValue([
      { photos: ["https://x/p1.jpg"] },
      { photos: [] },
      { photos: ["https://x/p2.jpg", "https://x/p3.jpg"] },
    ]);

    await DELETE(new Request("http://localhost/api/projects/project-1", { method: "DELETE" }), paramsFor("project-1"));

    expect(recordMemberActionMock).toHaveBeenCalledWith(
      MEMBER,
      expect.objectContaining({
        action: "PROJECT_DELETED",
        entityType: "project",
        entityId: "project-1",
        metadata: { name: "Riverside Phase 2", reports: 3, documents: 2, files: 5 },
      }),
    );
    // The summary is what a person actually reads in the audit table.
    expect(recordMemberActionMock.mock.calls[0][1].summary).toContain("Riverside Phase 2");
    expect(recordMemberActionMock.mock.calls[0][1].summary).toContain("3 daily reports");
  });

  it("records nothing when the project was not there to delete", async () => {
    getProjectByIdMock.mockResolvedValue(null);

    const res = await DELETE(
      new Request("http://localhost/api/projects/nope", { method: "DELETE" }),
      paramsFor("nope"),
    );

    expect(res.status).toBe(404);
    expect(recordMemberActionMock).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/projects/[id] audit logging", () => {
  it("records PROJECT_CONTRACT_VALUE_CHANGED when the contract value changes", async () => {
    updateProjectMock.mockResolvedValue({ ...PROJECT, contractValue: 5_000_000 });

    await PATCH(patchRequest({ contractValue: 5_000_000 }), paramsFor("project-1"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({
        action: "PROJECT_CONTRACT_VALUE_CHANGED",
        entityId: "project-1",
        metadata: { from: 4_500_000, to: 5_000_000 },
      }),
    );
  });

  it("does not log when contractValue is submitted but unchanged", async () => {
    updateProjectMock.mockResolvedValue({ ...PROJECT });

    await PATCH(patchRequest({ contractValue: 4_500_000 }), paramsFor("project-1"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("does not log when unrelated fields change", async () => {
    updateProjectMock.mockResolvedValue({ ...PROJECT, status: "ACTIVE" });

    await PATCH(patchRequest({ status: "ACTIVE" }), paramsFor("project-1"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
