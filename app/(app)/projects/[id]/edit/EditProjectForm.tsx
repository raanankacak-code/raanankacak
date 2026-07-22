"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type ProjectFormData = {
  id: string;
  name: string;
  client: string;
  siteAddress: string;
  contractValue?: number;
  startDate: string;
  endDate: string;
  status: string;
  progressPct: number;
  plannedPct: number;
  managerName: string;
};

export default function EditProjectForm({ project }: { project: ProjectFormData }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState(project);
  const [memberNames, setMemberNames] = useState<string[]>([]);

  function set<K extends keyof ProjectFormData>(key: K, value: ProjectFormData[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  useEffect(() => {
    async function load() {
      try {
        const data = await apiFetch<{ members: { name: string; active: boolean }[] }>("/api/team");
        setMemberNames(Array.from(new Set(data.members.filter((m) => m.active).map((m) => m.name))));
      } catch {
        // Non-critical: the manager field just won't have a picker if this fails.
      }
    }
    queueMicrotask(load);
  }, []);

  // Keep the project's current manager selectable even if they're no longer
  // an active team member (or it's legacy freeform text), so switching to a
  // dropdown never silently loses what was already saved.
  const managerOptions = project.managerName && !memberNames.includes(project.managerName)
    ? [project.managerName, ...memberNames]
    : memberNames;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) {
      setError("Project name is required.");
      return;
    }
    setLoading(true);
    try {
      await apiFetch(`/api/projects/${form.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          client: form.client || undefined,
          siteAddress: form.siteAddress || undefined,
          contractValue: form.contractValue,
          startDate: form.startDate || undefined,
          endDate: form.endDate || undefined,
          status: form.status,
          progressPct: form.progressPct,
          plannedPct: form.plannedPct,
          managerName: form.managerName || undefined,
        }),
      });
      router.push(`/projects/${form.id}`);
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
          <div className="full">
            <label htmlFor="name">Project name *</label>
            <input id="name" value={form.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div>
            <label htmlFor="client">Client</label>
            <input id="client" value={form.client} onChange={(e) => set("client", e.target.value)} />
          </div>
          <div>
            <label htmlFor="manager">Project manager</label>
            <select id="manager" value={form.managerName} onChange={(e) => set("managerName", e.target.value)}>
              <option value="">— None —</option>
              {managerOptions.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="full">
            <label htmlFor="site">Site address</label>
            <input id="site" value={form.siteAddress} onChange={(e) => set("siteAddress", e.target.value)} />
          </div>
          <div>
            <label htmlFor="value">Contract value (RM)</label>
            <input
              id="value"
              type="number"
              min="0"
              value={form.contractValue ?? ""}
              onChange={(e) => set("contractValue", e.target.value ? Number(e.target.value) : undefined)}
            />
          </div>
          <div>
            <label htmlFor="status">Status</label>
            <select id="status" value={form.status} onChange={(e) => set("status", e.target.value)}>
              <option value="PLANNING">Planning</option>
              <option value="ACTIVE">Active</option>
              <option value="ON_HOLD">On hold</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>
          <div>
            <label htmlFor="start">Start date</label>
            <input id="start" type="date" value={form.startDate} onChange={(e) => set("startDate", e.target.value)} />
          </div>
          <div>
            <label htmlFor="end">End date</label>
            <input id="end" type="date" value={form.endDate} onChange={(e) => set("endDate", e.target.value)} />
          </div>
          <div>
            <label htmlFor="progress">Actual progress (%)</label>
            <input
              id="progress"
              type="number"
              min="0"
              max="100"
              value={form.progressPct}
              onChange={(e) => set("progressPct", Number(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </div>
          <div>
            <label htmlFor="planned">Planned progress (%)</label>
            <input
              id="planned"
              type="number"
              min="0"
              max="100"
              value={form.plannedPct}
              onChange={(e) => set("plannedPct", Number(e.target.value))}
              onFocus={(e) => e.target.select()}
            />
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <button className="btn btn-amber" type="submit" disabled={loading}>
            {loading ? "Saving…" : "Save changes"}
          </button>
          <Link href={`/projects/${form.id}`} className="btn btn-ghost">
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
