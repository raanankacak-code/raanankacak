"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The portal's only interactive furniture: who you are looking at, and the
 * way out. Deliberately not the app's sidebar — a client has one place to be,
 * and a navigation full of things they cannot open would only raise questions
 * the contractor then has to answer.
 */
export default function PortalTop({
  orgName,
  orgLogoUrl,
  memberName,
}: {
  orgName: string;
  orgLogoUrl: string | null;
  memberName: string;
}) {
  const router = useRouter();

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="portal-top">
      <Link href="/portal" className="portal-brand">
        {orgLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={orgLogoUrl} className="brand-logo" style={{ width: 34, height: 34 }} alt="" />
        ) : (
          <div className="brand-mark">{orgName.slice(0, 1).toUpperCase()}</div>
        )}
        <span>
          <b>{orgName}</b>
          <span className="small faint">Client access</span>
        </span>
      </Link>
      <Link href="/portal/profile" className="portal-who small">
        {memberName}
      </Link>
      <button className="btn btn-ghost btn-sm" onClick={signOut}>
        Sign out
      </button>
    </header>
  );
}
