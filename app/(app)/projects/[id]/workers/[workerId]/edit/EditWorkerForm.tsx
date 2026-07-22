"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type WorkerFormData = {
  id: string;
  name: string;
  trade: string;
  dailyRate?: number;
  icNumber: string;
  cidbNumber: string;
  cidbExpiry: string;
};

export default function EditWorkerForm({ projectId, worker }: { projectId: string; worker: WorkerFormData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(worker);

  function set<K extends keyof WorkerFormData>(key: K, value: WorkerFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Worker name is required.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/api/workers/${form.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          trade: form.trade || undefined,
          dailyRate: form.dailyRate ?? undefined,
          icNumber: form.icNumber || undefined,
          cidbNumber: form.cidbNumber || undefined,
          cidbExpiry: form.cidbExpiry || undefined,
        }),
      });
      router.push(`/projects/${projectId}?tab=workers`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {error && <div className="auth-err">{error}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <div>
            <label htmlFor="name">Name *</label>
            <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="trade">Trade</label>
            <input id="trade" placeholder="e.g. Bricklayer" value={form.trade} onChange={(e) => set("trade", e.target.value)} />
          </div>
          <div>
            <label htmlFor="rate">Daily rate (RM)</label>
            <input
              id="rate"
              type="number"
              min="0"
              value={form.dailyRate ?? ""}
              onChange={(e) => set("dailyRate", e.target.value ? Number(e.target.value) : undefined)}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div>
            <label htmlFor="ic">IC number</label>
            <input id="ic" value={form.icNumber} onChange={(e) => set("icNumber", e.target.value)} />
          </div>
          <div>
            <label htmlFor="cidb">CIDB Green Card number</label>
            <input id="cidb" value={form.cidbNumber} onChange={(e) => set("cidbNumber", e.target.value)} />
          </div>
          <div>
            <label htmlFor="expiry">CIDB card expiry</label>
            <input id="expiry" type="date" value={form.cidbExpiry} onChange={(e) => set("cidbExpiry", e.target.value)} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-amber" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/projects/${projectId}?tab=workers`} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
