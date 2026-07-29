"use client";

import { useEffect } from "react";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Last-resort boundary: this one replaces the root layout, which means the
 * fonts and the stylesheet that layout brings in are gone by the time it
 * renders. So it depends on none of them — every style here is inline, and
 * the markup is complete down to <html>. A boundary that needs the app's CSS
 * to look right is a boundary that breaks in exactly the case it exists for.
 *
 * Reached only when the root layout itself throws. Anything below it is
 * caught by app/error.tsx or app/(app)/error.tsx, which keep the design.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only fires for errors the server never saw — see reportClientError.
  useEffect(() => reportClientError(error), [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          padding: 20,
          background: "#F2F5F9",
          color: "#17212D",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 460,
            width: "100%",
            background: "#fff",
            border: "1px solid #E6EAF1",
            borderRadius: 14,
            padding: "32px 28px",
            textAlign: "center",
            boxShadow: "0 18px 40px -24px rgba(23,33,45,.4)",
          }}
        >
          <div
            style={{
              background: "#F5A800",
              color: "#241A02",
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: ".06em",
              textTransform: "uppercase",
              padding: "8px 14px",
              borderRadius: 8,
              display: "inline-block",
              marginBottom: 20,
            }}
          >
            BinaWorks
          </div>
          <h1 style={{ fontSize: 21, margin: "0 0 10px" }}>The app failed to start</h1>
          <p style={{ color: "#55677B", lineHeight: 1.55, fontSize: 14.5, margin: "0 0 22px" }}>
            Something went wrong before the page could load. Your data is safe — nothing was changed by this error.
          </p>
          <button
            onClick={reset}
            style={{
              background: "#F5A800",
              color: "#241A02",
              fontWeight: 700,
              border: 0,
              borderRadius: 8,
              padding: "12px 22px",
              fontSize: 14.5,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          {error.digest && (
            <p style={{ color: "#8797AA", fontSize: 12.5, marginTop: 20, marginBottom: 0 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
