"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export default function DeleteProjectButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm("Delete this project? This removes its reports, attendance and worker roster too.")) return;
    setLoading(true);
    try {
      await apiFetch(`/api/projects/${projectId}`, { method: "DELETE" });
      router.push("/projects");
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-danger" type="button" onClick={handleDelete} disabled={loading}>
      Delete
    </button>
  );
}
