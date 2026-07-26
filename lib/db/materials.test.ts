import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const orderMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { listRequestsForOrgViaSession } = await import("@/lib/db/materials");

function makeChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: Record<string, unknown> = { then: (resolve: (v: typeof result) => void) => resolve(result) };
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
  // List queries are explicitly capped now, so the chain has to accept it.
  chain.limit = vi.fn(() => chain);
  return chain;
}

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  selectMock.mockReturnValue(makeChain());
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listRequestsForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listRequestsForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("material_requests");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await listRequestsForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(makeChain({ data: null, error: new Error("query failed") }));

    await expect(listRequestsForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });
});
