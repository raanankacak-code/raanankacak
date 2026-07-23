import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const getWorkerByIdMock = vi.fn();
const updateWorkerMock = vi.fn();
const recordAuditEventMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock };
});

vi.mock("@/lib/db/workers", () => ({
  getWorkerById: getWorkerByIdMock,
  updateWorker: updateWorkerMock,
  deleteWorker: vi.fn(),
}));

vi.mock("@/lib/db/auditLog", () => ({
  recordAuditEvent: recordAuditEventMock,
}));

const { PATCH } = await import("@/app/api/workers/[id]/route");

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

const WORKER = { id: "worker-1", orgId: "org-A", name: "Ali bin Hassan", dailyRate: 150 };

function patchRequest(body: unknown) {
  return new Request("http://localhost/api/workers/worker-1", { method: "PATCH", body: JSON.stringify(body) });
}

function paramsFor(id: string) {
  return { params: Promise.resolve({ id }) };
}

beforeEach(() => {
  requireMemberMock.mockReset();
  getWorkerByIdMock.mockReset();
  updateWorkerMock.mockReset();
  recordAuditEventMock.mockReset();
  requireMemberMock.mockResolvedValue(MEMBER);
  getWorkerByIdMock.mockResolvedValue(WORKER);
});

describe("PATCH /api/workers/[id] audit logging", () => {
  it("records WORKER_RATE_CHANGED when dailyRate changes", async () => {
    updateWorkerMock.mockResolvedValue({ ...WORKER, dailyRate: 160 });

    await PATCH(patchRequest({ dailyRate: 160 }), paramsFor("worker-1"));

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      "org-A",
      expect.objectContaining({
        action: "WORKER_RATE_CHANGED",
        entityId: "worker-1",
        metadata: { from: 150, to: 160 },
      }),
    );
  });

  it("does not log when dailyRate is submitted but unchanged", async () => {
    updateWorkerMock.mockResolvedValue({ ...WORKER, dailyRate: 150 });

    await PATCH(patchRequest({ dailyRate: 150 }), paramsFor("worker-1"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("does not log when unrelated fields change", async () => {
    updateWorkerMock.mockResolvedValue({ ...WORKER, trade: "Electrician" });

    await PATCH(patchRequest({ trade: "Electrician" }), paramsFor("worker-1"));

    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});
