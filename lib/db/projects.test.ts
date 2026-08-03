import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const orderMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();
// The list functions page with .range(); order() now returns the pager's
// entry point rather than the rows themselves.
let queryResult: { data: unknown; error: unknown };

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { listProjectsForOrgViaSession } = await import("@/lib/db/projects");

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  queryResult = { data: [], error: null };
  // order() is chainable — the paged reads add an id tiebreaker after the
  // primary sort — and range() ends the chain.
  const ordered: Record<string, unknown> = {
    range: () => Promise.resolve(queryResult),
  };
  ordered.order = () => ordered;
  orderMock.mockReturnValue(ordered);
  eqMock.mockReturnValue({ order: orderMock });
  selectMock.mockReturnValue({ eq: eqMock });
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listProjectsForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    // The whole point of this pilot: this function must use the cookie-bound
    // client from lib/supabase/server, which runs as the signed-in user's
    // own session and is therefore subject to RLS — unlike createAdminClient,
    // which bypasses it entirely.
    await listProjectsForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("projects");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await listProjectsForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("propagates a query error instead of swallowing it", async () => {
    queryResult = { data: null, error: new Error("query failed") };

    await expect(listProjectsForOrgViaSession("org-A")).rejects.toThrow(
      "query failed",
    );
  });
});
