"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import PhotoStrip from "@/components/app/PhotoStrip";
import { apiFetch, ApiClientError } from "@/lib/api-client";

type Project = { id: string; name: string };

const WEATHER_OPTIONS = ["Sunny", "Cloudy", "Haze", "Rain (AM)", "Rain (PM)", "Heavy Rain"];

export default function NewReportForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetProjectId = searchParams.get("projectId") || "";

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState(presetProjectId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [weather, setWeather] = useState("Sunny");
  const [workCompleted, setWorkCompleted] = useState("");
  const [delays, setDelays] = useState("");
  const [notes, setNotes] = useState("");
  const [manpower, setManpower] = useState<{ trade: string; count: string }[]>([
    { trade: "", count: "" },
  ]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    apiFetch<{ projects: Project[] }>("/api/projects").then((d) => {
      setProjects(d.projects);
      if (!presetProjectId && d.projects[0]) setProjectId(d.projects[0].id);
    });
  }, [presetProjectId]);

  function updateManpowerRow(i: number, key: "trade" | "count", value: string) {
    setManpower((rows) => rows.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!projectId) {
      setError("Choose a project.");
      return;
    }
    setLoading(true);
    try {
      const manpowerRecord: Record<string, number> = {};
      for (const row of manpower) {
        if (row.trade.trim() && row.count) manpowerRecord[row.trade.trim()] = Number(row.count);
      }
      const { report } = await apiFetch<{ report: { id: string } }>("/api/reports", {
        method: "POST",
        body: JSON.stringify({
          projectId,
          date,
          weather,
          manpower: manpowerRecord,
          workCompleted: workCompleted || undefined,
          delays: delays || undefined,
          notes: notes || undefined,
          photos,
        }),
      });
      router.push(`/reports/${report.id}`);
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
        <h2>New daily report</h2>
      </div>

      <div className="card">
        <div className="card-b">
          {error && <div className="auth-err">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <div>
                <label htmlFor="project">Project *</label>
                <select id="project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="date">Date *</label>
                <input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <label htmlFor="weather">Weather</label>
                <select id="weather" value={weather} onChange={(e) => setWeather(e.target.value)}>
                  {WEATHER_OPTIONS.map((w) => (
                    <option key={w} value={w}>
                      {w}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="field-label">Manpower by trade</div>
              {manpower.map((row, i) => (
                <div className="trade-row" key={i}>
                  <input
                    placeholder="Trade (e.g. Bricklayer)"
                    value={row.trade}
                    onChange={(e) => updateManpowerRow(i, "trade", e.target.value)}
                  />
                  <input
                    type="number"
                    min="0"
                    placeholder="Count"
                    value={row.count}
                    onChange={(e) => updateManpowerRow(i, "count", e.target.value)}
                  />
                </div>
              ))}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => setManpower((rows) => [...rows, { trade: "", count: "" }])}
              >
                + Add trade
              </button>
            </div>

            <div className="form-grid" style={{ marginTop: 16 }}>
              <div className="full">
                <label htmlFor="work">Work completed</label>
                <textarea id="work" value={workCompleted} onChange={(e) => setWorkCompleted(e.target.value)} />
              </div>
              <div className="full">
                <label htmlFor="delays">Delays / issues</label>
                <textarea id="delays" value={delays} onChange={(e) => setDelays(e.target.value)} />
              </div>
              <div className="full">
                <label htmlFor="notes">Notes</label>
                <textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div style={{ marginTop: 16 }}>
              <div className="field-label">Site photos</div>
              <PhotoStrip label="the site" max={20} photos={photos} onChange={setPhotos} />
            </div>

            <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
              <button className="btn btn-amber" type="submit" disabled={loading}>
                {loading ? "Submitting…" : "Submit report"}
              </button>
              <Link href="/reports" className="btn btn-ghost">
                Cancel
              </Link>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
