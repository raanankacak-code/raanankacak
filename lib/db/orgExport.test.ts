import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: createAdminClientMock }));

const { buildOrgExport } = await import("@/lib/db/orgExport");

/**
 * Rows held per table, and a fake query builder that serves them the way
 * PostgREST does: a `range()` window, and never more than 1000 rows for a
 * request that does not ask for one.
 *
 * The 1000 is the point of these tests. It is a real server-side cap, not a
 * client option, so a mock that returns everything in one go would let the
 * truncation bug pass unnoticed — which is exactly what happened.
 */
const MAX_ROWS = 1000;
let tables: Record<string, Record<string, unknown>[]>;
let rangeCalls: { table: string; from: number; to: number }[];

function builderFor(table: string) {
  const rows = () => tables[table] ?? [];
  let filtered: () => Record<string, unknown>[] = rows;

  const chain: Record<string, unknown> = {
    select: () => chain,
    eq: () => chain,
    in: (_column: string, values: string[]) => {
      const previous = filtered;
      filtered = () => previous().filter((r) => values.includes(r.request_id as string));
      return chain;
    },
    order: () => chain,
    maybeSingle: async () => ({ data: filtered()[0] ?? null, error: null }),
    range: (from: number, to: number) => {
      rangeCalls.push({ table, from, to });
      const window = filtered().slice(from, to + 1);
      return Promise.resolve({ data: window.slice(0, MAX_ROWS), error: null });
    },
    then: (resolve: (v: unknown) => void) =>
      // No range asked for: the server caps it.
      resolve({ data: filtered().slice(0, MAX_ROWS), error: null }),
  };
  return chain;
}

beforeEach(() => {
  tables = {};
  rangeCalls = [];
  createAdminClientMock.mockReset();
  createAdminClientMock.mockReturnValue({ from: (table: string) => builderFor(table) });
});

function seed(table: string, count: number, extra: (i: number) => Record<string, unknown> = () => ({})) {
  tables[table] = Array.from({ length: count }, (_, i) => ({ id: `${table}-${i}`, ...extra(i) }));
}

describe("buildOrgExport", () => {
  it("exports every row of a table that runs past the 1000-row cap", async () => {
    // A workspace passes 1000 attendance records within its first months, so
    // this is the ordinary case, not an extreme one. Truncating here hands a
    // customer a file that says it is their data and is missing most of it.
    seed("attendance_records", 2500);

    const result = await buildOrgExport("org-1");

    expect(result.attendance).toHaveLength(2500);
  });

  it("returns rows in one unbroken sequence, with nothing dropped or repeated", async () => {
    seed("audit_log", 2100);

    const result = await buildOrgExport("org-1");

    expect(result.auditLog.map((r) => r.id)).toEqual(
      Array.from({ length: 2100 }, (_, i) => `audit_log-${i}`),
    );
  });

  it("orders by id, without which range paging is not stable", async () => {
    // Postgres does not promise a consistent order between two unordered
    // queries, so paging one would silently duplicate some rows and skip
    // others — a corrupt export that still looks plausible.
    const orderMock = vi.fn();
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        const chain = builderFor(table) as Record<string, unknown>;
        chain.order = (...args: unknown[]) => {
          orderMock(...args);
          return chain;
        };
        return chain;
      },
    });
    seed("workers", 3);

    await buildOrgExport("org-1");

    expect(orderMock).toHaveBeenCalledWith("id", { ascending: true });
  });

  it("stops paging a table as soon as a short page comes back", async () => {
    seed("workers", 5);

    await buildOrgExport("org-1");

    expect(rangeCalls.filter((c) => c.table === "workers")).toHaveLength(1);
  });

  it("pages material_request_events too, and chunks the ids it filters on", async () => {
    // These hang off material_requests rather than the org, and the id list
    // goes into the URL — thousands at once would be rejected outright.
    seed("material_requests", 450);
    tables.material_request_events = Array.from({ length: 1200 }, (_, i) => ({
      id: `event-${i}`,
      request_id: `material_requests-${i % 450}`,
    }));

    const result = await buildOrgExport("org-1");

    expect(result.materialRequestEvents).toHaveLength(1200);
    const chunks = rangeCalls.filter((c) => c.table === "material_request_events");
    expect(chunks.length).toBeGreaterThan(1);
  });

  it("skips the events query entirely when there are no material requests", async () => {
    await buildOrgExport("org-1");

    expect(rangeCalls.some((c) => c.table === "material_request_events")).toBe(false);
  });

  it("still redacts invite tokens", async () => {
    tables.org_invites = [{ id: "invite-1", token: "secret-bearer-token", email: "a@b.com" }];

    const result = await buildOrgExport("org-1");

    expect(result.invites[0].token).toBe("[redacted]");
  });

  it("throws rather than returning a partial export when a page fails", async () => {
    createAdminClientMock.mockReturnValue({
      from: (table: string) => {
        const chain = builderFor(table) as Record<string, unknown>;
        if (table === "workers") {
          chain.range = async () => ({ data: null, error: { message: "read failed" } });
        }
        return chain;
      },
    });

    await expect(buildOrgExport("org-1")).rejects.toThrow("read failed");
  });
});
