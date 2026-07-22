"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export default function RemoveWorkerButton({ workerId, workerName }: { workerId: string; workerName: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRemove() {
    if (!confirm(`Remove ${workerName} from the roster?`)) return;
    setLoading(true);
    try {
      await apiFetch(`/api/workers/${workerId}`, { method: "DELETE" });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      className="btn btn-danger btn-sm"
      type="button"
      onClick={handleRemove}
      disabled={loading}
      aria-label={`Remove ${workerName}`}
    >
      Remove
    </button>
  );
}
