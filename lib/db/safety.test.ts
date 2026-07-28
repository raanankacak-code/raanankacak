import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafetyInspectionItem } from "@/lib/db/types";

const eqMock = vi.fn();
const orderMock = vi.fn();
const rangeMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({ createClient: createSessionClientMock }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

const { listInspectionsForOrgViaSession, deriveOutcome, DEFAULT_LIST_LIMIT } = await import("@/lib/db/safety");

function makeChain(result: { data: unknown; error: unknown } = { data: [], error: null }) {
  const chain: Record<string, unknown> = { then: (resolve: (v: typeof result) => void) => resolve(result) };
  chain.eq = eqMock.mockImplementation(() => chain);
  chain.order = orderMock.mockImplementation(() => chain);
  chain.range = rangeMock.mockImplementation(() => chain);
  chain.gt = vi.fn(() => chain);
  return chain;
}

beforeEach(() => {
  for (const m of [eqMock, orderMock, rangeMock, selectMock, fromMock, createSessionClientMock]) m.mockReset();
  selectMock.mockReturnValue(makeChain());
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("deriveOutcome", () => {
  const item = (result: SafetyInspectionItem["result"]): SafetyInspectionItem => ({
    category: "PPE",
    item: "Hard hats",
    result,
  });

  it("passes when nothing failed", () => {
    expect(deriveOutcome([item("PASS"), item("PASS"), item("NA")])).toEqual({ outcome: "PASS", failedCount: 0 });
  });

  it("does not count N/A as a failure", () => {
    // An item that does not apply to this site is not a finding against it.
    expect(deriveOutcome([item("NA"), item("NA")])).toEqual({ outcome: "PASS", failedCount: 0 });
  });

  it("calls a handful of failures actions-required", () => {
    expect(deriveOutcome([item("FAIL"), item("PASS")])).toEqual({ outcome: "ACTIONS_REQUIRED", failedCount: 1 });
    expect(deriveOutcome(Array(4).fill(item("FAIL")))).toEqual({ outcome: "ACTIONS_REQUIRED", failedCount: 4 });
  });

  it("calls five or more a failure — that is a site that should stop", () => {
    expect(deriveOutcome(Array(5).fill(item("FAIL")))).toEqual({ outcome: "FAIL", failedCount: 5 });
  });

  it("is a pure function of the items, so a caller cannot dictate the outcome", () => {
    // The API schema refuses `outcome` on input; this is the other half of
    // that guarantee. A failing inspection can never be filed as a pass.
    const items = [item("FAIL"), item("PASS")];
    const withExtra = items.map((i) => ({ ...i, outcome: "PASS" }) as SafetyInspectionItem);
    expect(deriveOutcome(withExtra).outcome).toBe("ACTIONS_REQUIRED");
  });
});

describe("listInspectionsForOrgViaSession", () => {
  it("queries through the session-bound (RLS-subject) client", async () => {
    await listInspectionsForOrgViaSession("org-A");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("safety_inspections");
  });

  it("still filters on org_id as defence in depth alongside RLS", async () => {
    await listInspectionsForOrgViaSession("org-A");
    expect(eqMock).toHaveBeenCalledWith("org_id", "org-A");
  });

  it("leaves the filled-in checklist out of the list query", async () => {
    await listInspectionsForOrgViaSession("org-A");

    const columns = selectMock.mock.calls[0][0] as string;
    expect(columns).toContain("failed_count");
    // `items` is every checklist line with its notes — the largest column,
    // and nothing in the list renders it.
    expect(columns).not.toContain("items");
    expect(columns).not.toContain("notes");
  });

  it("breaks date ties on id, so paging cannot repeat or skip a row", async () => {
    // A site can be inspected twice in a day, so tied dates are ordinary.
    await listInspectionsForOrgViaSession("org-A");

    expect(orderMock).toHaveBeenNthCalledWith(1, "date", { ascending: false });
    expect(orderMock).toHaveBeenNthCalledWith(2, "id", { ascending: false });
  });

  it("asks for the requested page", async () => {
    await listInspectionsForOrgViaSession("org-A", { limit: 50, offset: 100 });
    expect(rangeMock).toHaveBeenCalledWith(100, 149);
  });

  it("defaults to the first page", async () => {
    await listInspectionsForOrgViaSession("org-A");
    expect(rangeMock).toHaveBeenCalledWith(0, DEFAULT_LIST_LIMIT - 1);
  });

  it("applies the project filter when given one", async () => {
    await listInspectionsForOrgViaSession("org-A", { projectId: "project-1" });
    expect(eqMock).toHaveBeenCalledWith("project_id", "project-1");
  });

  it("propagates a query error instead of swallowing it", async () => {
    selectMock.mockReturnValue(makeChain({ data: null, error: new Error("query failed") }));
    await expect(listInspectionsForOrgViaSession("org-A")).rejects.toThrow("query failed");
  });
});
