import { describe, expect, it, vi } from "vitest";

const { fetchAllRows, PAGE_SIZE } = await import("@/lib/db/paging");

/**
 * Serves rows the way PostgREST does: a range window, and never more than
 * PAGE_SIZE rows in one response.
 */
function server(total: number) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  const calls: { from: number; to: number }[] = [];
  const page = (from: number, to: number) => {
    calls.push({ from, to });
    const window = rows.slice(from, to + 1).slice(0, PAGE_SIZE);
    return Promise.resolve({ data: window, error: null });
  };
  return { page, calls };
}

describe("fetchAllRows", () => {
  it("returns everything for a result that fits in one page", async () => {
    const { page, calls } = server(10);

    expect(await fetchAllRows(page)).toHaveLength(10);
    expect(calls).toHaveLength(1);
  });

  it("keeps reading past the row cap", async () => {
    const { page } = server(PAGE_SIZE * 2 + 137);

    expect(await fetchAllRows(page)).toHaveLength(PAGE_SIZE * 2 + 137);
  });

  it("returns the rows in order, with none dropped or repeated", async () => {
    const { page } = server(PAGE_SIZE + 5);

    const rows = await fetchAllRows<{ id: number }>(page);

    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: PAGE_SIZE + 5 }, (_, i) => i),
    );
  });

  it("costs one request when the data is under the cap", async () => {
    // The common case must not pay for the rare one.
    const { page, calls } = server(PAGE_SIZE - 1);

    await fetchAllRows(page);

    expect(calls).toHaveLength(1);
  });

  it("stops on a full final page rather than looping forever", async () => {
    // Exactly PAGE_SIZE rows: the first page is full, so it asks once more
    // and gets nothing. Two calls, not an unbounded loop.
    const { page, calls } = server(PAGE_SIZE);

    expect(await fetchAllRows(page)).toHaveLength(PAGE_SIZE);
    expect(calls).toHaveLength(2);
  });

  it("asks for consecutive windows", async () => {
    const { page, calls } = server(PAGE_SIZE + 1);

    await fetchAllRows(page);

    expect(calls).toEqual([
      { from: 0, to: PAGE_SIZE - 1 },
      { from: PAGE_SIZE, to: PAGE_SIZE * 2 - 1 },
    ]);
  });

  it("returns nothing for an empty result without a second request", async () => {
    const { page, calls } = server(0);

    expect(await fetchAllRows(page)).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("throws on an error rather than returning the rows it had", async () => {
    // Returning a partial list here would reintroduce the silent truncation
    // this helper exists to remove.
    const page = vi
      .fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })),
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: { message: "read failed" } });

    await expect(fetchAllRows(page)).rejects.toThrow("read failed");
  });

  it("treats a null page as the end, not as an error", async () => {
    const page = vi.fn().mockResolvedValue({ data: null, error: null });

    expect(await fetchAllRows(page)).toEqual([]);
  });
});
