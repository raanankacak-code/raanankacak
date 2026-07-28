import Link from "next/link";

/**
 * 404 for anything inside the app shell — which is where almost all of them
 * happen, since the project, report and worker pages call notFound() when an
 * id does not resolve within the caller's own workspace.
 *
 * Separate from the root not-found so the sidebar and navigation survive:
 * landing on a deleted project should leave you one click from everything
 * else, not stranded on a bare page.
 */
export default function AppNotFound() {
  return (
    <>
      <div className="topbar">
        <h2>Not found</h2>
        <div className="sub">That page doesn&rsquo;t exist in this workspace.</div>
      </div>
      <div className="card">
        <div className="empty">
          <div className="e-ic">🔍</div>
          <div className="e-t">Nothing here</div>
          <p>
            The record may have been deleted, or the link may point at another company&rsquo;s workspace. Either way,
            there is nothing at this address for you.
          </p>
          <Link href="/dashboard" className="btn btn-amber">
            Back to dashboard
          </Link>
        </div>
      </div>
    </>
  );
}
