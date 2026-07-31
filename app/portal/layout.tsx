import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { isClient } from "@/lib/permissions";
import PortalTop from "@/components/portal/PortalTop";

/**
 * The client portal.
 *
 * Outside the (app) route group on purpose, so none of the sidebar, the
 * global search or the floating report button can reach it. A client sees
 * their own projects and nothing else; the boundary is enforced by the SELECT
 * policies in the database, and this layout is the part that decides who is
 * standing in front of which door.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/signup/company");
  // Staff have the whole app; sending them here would only be confusing.
  if (!isClient(member.role)) redirect("/dashboard");

  const org = await getOrganizationById(member.orgId);
  if (!org) redirect("/login");

  return (
    <div className="portal-shell">
      <PortalTop orgName={org.shortName || org.name} orgLogoUrl={org.logoUrl} memberName={member.name} />
      <main className="portal-main" id="main">
        {children}
      </main>
    </div>
  );
}
