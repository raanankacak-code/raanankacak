import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const orderMock = vi.fn();
const limitMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { listNotificationsForOrgViaSession } = await import("@/lib/db/notifications");

function makeChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: Record<string, unknown> = { then: (resolve: (v: typeof result) => void) => resolve(result) };
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
  chain.limit = limitMock.mockImplementation(() => chain);
  return chain;
}

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  limitMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  selectMock.mockReturnValue(makeChain());
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listNotificationsForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listNotificationsForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("notifications");
  });

  it("still applies the org_id filter and default limit as defense in depth alongside RLS", async () => {
    await listNotificationsForOrgViaSession("org-A");

    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
    expect(limitMock).toHaveBeenCalledWith(50);
  });

  it("honors a custom limit", async () => {
    await listNotificationsForOrgViaSession("org-A", 10);

    expect(limitMock).toHaveBeenCalledWith(10);
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(makeChain({ data: null, error: new Error("query failed") }));

    await expect(listNotificationsForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });
});
