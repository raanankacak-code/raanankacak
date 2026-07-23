import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getRequestByIdMock = vi.fn();
const transitionRequestMock = vi.fn();
const notifyMock = vi.fn();
const recordAuditEventMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/materials", () => ({
  getRequestById: getRequestByIdMock,
  transitionRequest: transitionRequestMock,
  deleteRequest: vi.fn(),
}));

vi.mock("@/lib/db/notifications", () => ({
  notify: notifyMock,
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

const { PATCH } = await import("@/app/api/materials/[id]/route");

const APPROVER: OrgMember = {
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

const EXISTING = { id: "req-1", orgId: "org-A", code: "MR-001", material: "Cement", status: "SUBMITTED" };

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/materials/req-1", { method: "PATCH", body: JSON.stringify(body) });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getRequestByIdMock.mockReset();
  transitionRequestMock.mockReset();
  notifyMock.mockReset();
  recordAuditEventMock.mockReset();
  requireMemberMock.mockResolvedValue(APPROVER);
  getRequestByIdMock.mockResolvedValue(EXISTING);
  notifyMock.mockResolvedValue(undefined);
});

describe("PATCH /api/materials/[id] audit logging", () => {
  it("records MATERIAL_REQUEST_APPROVED on approval", async () => {
    transitionRequestMock.mockResolvedValue({ ...EXISTING, status: "APPROVED" });

    await PATCH(patchRequest({ status: "APPROVED" }), paramsFor("req-1"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({ action: "MATERIAL_REQUEST_APPROVED", entityId: "req-1" }),
    );
  });

  it("records MATERIAL_REQUEST_REJECTED on rejection", async () => {
    transitionRequestMock.mockResolvedValue({ ...EXISTING, status: "REJECTED" });

    await PATCH(patchRequest({ status: "REJECTED" }), paramsFor("req-1"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({ action: "MATERIAL_REQUEST_REJECTED" }),
    );
  });

  it("does not log a plain SUBMITTED transition (not an approval decision)", async () => {
    getRequestByIdMock.mockResolvedValue({ ...EXISTING, status: "DRAFT" });
    transitionRequestMock.mockResolvedValue({ ...EXISTING, status: "SUBMITTED" });

    await PATCH(patchRequest({ status: "SUBMITTED" }), paramsFor("req-1"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
