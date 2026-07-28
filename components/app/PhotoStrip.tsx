"use client";

import { useId, useState } from "react";

/**
 * Upload, preview and remove photos.
 *
 * Lifted out of the daily-report form so the safety module could reuse it
 * rather than grow a second copy that slowly drifts — the two had already
 * started to, since the report version could not cap the count and the
 * inspection form needs to.
 *
 * Uploads happen immediately and yield a URL; the parent stores URLs, not
 * files. That is what lets a half-finished form be abandoned without leaving
 * an orphaned object — the record referencing the URL is what makes it
 * permanent, and cleanup follows the record.
 */
export default function PhotoStrip({
  photos,
  onChange,
  max = 12,
  label,
  disabled,
}: {
  photos: string[];
  onChange: (next: string[]) => void;
  max?: number;
  /** Describes what these photos are of, for anyone not looking at the page. */
  label: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputId = useId();

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError("");

    const room = max - photos.length;
    if (room <= 0) {
      setError(`Up to ${max} photos.`);
      return;
    }

    setUploading(true);
    try {
      const added: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        const form = new FormData();
        form.append("file", file);
        const res = await fetch("/api/uploads", { method: "POST", body: form });
        const body = await res.json();
        if (!res.ok) throw new Error(body?.error || "Upload failed");
        added.push(body.url as string);
      }
      // One call rather than one per file: the parent may be holding these in
      // a bigger structure, and a stale closure per iteration loses all but
      // the last.
      onChange([...photos, ...added]);
      if (files.length > room) setError(`Only the first ${room} were added — up to ${max} photos.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Photo upload failed.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="photo-strip">
        {photos.map((url) => (
          <div className="thumb-box" key={url}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={label} className="thumb" />
            <button
              type="button"
              className="thumb-x"
              aria-label={`Remove photo from ${label}`}
              onClick={() => onChange(photos.filter((u) => u !== url))}
            >
              ×
            </button>
          </div>
        ))}
        {photos.length < max && !disabled && (
          <label className="thumb-add" htmlFor={inputId} style={{ display: "grid", placeItems: "center" }}>
            {uploading ? "…" : "+"}
            <span className="sr-only">{`Add a photo to ${label}`}</span>
            <input
              id={inputId}
              type="file"
              accept="image/*"
              multiple
              hidden
              disabled={uploading}
              onChange={(e) => {
                upload(e.target.files);
                // Clear it, so picking the same file twice still fires.
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>
      {error && (
        <div className="small" style={{ color: "var(--bad-text)", marginTop: 5 }} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
