import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const orderMock = vi.fn();
const rangeMock = vi.fn();
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
  // Paged list queries use range() rather than limit().
  chain.range = rangeMock.mockImplementation(() => chain);
  return chain;
}

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  rangeMock.mockReset();
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

  it("selects only the columns a list row renders, never the justification", async () => {
    await listRequestsForOrgViaSession("org-A");

    const columns = selectMock.mock.calls[0][0] as string;
    expect(columns).toContain("material");
    expect(columns).toContain("project:projects(id, name)");
    // Free text, by far the largest column, and never shown in the list.
    expect(columns).not.toContain("justification");
    expect(columns).not.toBe("*, project:projects(id, name)");
  });

  it("breaks created_at ties on id so offsets cannot repeat or skip a row", async () => {
    await listRequestsForOrgViaSession("org-A");

    expect(orderMock).toHaveBeenNthCalledWith(1, "created_at", { ascending: false });
    expect(orderMock).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("asks for the requested page rather than everything", async () => {
    await listRequestsForOrgViaSession("org-A", { limit: 50, offset: 100 });

    expect(rangeMock).toHaveBeenCalledWith(100, 149);
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(makeChain({ data: null, error: new Error("query failed") }));

    await expect(listRequestsForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });
});
