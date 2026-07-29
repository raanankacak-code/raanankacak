import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { countWorkspaceContents, recordWorkspaceDeletion } = await import("@/lib/db/deletedWorkspaces");

/** Records what each table was asked for, and answers with a fixed count. */
function stubDatabase(counts: Record<string, number>) {
  const seen: { table: string; head: boolean; orgId: string }[] = [];
  const from = vi.fn((table: string) => ({
    select: (_cols: string, opts: { count?: string; head?: boolean } = {}) => ({
      eq: (_col: string, orgId: string) => {
        seen.push({ table, head: opts.head === true, orgId });
        return Promise.resolve({ count: counts[table] ?? 0, error: null });
      },
    }),
  }));
  return { from, seen };
}

/** Storage pages of `size` objects each, so paging can be exercised. */
function stubStorage(pages: { name: string; metadata?: { size: number } }[][]) {
  const list = vi.fn(async (_prefix: string, opts: { limit: number; offset: number }) => {
    const index = opts.offset / opts.limit;
    return { data: pages[index] ?? [], error: null };
  });
  return { from: () => ({ list }), list };
}

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("countWorkspaceContents", () => {
  it("counts without reading a single row of content", async () => {
    const db = stubDatabase({ org_members: 4, projects: 2, workers: 30, daily_reports: 118 });
    createAdminClientMock.mockReturnValue({ ...db, storage: stubStorage([[]]) });

    const result = await countWorkspaceContents("org-1");

    expect(result).toMatchObject({ memberCount: 4, projectCount: 2, workerCount: 30, reportCount: 118 });
    // head: true means PostgREST returns the count and no rows. A workspace
    // being deleted can hold tens of thousands of records and the user is
    // waiting on this.
    expect(db.seen.every((s) => s.head), "a count query fetched rows").toBe(true);
    expect(db.seen.every((s) => s.orgId === "org-1"), "a count escaped the org filter").toBe(true);
  });

  it("pages through storage instead of trusting the first 100", async () => {
    // list() caps at 100 by default. A silent cap gives a number that is
    // wrong but entirely plausible, which is the worst kind.
    const full = Array.from({ length: 100 }, (_, i) => ({ name: `f${i}.jpg`, metadata: { size: 10 } }));
    const rest = [{ name: "last.jpg", metadata: { size: 5 } }];
    createAdminClientMock.mockReturnValue({
      ...stubDatabase({}),
      storage: stubStorage([full, rest]),
    });

    const result = await countWorkspaceContents("org-1");

    expect(result.storageObjectCount).toBe(101);
    expect(result.storageBytes).toBe(100 * 10 + 5);
  });

  it("treats an object with no size metadata as zero rather than NaN", async () => {
    createAdminClientMock.mockReturnValue({
      ...stubDatabase({}),
      storage: stubStorage([[{ name: "mystery.bin" }]]),
    });

    const result = await countWorkspaceContents("org-1");

    expect(result.storageObjectCount).toBe(1);
    expect(result.storageBytes).toBe(0);
  });

  it("fails loudly when a count fails, rather than recording a zero", async () => {
    const from = vi.fn(() => ({
      select: () => ({ eq: () => Promise.resolve({ count: null, error: { message: "boom" } }) }),
    }));
    createAdminClientMock.mockReturnValue({ from, storage: stubStorage([[]]) });

    // A silent zero here would be worse than an error: the record would say
    // an empty workspace was deleted, which is a false statement of fact.
    await expect(countWorkspaceContents("org-1")).rejects.toThrow(/Failed to count/);
  });
});

describe("recordWorkspaceDeletion", () => {
  const contents = {
    memberCount: 4,
    projectCount: 2,
    workerCount: 30,
    reportCount: 118,
    storageObjectCount: 9,
    storageBytes: 1234,
  };

  function stubUpsert(error: unknown = null) {
    const upsert = vi.fn((_row: Record<string, unknown>, _opts: { onConflict: string }) =>
      Promise.resolve({ error }),
    );
    createAdminClientMock.mockReturnValue({ from: vi.fn(() => ({ upsert })) });
    return upsert;
  }

  it("writes who, what and how much, through the admin client", async () => {
    const upsert = stubUpsert();

    await recordWorkspaceDeletion({
      orgId: "org-1",
      orgName: "Bina Sdn Bhd",
      deletedByUserId: "user-1",
      deletedByEmail: "owner@bina.my",
      deletedByName: "Azlan",
      plan: "PROFESSIONAL",
      contents,
    });

    const [row] = upsert.mock.calls[0];
    expect(row).toMatchObject({
      org_id: "org-1",
      org_name: "Bina Sdn Bhd",
      deleted_by_email: "owner@bina.my",
      deleted_by_name: "Azlan",
      plan: "PROFESSIONAL",
      member_count: 4,
      report_count: 118,
      storage_bytes: 1234,
    });
  });

  it("upserts on org_id, so a retry after a failed deletion does not collide", async () => {
    const upsert = stubUpsert();

    await recordWorkspaceDeletion({
      orgId: "org-1",
      orgName: "Bina Sdn Bhd",
      deletedByUserId: "user-1",
      deletedByEmail: "owner@bina.my",
      deletedByName: "Azlan",
      plan: null,
      contents,
    });

    expect(upsert.mock.calls[0][1]).toEqual({ onConflict: "org_id" });
  });

  it("throws if the record cannot be written", async () => {
    stubUpsert({ message: "permission denied" });

    // The caller deletes the workspace next. If this is swallowed, the
    // deletion proceeds with no record — the exact hole being closed.
    await expect(
      recordWorkspaceDeletion({
        orgId: "org-1",
        orgName: "Bina Sdn Bhd",
        deletedByUserId: "user-1",
        deletedByEmail: "owner@bina.my",
        deletedByName: "Azlan",
        plan: null,
        contents,
      }),
    ).rejects.toThrow(/permission denied/);
  });
});
