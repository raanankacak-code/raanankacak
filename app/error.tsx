"use client";

import { useEffect } from "react";
import ErrorPanel from "@/components/ErrorPanel";
import { reportClientError } from "@/lib/reportClientError";

/**
 * Catches failures outside the app shell — the auth pages, and the app
 * layout itself when it is the thing that broke.
 *
 * There is no sidebar to preserve here, so this renders standalone. It
 * cannot link to /dashboard as confidently as the in-shell boundary: if the
 * app layout is what failed, sending someone straight back there just fails
 * again. Home is the safer destination.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Only fires for errors the server never saw — see reportClientError.
  useEffect(() => reportClientError(error), [error]);

  return (
    <main className="main" id="main" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <ErrorPanel
        description="This page failed to load. Your data is safe — nothing was changed by this error. If trying again does not help, sign in from the home page."
        digest={error.digest}
        onRetry={reset}
        homeHref="/"
        homeLabel="Go to home page"
      />
    </main>
  );
}
