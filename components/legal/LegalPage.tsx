import Link from "next/link";
import { LEGAL_VERSION, REVIEWED } from "@/lib/legal";

/**
 * The shell both legal documents share.
 *
 * Deliberately not AuthShell: these have to be readable by someone who has no
 * account and no intention of getting one — a worker whose IC number is in
 * somebody's workspace, for instance. So there is no sign-in form, no pricing,
 * and no reason to scroll past a marketing panel to reach the text.
 */
export default function LegalPage({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="doc-shell">
      <header className="doc-top">
        <Link href="/" className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" style={{ width: 34, height: 34, fontSize: 17 }}>
            B
          </div>
          <h1 style={{ fontSize: 19 }}>
            Bina<span>Works</span>
          </h1>
        </Link>
        <nav className="doc-nav">
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/login">Sign in</Link>
        </nav>
      </header>

      <main id="main" className="doc">
        <div className="hazard" style={{ marginBottom: 20 }} />
        <h2 className="doc-h">{title}</h2>
        <p className="doc-sub">{subtitle}</p>
        <p className="doc-ver mono">Version {LEGAL_VERSION}</p>

        {!REVIEWED && (
          <div className="doc-draft" role="note">
            <b>Draft — not yet reviewed by a lawyer.</b> This text was written from what the software actually
            does and is accurate about that, but it has not been checked by a Malaysian legal advisor and the
            operator&rsquo;s registered details below are not filled in. It is published so it can be reviewed,
            not relied on.
          </div>
        )}

        {children}

        <p className="doc-foot">
          Questions about this page? <Link href="/help">Help centre</Link> · <Link href="/terms">Terms</Link> ·{" "}
          <Link href="/privacy">Privacy</Link>
        </p>
      </main>
    </div>
  );
}
