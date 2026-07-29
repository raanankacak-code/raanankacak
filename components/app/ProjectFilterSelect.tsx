"use client";

import { useRouter } from "next/navigation";

export default function ProjectFilterSelect({
  projects,
  selected,
  basePath,
}: {
  projects: { id: string; name: string }[];
  selected?: string;
  basePath: string;
}) {
  const router = useRouter();

  return (
    <select
      // The filter bar has no visible <label> by design — the option text
      // ("All projects") reads as the label sighted. A screen reader gets
      // only "combo box", so the name has to be stated.
      aria-label="Filter by project"
      defaultValue={selected || "all"}
      onChange={(e) => {
        const v = e.target.value;
        router.push(v === "all" ? basePath : `${basePath}?projectId=${v}`);
      }}
    >
      <option value="all">All projects</option>
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
