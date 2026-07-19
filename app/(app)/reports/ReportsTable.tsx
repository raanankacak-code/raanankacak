"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import SortableTh, { type SortState, toggleSort, sortRows } from "@/components/app/SortableTh";

type Row = {
  id: string;
  date: string;
  projectName: string;
  weather: string | null;
  submittedByName: string;
  workCompleted: string | null;
  status: string;
};

type SortKey = "date" | "project" | "weather" | "by" | "status";

function valueOf(r: Row, key: SortKey): string | number {
  switch (key) {
    case "date":
      return r.date;
    case "project":
      return r.projectName;
    case "weather":
      return r.weather || "";
    case "by":
      return r.submittedByName;
    case "status":
      return r.status;
  }
}

export default function ReportsTable({ rows }: { rows: Row[] }) {
  const [sort, setSort] = useState<SortState<SortKey>>(null);
  const sorted = useMemo(() => sortRows(rows, sort, valueOf), [rows, sort]);

  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <SortableTh label="Date" sortKey="date" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
            <SortableTh label="Project" sortKey="project" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
            <SortableTh label="Weather" sortKey="weather" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
            <SortableTh label="Submitted by" sortKey="by" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
            <th>Work completed</th>
            <SortableTh label="Status" sortKey="status" sort={sort} onSort={(k) => setSort((s) => toggleSort(s, k))} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className="rowlink">
              <td className="mono">{formatDate(r.date)}</td>
              <td>
                <Link href={`/reports/${r.id}`}>
                  <b>{r.projectName}</b>
                </Link>
              </td>
              <td>{r.weather || "—"}</td>
              <td>{r.submittedByName}</td>
              <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {r.workCompleted || "—"}
              </td>
              <td>
                <span className={`badge ${statusBadgeClass(r.status)}`}>
                  <i className="dot" />
                  {statusLabel(r.status)}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
