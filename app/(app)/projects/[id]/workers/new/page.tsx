"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export default function NewWorkerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [trade, setTrade] = useState("");
  const [dailyRate, setDailyRate] = useState("");
  const [icNumber, setIcNumber] = useState("");
  const [cidbNumber, setCidbNumber] = useState("");
  const [cidbExpiry, setCidbExpiry] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Worker name is required.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/api/projects/${projectId}/workers`, {
        method: "POST",
        body: JSON.stringify({
          name,
          trade: trade || undefined,
          dailyRate: dailyRate ? Number(dailyRate) : undefined,
          icNumber: icNumber || undefined,
          cidbNumber: cidbNumber || undefined,
          cidbExpiry: cidbExpiry || undefined,
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
      <div className="topbar">
        <h2>Add worker</h2>
      </div>
      <div className="card">
        <div className="card-b">
          {error && <div className="auth-err">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div>
                <label htmlFor="name">Name *</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="trade">Trade</label>
                <input id="trade" placeholder="e.g. Bricklayer" value={trade} onChange={(e) => setTrade(e.target.value)} />
              </div>
              <div>
                <label htmlFor="rate">Daily rate (RM)</label>
                <input id="rate" type="number" min="0" value={dailyRate} onChange={(e) => setDailyRate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="ic">IC number</label>
                <input id="ic" value={icNumber} onChange={(e) => setIcNumber(e.target.value)} />
              </div>
              <div>
                <label htmlFor="cidb">CIDB Green Card number</label>
                <input id="cidb" value={cidbNumber} onChange={(e) => setCidbNumber(e.target.value)} />
              </div>
              <div>
                <label htmlFor="expiry">CIDB card expiry</label>
                <input id="expiry" type="date" value={cidbExpiry} onChange={(e) => setCidbExpiry(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-amber" type="submit" disabled={loading}>
                {loading ? "Adding…" : "Add worker"}
              </button>
              <Link href={`/projects/${projectId}?tab=workers`} className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
