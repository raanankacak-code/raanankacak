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

const { listActiveWorkersForOrgViaSession } = await import("@/lib/db/workers");

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  const chain = {
    eq: eqMock,
    order: orderMock,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
  eqMock.mockReturnValue(chain);
  queryResult = { data: [], error: null };
  orderMock.mockReturnValue({ range: () => Promise.resolve(queryResult) });
  selectMock.mockReturnValue(chain);
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listActiveWorkersForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listActiveWorkersForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("workers");
  });

  it("still applies the org_id and active filters as defense in depth alongside RLS", async () => {
    await listActiveWorkersForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
    expect(eqMock).toHaveBeenCalledWith("active", true);
  });

  it("adds the optional project_id filter when provided", async () => {
    await listActiveWorkersForOrgViaSession("org-A", "project-1");

    expect(eqMock).toHaveBeenCalledWith("project_id", "project-1");
  });

  it("propagates a query error instead of swallowing it", async () => {
    queryResult = { data: null, error: new Error("query failed") };

    await expect(listActiveWorkersForOrgViaSession("org-A")).rejects.toThrow(
      "query failed",
    );
  });
});
