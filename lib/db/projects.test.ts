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

const { listProjectsForOrgViaSession } = await import("@/lib/db/projects");

beforeEach(() => {
  eqMock.mockReset();
  orderMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  orderMock.mockResolvedValue({ data: [], error: null });
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
    orderMock.mockResolvedValue({ data: null, error: new Error("query failed") });

    await expect(listProjectsForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });
});
