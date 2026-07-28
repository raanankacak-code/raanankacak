"use client";

export type SortState<K extends string> = { key: K; dir: 1 | -1 } | null;

export function toggleSort<K extends string>(sort: SortState<K>, key: K): SortState<K> {
  return sort?.key === key ? { key, dir: sort.dir === 1 ? -1 : 1 } : { key, dir: 1 };
}

export function sortRows<T, K extends string>(rows: T[], sort: SortState<K>, valueOf: (row: T, key: K) => string | number): T[] {
  if (!sort) return rows;
  const { key, dir } = sort;
  return [...rows].sort((a, b) => {
    const va = valueOf(a, key);
    const vb = valueOf(b, key);
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
    return String(va).localeCompare(String(vb)) * dir;
  });
}

export default function SortableTh<K extends string>({
  label,
  sortKey,
  sort,
  onSort,
  numeric,
}: {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onSort: (k: K) => void;
  numeric?: boolean;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? (sort!.dir === 1 ? "ascending" : "descending") : "none";
  return (
    // "none" rather than undefined on the inactive columns: it is what tells a
    // screen reader the column is sortable at all. Omitting the attribute
    // makes an unsorted column indistinguishable from one that cannot sort.
    <th aria-sort={dir} style={numeric ? { textAlign: "right" } : undefined}>
      <button
        type="button"
        className="th-sort"
        onClick={() => onSort(sortKey)}
        // The visible arrow says which way it is sorted; this says the same
        // thing to someone who cannot see it, and what pressing will do next.
        aria-label={
          active
            ? `${label}, sorted ${dir}. Activate to sort ${sort!.dir === 1 ? "descending" : "ascending"}.`
            : `${label}, not sorted. Activate to sort ascending.`
        }
      >
        {label}
        {/* Decorative: aria-sort and the label above already carry this. */}
        <span className="th-ar" aria-hidden="true">
          {active ? (sort!.dir === 1 ? "▲" : "▼") : ""}
        </span>
      </button>
    </th>
  );
}
