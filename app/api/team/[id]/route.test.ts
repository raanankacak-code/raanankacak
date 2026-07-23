import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getMemberByIdMock = vi.fn();
const updateMemberMock = vi.fn();
const removeMemberMock = vi.fn();
const countOwnersMock = vi.fn();
const recordAuditEventMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/team", () => ({
  getMemberById: getMemberByIdMock,
  updateMember: updateMemberMock,
  removeMember: removeMemberMock,
  countOwners: countOwnersMock,
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

const { PATCH, DELETE } = await import("@/app/api/team/[id]/route");

const ME: OrgMember = {
  id: "member-me",
  orgId: "org-A",
  userId: "user-me",
  name: "Owner Person",
  email: "owner@org-a.test",
  role: "OWNER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const TARGET: OrgMember = {
  id: "member-target",
  orgId: "org-A",
  userId: "user-target",
  name: "Jane Supervisor",
  email: "jane@org-a.test",
  role: "SITE_SUPERVISOR",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/team/member-target", { method: "PATCH", body: JSON.stringify(body) });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getMemberByIdMock.mockReset();
  updateMemberMock.mockReset();
  removeMemberMock.mockReset();
  countOwnersMock.mockReset();
  recordAuditEventMock.mockReset();
  requireMemberMock.mockResolvedValue(ME);
  getMemberByIdMock.mockResolvedValue(TARGET);
  countOwnersMock.mockResolvedValue(2);
});

describe("PATCH /api/team/[id] audit logging", () => {
  it("records MEMBER_ROLE_CHANGED when the role actually changes", async () => {
    updateMemberMock.mockResolvedValue({ ...TARGET, role: "PROJECT_MANAGER" });

    await PATCH(patchRequest({ role: "PROJECT_MANAGER" }), paramsFor("member-target"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({ action: "MEMBER_ROLE_CHANGED", entityId: "member-target" }),
    );
  });

  it("records MEMBER_DEACTIVATED when active flips to false", async () => {
    updateMemberMock.mockResolvedValue({ ...TARGET, active: false });

    await PATCH(patchRequest({ active: false }), paramsFor("member-target"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({ action: "MEMBER_DEACTIVATED" }),
    );
  });

  it("records MEMBER_REACTIVATED when active flips back to true", async () => {
    getMemberByIdMock.mockResolvedValue({ ...TARGET, active: false });
    updateMemberMock.mockResolvedValue({ ...TARGET, active: true });

    await PATCH(patchRequest({ active: true }), paramsFor("member-target"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({ action: "MEMBER_REACTIVATED" }),
    );
  });

  it("does not log anything when only the display name changes", async () => {
    updateMemberMock.mockResolvedValue({ ...TARGET, name: "Jane S." });

    await PATCH(patchRequest({ name: "Jane S." }), paramsFor("member-target"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/team/[id] audit logging", () => {
  it("records MEMBER_REMOVED with the removed member's role and email", async () => {
    await DELETE(new Request("http://localhost/api/team/member-target", { method: "DELETE" }), paramsFor("member-target"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({
        action: "MEMBER_REMOVED",
        entityId: "member-target",
        metadata: { removedRole: "SITE_SUPERVISOR", removedEmail: "jane@org-a.test" },
      }),
    );
  });
});
