import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import NewReportForm from "./NewReportForm";

/** Filing the site diary needs the permission to file it. */
export default async function NewReportPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "submitReports")) redirect("/reports");

  return (
    <Suspense fallback={null}>
      <NewReportForm />
    </Suspense>
  );
}
