"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api-client";

/**
 * Site photographs on a filed inspection.
 *
 * The photograph of the fix arrives the next day; until this there was
 * nowhere to put it, so it lived in somebody's phone gallery and the record
 * said nothing about it. Adding one does not touch the checklist — what was
 * found on site stays as it was found — and every addition is attributed in
 * the audit trail.
 *
 * The controls carry `no-print`: on paper this is a strip of photographs, not
 * a form.
 */
export default function InspectionPhotos({
  inspectionId,
  photos,
  canAdd,
  canRemove,
}: {
  inspectionId: string;
  photos: string[];
  canAdd: boolean;
  canRemove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function add(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 12)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Upload failed");
        urls.push(body.url as string);
      }
      await apiFetch(`/api/safety/${inspectionId}/photos`, { method: "POST", body: JSON.stringify({ photos: urls }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : err instanceof Error ? err.message : "Could not add the photo.");
    } finally {
      setBusy(false);
    }
  }

  async function remove(url: string) {
    if (!confirm("Remove this photo from the inspection record? This is recorded in the audit log.")) return;
    setBusy(true);
    setError("");
    try {
      await apiFetch(`/api/safety/${inspectionId}/photos`, { method: "DELETE", body: JSON.stringify({ url }) });
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not remove the photo.");
    } finally {
      setBusy(false);
    }
  }

  if (photos.length === 0 && !canAdd) return null;

  return (
    <div className="print-group">
      <div className="field-label">Site photos</div>
      {error && <div className="auth-err no-print">{error}</div>}
      {photos.length === 0 ? (
        <p className="small mut no-print" style={{ margin: "6px 0 0" }}>
          None yet. Add one if something has been photographed since this was filed.
        </p>
      ) : (
        <div className="photo-strip">
          {photos.map((url) => (
            <span key={url} className="photo-holder">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="Site photo" className="thumb" />
              {canRemove && (
                <button
                  type="button"
                  className="photo-x no-print"
                  aria-label="Remove this photo"
                  disabled={busy}
                  onClick={() => remove(url)}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {canAdd && (
        <label className="btn btn-sm no-print" style={{ marginTop: 10, display: "inline-flex" }}>
          {busy ? "Working…" : "+ Add photo"}
          <input
            type="file"
            accept="image/*"
            multiple
            hidden
            disabled={busy}
            onChange={(e) => {
              add(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
      )}
    </div>
  );
}
