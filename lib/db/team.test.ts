import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Minimal fake of the chainable supabase-js query builder, enough to drive
 * acceptInvite()'s two reads/writes (org_invites select, org_members insert,
 * org_invites update) without touching a real database.
 */
function makeFakeAdminClient(
  responsesByTable: Record<string, unknown>,
  /** Rows returned when a query is awaited directly (no .single/.maybeSingle),
   *  e.g. acceptInvite's "does this account already have a membership?" check. */
  listResponsesByTable: Record<string, unknown[]> = {},
) {
  function chain(table: string) {
    const builder: Record<string, unknown> = {
      then: (resolve: (v: { data: unknown[]; error: null }) => void) =>
        resolve({ data: listResponsesByTable[table] ?? [], error: null }),
    };
    const methods = ["select", "eq", "insert", "update"];
    for (const m of methods) {
      builder[m] = vi.fn(() => builder);
    }
    builder.maybeSingle = vi.fn(async () => ({
      data: responsesByTable[table],
      error: null,
    }));
    builder.single = vi.fn(async () => ({
      data: responsesByTable[table],
      error: null,
    }));
    return builder;
  }
  return { from: vi.fn((table: string) => chain(table)) };
}

const createAdminClientMock = vi.fn();
const createSessionClientMock = vi.fn();
const eqMock = vi.fn();
const orderMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

const {
  acceptInvite,
  listMembersForOrgViaSession,
  listInvitesForOrgViaSession,
  createInvite,
} = await import("@/lib/db/team");

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

function makeChain(
  result: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
  return chain;
}

beforeEach(() => {
  createAdminClientMock.mockReset();
  createSessionClientMock.mockReset();
  eqMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();

  selectMock.mockReturnValue(makeChain());
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("acceptInvite", () => {
  it("rejects when the signed-in account's email does not match the invite's email", async () => {
    // Regression test: the invite token is a bearer credential. Without this
    // check, anyone who obtained a valid token (forwarded link, browser
    // history, etc.) could join the org under a completely different account.
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({
        org_invites: inviteRow(),
        org_members: memberRow(),
      }),
    );

    await expect(
      acceptInvite("tok-abc", {
        userId: "user-attacker",
        email: "attacker@evil.test",
      }),
    ).rejects.toThrow("This invitation was sent to a different email address");
  });

  it("matches email case-insensitively", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({
        org_invites: inviteRow(),
        org_members: memberRow(),
      }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "JANE@ORG-A.TEST" }),
    ).resolves.toMatchObject({ member: { email: "jane@org-a.test" } });
  });

  it("still rejects an already-accepted invitation", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({
        org_invites: inviteRow({ status: "ACCEPTED" }),
        org_members: memberRow(),
      }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).rejects.toThrow("This invitation is no longer valid");
  });

  it("still rejects an expired invitation, even with a matching email", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient({
        org_invites: inviteRow({
          expires_at: new Date(NOW - 1000).toISOString(),
        }),
        org_members: memberRow(),
      }),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).rejects.toThrow("This invitation has expired");
  });
});

describe("acceptInvite: one workspace per account", () => {
  it("refuses when the account already belongs to a workspace", async () => {
    // Verified against the real database: a second org_members row makes
    // getMemberByUserId's maybeSingle() fail with PGRST116 on every
    // authenticated request, locking the account out unrecoverably.
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient(
        { org_invites: inviteRow(), org_members: memberRow() },
        { org_members: [{ id: "existing-membership" }] },
      ),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).rejects.toThrow("already belongs to a company workspace");
  });

  it("still accepts when the account has no membership yet", async () => {
    createAdminClientMock.mockReturnValue(
      makeFakeAdminClient(
        { org_invites: inviteRow(), org_members: memberRow() },
        { org_members: [] },
      ),
    );

    await expect(
      acceptInvite("tok-abc", { userId: "user-1", email: "jane@org-a.test" }),
    ).resolves.toMatchObject({ member: { email: "jane@org-a.test" } });
  });
});

describe("listMembersForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listMembersForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("org_members");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await listMembersForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(
      makeChain({ data: null, error: new Error("query failed") }),
    );

    await expect(listMembersForOrgViaSession("org-A")).rejects.toThrow(
      "query failed",
    );
  });
});

describe("listInvitesForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listInvitesForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(createAdminClientMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("org_invites");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await listInvitesForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(
      makeChain({ data: null, error: new Error("query failed") }),
    );

    await expect(listInvitesForOrgViaSession("org-A")).rejects.toThrow(
      "query failed",
    );
  });
});

describe("invite token strength", () => {
  it("issues a token with enough entropy to resist guessing", async () => {
    // The public lookup endpoint trades a token for the invitee's name,
    // email, role and company name, so a guessable token is a PII
    // disclosure. An earlier scheme used 4 random bytes (32 bits).
    const captured: string[] = [];
    createAdminClientMock.mockReturnValue({
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.insert = vi.fn((row: { token: string }) => {
          captured.push(row.token);
          return builder;
        });
        builder.select = vi.fn(() => builder);
        builder.single = vi.fn(async () => ({
          data: inviteRow(),
          error: null,
        }));
        return builder;
      },
    });

    await createInvite("org-A", {
      name: "Jane",
      email: "jane@org-a.test",
      role: "ENGINEER",
      invitedByName: "Owner",
    });

    const token = captured[0];
    const random = token.replace(/^BW-/, "");
    // 32 random bytes in base64url -> 43 chars. Anything near the old
    // 8-hex-character token should fail this.
    expect(random.length).toBeGreaterThanOrEqual(40);
  });

  it("does not repeat a token across invites", async () => {
    const captured: string[] = [];
    createAdminClientMock.mockReturnValue({
      from: () => {
        const builder: Record<string, unknown> = {};
        builder.insert = vi.fn((row: { token: string }) => {
          captured.push(row.token);
          return builder;
        });
        builder.select = vi.fn(() => builder);
        builder.single = vi.fn(async () => ({
          data: inviteRow(),
          error: null,
        }));
        return builder;
      },
    });

    const input = {
      name: "Jane",
      email: "jane@org-a.test",
      role: "ENGINEER" as const,
      invitedByName: "Owner",
    };
    await createInvite("org-A", input);
    await createInvite("org-A", input);

    expect(captured[0]).not.toBe(captured[1]);
  });
});
