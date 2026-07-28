"use client";

import Link from "next/link";

/**
 * The one place an unhandled error is described to a user.
 *
 * Shared by all three boundaries so they cannot drift into saying different
 * things about the same failure. It deliberately says nothing about what
 * broke: the message on a server-rendered error is React's generic one
 * anyway, and the real detail is already in the server log — keyed by the
 * digest shown here, which is the whole reason it is worth surfacing.
 */
export default function ErrorPanel({
  title = "Something went wrong",
  description = "This screen failed to load. Your data is safe — nothing was changed by this error.",
  digest,
  onRetry,
  homeHref = "/dashboard",
  homeLabel = "Back to dashboard",
}: {
  title?: string;
  description?: string;
  digest?: string;
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
}) {
  return (
    <div className="card">
      <div className="empty">
        <div className="e-ic">⚠️</div>
        <div className="e-t">{title}</div>
        <p>{description}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          {onRetry && (
            <button className="btn btn-amber" onClick={onRetry}>
              Try again
            </button>
          )}
          <Link href={homeHref} className="btn">
            {homeLabel}
          </Link>
        </div>
        {digest && (
          <p className="small faint num" style={{ marginTop: 18, marginBottom: 0 }}>
            Reference: {digest}
          </p>
        )}
      </div>
    </div>
  );
}
