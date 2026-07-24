"use client";

import { useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import type { PlanId } from "@/lib/billing/plans";

export function UpgradeButton({ plan, label }: { plan: PlanId; label: string }) {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ plan }),
      });
      window.location.href = url;
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Could not start checkout.");
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-amber" type="button" onClick={handleClick} disabled={loading} style={{ width: "100%", justifyContent: "center" }}>
      {loading ? "Redirecting…" : label}
    </button>
  );
}

export function ManageSubscriptionButton() {
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const { url } = await apiFetch<{ url: string }>("/api/billing/portal", { method: "POST" });
      window.location.href = url;
    } catch (err) {
      alert(err instanceof ApiClientError ? err.message : "Could not open the billing portal.");
      setLoading(false);
    }
  }

  return (
    <button className="btn btn-sm" type="button" onClick={handleClick} disabled={loading}>
      {loading ? "Opening…" : "Manage subscription"}
    </button>
  );
}
