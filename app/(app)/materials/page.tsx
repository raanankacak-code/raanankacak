import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import MaterialsView from "./MaterialsView";

export default async function MaterialsPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "viewMaterials")) redirect("/dashboard");

  return (
    <Suspense fallback={null}>
      <MaterialsView
        canSubmit={can(member.role, "submitRequests")}
        canApprove={can(member.role, "approveRequests")}
        myId={member.id}
      />
    </Suspense>
  );
}
