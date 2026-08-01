import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import PortalProfile from "@/components/portal/PortalProfile";

export const metadata = { title: "Your account" };

export default async function PortalProfilePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  return (
    <>
      <div className="topbar">
        <h2>Your account</h2>
        <div className="sub">
          <Link href="/portal">← All your projects</Link>
        </div>
      </div>
      <PortalProfile name={member.name} email={member.email} />
    </>
  );
}
