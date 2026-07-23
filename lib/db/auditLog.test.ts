import { beforeEach, describe, expect, it, vi } from "vitest";

function makeFakeAdminClient(response: { data: unknown; error: unknown } = { data: null, error: null }) {
  const insertMock = vi.fn(async () => response);
  const selectResult = { data: response.data, error: response.error };
  const builder: Record<string, unknown> = {};
  builder.insert = insertMock;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(async () => selectResult);
  return { from: vi.fn(() => builder), _insertMock: insertMock, _builder: builder };
}

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { recordAuditEvent, listAuditLogForOrg } = await import("@/lib/db/auditLog");

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("recordAuditEvent", () => {
  it("inserts a row with the org id, actor identity and action supplied by the caller", async () => {
    const fake = makeFakeAdminClient({ data: null, error: null });
    createAdminClientMock.mockReturnValue(fake);

    await recordAuditEvent("org-A", {
      actorMemberId: "member-1",
      actorName: "Owner",
      action: "MEMBER_ROLE_CHANGED",
      entityType: "org_member",
      entityId: "member-2",
      summary: "Changed Jane's role from VIEWER to SITE_SUPERVISOR",
      metadata: { from: "VIEWER", to: "SITE_SUPERVISOR" },
    });

    expect(fake._insertMock).toHaveBeenCalledWith({
      org_id: "org-A",
      actor_member_id: "member-1",
      actor_name: "Owner",
      action: "MEMBER_ROLE_CHANGED",
      entity_type: "org_member",
      entity_id: "member-2",
      summary: "Changed Jane's role from VIEWER to SITE_SUPERVISOR",
      metadata: { from: "VIEWER", to: "SITE_SUPERVISOR" },
    });
  });

  it("throws if the insert fails, instead of silently dropping the event", async () => {
    const fake = makeFakeAdminClient({ data: null, error: new Error("db down") });
    createAdminClientMock.mockReturnValue(fake);

    await expect(
      recordAuditEvent("org-A", {
        actorMemberId: "member-1",
        actorName: "Owner",
        action: "MEMBER_REMOVED",
        entityType: "org_member",
        summary: "Removed a member",
      }),
    ).rejects.toThrow("db down");
  });
});

describe("listAuditLogForOrg", () => {
  it("maps rows back into AuditLogEntry objects", async () => {
    const row = {
      id: "log-1",
      org_id: "org-A",
      actor_member_id: "member-1",
      actor_name: "Owner",
      action: "WORKER_RATE_CHANGED",
      entity_type: "worker",
      entity_id: "worker-1",
      summary: "Changed daily rate from RM150 to RM160",
      metadata: { from: 150, to: 160 },
      created_at: "2026-07-19T00:00:00.000Z",
    };
    createAdminClientMock.mockReturnValue(makeFakeAdminClient({ data: [row], error: null }));

    const result = await listAuditLogForOrg("org-A");

    expect(result).toEqual([
      {
        id: "log-1",
        orgId: "org-A",
        actorMemberId: "member-1",
        actorName: "Owner",
        action: "WORKER_RATE_CHANGED",
        entityType: "worker",
        entityId: "worker-1",
        summary: "Changed daily rate from RM150 to RM160",
        metadata: { from: 150, to: 160 },
        createdAt: new Date("2026-07-19T00:00:00.000Z"),
      },
    ]);
  });
});
