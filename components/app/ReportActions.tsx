"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export default function ReportActions({
  reportId,
  status,
  canReview,
}: {
  reportId: string;
  status: string;
  canReview: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  if (!canReview) return null;

  async function markReviewed() {
    setLoading(true);
    try {
      await apiFetch(`/api/reports/${reportId}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "REVIEWED" }),
      });
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Delete this daily report?")) return;
    setLoading(true);
    try {
      await apiFetch(`/api/reports/${reportId}`, { method: "DELETE" });
      router.push("/reports");
      router.refresh();
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Something went wrong.");
      setLoading(false);
    }
  }

  return (
    <>
      {status !== "REVIEWED" && (
        <button className="btn btn-amber btn-sm" type="button" onClick={markReviewed} disabled={loading}>
          Mark as reviewed
        </button>
      )}
      <button className="btn btn-danger btn-sm" type="button" onClick={handleDelete} disabled={loading}>
        Delete
      </button>
    </>
  );
}
