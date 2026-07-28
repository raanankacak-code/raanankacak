import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import MaterialsView from "./MaterialsView";
import { SkeletonPage } from "@/components/app/Skeletons";

export default async function MaterialsPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "viewMaterials")) redirect("/dashboard");

  return (
    <Suspense fallback={<SkeletonPage rows={7} cols={5} />}>
      <MaterialsView
        canSubmit={can(member.role, "submitRequests")}
        canApprove={can(member.role, "approveRequests")}
        myId={member.id}
      />
    </Suspense>
  );
}
