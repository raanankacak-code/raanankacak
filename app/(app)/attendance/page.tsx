import { Suspense } from "react";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import AttendanceView from "./AttendanceView";

export default async function AttendancePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  return (
    <Suspense fallback={null}>
      <AttendanceView canEdit={can(member.role, "takeAttendance")} canManageWorkers={can(member.role, "manageWorkers")} />
    </Suspense>
  );
}
