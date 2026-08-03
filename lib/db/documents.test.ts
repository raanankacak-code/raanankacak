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

const { listDocumentsForProjectViaSession } =
  await import("@/lib/db/documents");

function makeChain(
  result: { data: unknown; error: unknown } = { data: [], error: null },
) {
  const chain: Record<string, unknown> = {
    then: (resolve: (v: typeof result) => void) => resolve(result),
  };
  // The list functions page with .range(); a short page ends the loop,
  // so one call returning the whole fixture is a faithful stand-in.
  chain.range = () => Promise.resolve(result);
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
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

describe("listDocumentsForProjectViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listDocumentsForProjectViaSession("project-1");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("documents");
  });

  it("still applies the project_id filter as defense in depth alongside RLS", async () => {
    await listDocumentsForProjectViaSession("project-1");

    expect(eqMock).toHaveBeenCalledWith("project_id", "project-1");
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(
      makeChain({ data: null, error: new Error("query failed") }),
    );

    await expect(
      listDocumentsForProjectViaSession("project-1"),
    ).rejects.toThrow("query failed");
  });
});
