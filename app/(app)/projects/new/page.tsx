"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api-client";

export default function NewProjectPage() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [siteAddress, setSiteAddress] = useState("");
  const [contractValue, setContractValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [status, setStatus] = useState("PLANNING");
  const [managerName, setManagerName] = useState("");
  const [memberNames, setMemberNames] = useState<string[]>([]);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Project name is required.");
      return;
    }
    setLoading(true);
    try {
      const { project } = await apiFetch<{ project: { id: string } }>("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name,
          client: client || undefined,
          siteAddress: siteAddress || undefined,
          contractValue: contractValue ? Number(contractValue) : undefined,
          startDate: startDate || undefined,
          endDate: endDate || undefined,
          status,
          managerName: managerName || undefined,
        }),
      });
      router.push(`/projects/${project.id}`);
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
        <h2>New project</h2>
      </div>

      <div className="card">
        <div className="card-b">
          {error && <div className="auth-err">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="full">
                <label htmlFor="name">Project name *</label>
                <input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div>
                <label htmlFor="client">Client</label>
                <input id="client" value={client} onChange={(e) => setClient(e.target.value)} />
              </div>
              <div>
                <label htmlFor="manager">Project manager</label>
                <select id="manager" value={managerName} onChange={(e) => setManagerName(e.target.value)}>
                  <option value="">— None —</option>
                  {memberNames.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </div>
              <div className="full">
                <label htmlFor="site">Site address</label>
                <input id="site" value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)} />
              </div>
              <div>
                <label htmlFor="value">Contract value (RM)</label>
                <input id="value" type="number" min="0" value={contractValue} onChange={(e) => setContractValue(e.target.value)} />
              </div>
              <div>
                <label htmlFor="status">Status</label>
                <select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="PLANNING">Planning</option>
                  <option value="ACTIVE">Active</option>
                  <option value="ON_HOLD">On hold</option>
                  <option value="COMPLETED">Completed</option>
                </select>
              </div>
              <div>
                <label htmlFor="start">Start date</label>
                <input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="end">End date</label>
                <input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
              <button className="btn btn-amber" type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create project"}
              </button>
              <Link href="/projects" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
