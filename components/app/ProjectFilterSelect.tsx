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
