"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { formatInstantDate } from "@/lib/format";

const FOLDERS = ["Drawings", "Contracts", "Claims", "Permits", "Other"];

type Doc = {
  id: string;
  folder: string;
  name: string;
  url: string;
  sizeBytes: number;
  uploadedByName: string;
  createdAt: string;
};

function fmtSize(b: number) {
  if (b >= 1048576) return (b / 1048576).toFixed(1) + " MB";
  if (b >= 1024) return Math.round(b / 1024) + " KB";
  return b + " B";
}

export default function DocumentsPanel({ projectId, canUpload }: { projectId: string; canUpload: boolean }) {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [folder, setFolder] = useState("All");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await apiFetch<{ documents: Doc[] }>(`/api/projects/${projectId}/documents`);
      setDocs(data.documents);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to load documents.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    queueMicrotask(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleUpload(files: FileList | null, uploadFolder: string) {
    if (!files || !files.length) return;
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Upload failed");
        await apiFetch(`/api/projects/${projectId}/documents`, {
          method: "POST",
          body: JSON.stringify({ folder: uploadFolder, name: file.name, url: body.url, sizeBytes: file.size, mimeType: file.type }),
        });
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this document?")) return;
    try {
      await apiFetch(`/api/documents/${id}`, { method: "DELETE" });
      setDocs((d) => d.filter((x) => x.id !== id));
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Failed to delete document.");
    }
  }

  const counts = useMemo(() => {
    const c: Record<string, number> = { All: docs.length };
    for (const f of FOLDERS) c[f] = docs.filter((d) => d.folder === f).length;
    return c;
  }, [docs]);

  const list = folder === "All" ? docs : docs.filter((d) => d.folder === folder);

  return (
    <div className="card">
      <div className="card-h">
        <h3>Documents</h3>
        <div className="right">
          {canUpload && (
            <label className="btn btn-amber btn-sm" style={{ cursor: uploading ? "not-allowed" : "pointer" }}>
              {uploading ? "Uploading…" : "⬆ Upload"}
              <input
                type="file"
                multiple
                hidden
                disabled={uploading}
                onChange={(e) => handleUpload(e.target.files, folder === "All" ? "Other" : folder)}
              />
            </label>
          )}
        </div>
      </div>
      <div className="card-b" style={{ paddingBottom: 0 }}>
        {error && <div className="auth-err">{error}</div>}
        <div className="seg" style={{ marginBottom: 14 }}>
          {["All", ...FOLDERS].map((f) => (
            <button key={f} className={folder === f ? "on" : ""} onClick={() => setFolder(f)}>
              {f} {counts[f] ? `(${counts[f]})` : ""}
            </button>
          ))}
        </div>
      </div>
      {loading ? (
        <div className="card-b">
          <p className="mut small">Loading…</p>
        </div>
      ) : list.length === 0 ? (
        <div className="empty">
          <div className="e-ic">📄</div>
          <div className="e-t">No documents</div>
          <p>Drawings, contracts, claims and permits for this project will show up here.</p>
        </div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Folder</th>
                <th>Size</th>
                <th>Uploaded by</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id}>
                  <td>
                    <a href={d.url} target="_blank" rel="noreferrer">
                      📄 {d.name}
                    </a>
                  </td>
                  <td>
                    <span className="badge b-mut">{d.folder}</span>
                  </td>
                  <td className="small mono">{fmtSize(d.sizeBytes)}</td>
                  <td className="small mut">
                    {d.uploadedByName} · {formatInstantDate(d.createdAt)}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {canUpload && (
                      <button className="btn btn-ghost btn-sm" onClick={() => remove(d.id)}>
                        Delete
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
