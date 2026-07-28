import Link from "next/link";

/**
 * Shown for an unknown URL, and for anything that calls notFound() — the
 * project, report and worker pages all do when an id does not resolve within
 * the caller's workspace.
 *
 * A server component on purpose: there is nothing interactive here, and it
 * has to render for signed-out visitors hitting a bad URL too.
 */
export default function NotFound() {
  return (
    <main className="main" id="main" style={{ maxWidth: 640, margin: "0 auto", padding: "48px 20px" }}>
      <div className="card">
        <div className="empty">
          <div className="e-ic">🔍</div>
          <div className="e-t">Page not found</div>
          <p>
            This page doesn&rsquo;t exist, or it belongs to a project or record that has since been deleted — or to
            another company&rsquo;s workspace.
          </p>
          <Link href="/dashboard" className="btn btn-amber">
            Back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
