import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getProjectByIdMock = vi.fn();
const getProjectWithWorkersMock = vi.fn();
const updateProjectMock = vi.fn();
const recordAuditEventMock = vi.fn();

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
}));

const { PATCH } = await import("@/app/api/projects/[id]/route");

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
  requireMemberMock.mockResolvedValue(MEMBER);
  getProjectByIdMock.mockResolvedValue(PROJECT);
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
