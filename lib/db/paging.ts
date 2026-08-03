/**
 * Reading past PostgREST's row cap.
 *
 * A select that does not ask for a range comes back with at most 1000 rows,
 * and says nothing about the ones it left. That is how four separate
 * figures in this app came to be quietly wrong — a workspace export that
 * described itself as complete, and three labour totals that understated
 * what they were counting.
 *
 * The lists below the cap cost exactly what they did before: one request,
 * one page, done. The loop only ever runs twice for a workspace that would
 * otherwise have lost rows.
 */

export const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>;

/**
 * Reads every row a query matches, one page at a time.
 *
 * The query must impose a stable order. Paging by range over an unordered
 * query is not stable: rows can shift between pages, so some are returned
 * twice and others never — worse than truncation, because the result still
 * looks like a complete list.
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => Page<T>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}
