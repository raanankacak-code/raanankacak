import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal fake of the chainable supabase-js query builder, enough to drive
 * acceptInvite()'s two reads/writes (org_invites select, org_members insert,
 * org_invites update) without touching a real database.
 */
function makeFakeAdminClient(responsesByTable: Record<string, unknown>) {
  function chain(table: string) {
    const builder: Record<string, unknown> = {};
    const methods = ["select", "eq", "insert", "update"];
    for (const m of methods) {
      builder[m] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(async () => ({ data: responsesByTable[table], error: null }));
    builder.single = vi.fn(async () => ({ data: responsesByTable[table], error: null }));
    return builder;
  }
  return { from: vi.fn((table: string) => chain(table)) };
}

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { acceptInvite } = await import("@/lib/db/team");

const NOW = Date.now();

function inviteRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "invite-1",
    org_id: "org-A",
    token: "tok-abc",
    name: "Jane Contractor",
    email: "jane@org-a.test",
    role: "SITE_SUPERVISOR",
    phone: null,
    department: null,
    project_ids: null,
    status: "PENDING",
    invited_by_name: "Owner",
    invited_at: new Date(NOW - 1000).toISOString(),
    expires_at: new Date(NOW + 100000).toISOString(),
    accepted_at: null,
    ...overrides,
  };
}

function memberRow() {
  return {
    id: "member-1",
    org_id: "org-A",
    user_id: "user-1",
    name: "Jane Contractor",
    email: "jane@org-a.test",
    role: "SITE_SUPERVISOR",
    active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("acceptInvite", () => {
  it("rejects when the signed-in account's email does not match the invite's email", async () => {
    // Regression test: the invite token is a bearer credential. Without this
    // check, anyone who obtained a valid token (forwarded link, browser
    // history, etc.) could join the org under a completely different account.
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({ org_invites: inviteRow(), org_members: memberRow() }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-attacker", email: "attacker@evil.test" }),
    ).rejects.toThrow("This invitation was sent to a different email address");
  });

  it("matches email case-insensitively", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({ org_invites: inviteRow(), org_members: memberRow() }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "JANE@ORG-A.TEST" }),
    ).resolves.toMatchObject({ member: { email: "jane@org-a.test" } });
  });

  it("still rejects an already-accepted invitation", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({ org_invites: inviteRow({ status: "ACCEPTED" }), org_members: memberRow() }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).rejects.toThrow("This invitation is no longer valid");
  });

  it("still rejects an expired invitation, even with a matching email", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({
        org_invites: inviteRow({ expires_at: new Date(NOW - 1000).toISOString() }),
        org_members: memberRow(),
      }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).rejects.toThrow("This invitation has expired");
  });
});
