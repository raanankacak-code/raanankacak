/**
 * Reports a browser-side crash to this app's own endpoint.
 *
 * Called from the error boundaries. Deliberately tiny and total: an error
 * reporter that can itself throw turns a rendered error page into a blank
 * one, which is the failure it exists to make visible.
 *
 * `keepalive` matters — a crash is often followed immediately by the user
 * closing the tab or navigating away, and without it the request is
 * cancelled before it leaves.
 */
export function reportClientError(error: Error & { digest?: string }): void {
  // A `digest` means React caught this on the server, where
  // instrumentation.ts's onRequestError has already logged and reported it.
  // Reporting again would double every server-render failure and make the
  // counts meaningless. What is left — hydration mismatches, event handlers,
  // effects, anything that only fails in a browser — is invisible to the
  // server and is exactly what this is for.
  if (error?.digest) return;

  try {
    void fetch("/api/client-errors", {
      method: "POST",
      keepalive: true,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: String(error?.message ?? "Unknown client error").slice(0, 500),
        stack: error?.stack?.slice(0, 8_000),
        digest: error?.digest,
        // pathname only. The query string in this app can carry an invite
        // token, and a crash report is not a place to put a credential.
        path: typeof window === "undefined" ? undefined : window.location.pathname,
      }),
    }).catch(() => {});
  } catch {
    // Nothing to do and nowhere to say it. Silence here is correct.
  }
}
