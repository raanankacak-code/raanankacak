import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const gteMock = vi.fn();
const lteMock = vi.fn();
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

const { listReportsViaSession } = await import("@/lib/db/reports");

function makeChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: Record<string, unknown> = { then: (resolve: (v: typeof result) => void) => resolve(result) };
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.gte = gteMock.mockImplementation(() => chain);
  chain.lte = lteMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
  // List queries are explicitly capped now, so the chain has to accept it.
  chain.limit = vi.fn(() => chain);
  return chain;
}

beforeEach(() => {
  eqMock.mockReset();
  gteMock.mockReset();
  lteMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  const chain = makeChain();
  selectMock.mockReturnValue(chain);
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listReportsViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listReportsViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("daily_reports");
  });

  it("still applies the org_id filter as defense in depth alongside RLS", async () => {
    await listReportsViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("applies the optional projectId/from/to filters when provided", async () => {
    await listReportsViaSession("org-A", { projectId: "project-1", from: "2026-07-01", to: "2026-07-31" });

    expect(eqMock).toHaveBeenCalledWith("project_id", "project-1");
    expect(gteMock).toHaveBeenCalledWith("date", "2026-07-01");
    expect(lteMock).toHaveBeenCalledWith("date", "2026-07-31");
  });

  it("propagates a query error instead of swallowing it", async () => {
    const chain = makeChain({ data: null, error: new Error("query failed") });
    selectMock.mockReturnValue(chain);

    await expect(listReportsViaSession("org-A")).rejects.toThrow("query failed");
  });
});
