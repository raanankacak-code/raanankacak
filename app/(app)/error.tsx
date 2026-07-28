"use client";

import ErrorPanel from "@/components/ErrorPanel";

/**
 * Catches a failure in any page inside the app shell.
 *
 * Being at this level rather than the root is the point: the sidebar, the
 * topbar and the navigation all survive, so a broken Reports page leaves the
 * rest of the workspace usable instead of replacing everything with an error
 * screen. Only a failure in the shell's own layout escapes to app/error.tsx.
 *
 * The error itself is already in the server log — instrumentation.ts's
 * onRequestError captures anything thrown while rendering — so this does not
 * try to report it again. `digest` is React's key for that log entry.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <>
      <div className="topbar">
        <h2>Something went wrong</h2>
        <div className="sub">This screen failed to load. The rest of the workspace still works.</div>
      </div>
      <ErrorPanel
        description="Trying again is usually enough — it may have been a temporary problem reaching the database. Nothing was changed by this error."
        digest={error.digest}
        onRetry={reset}
      />
    </>
  );
}
