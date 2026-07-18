import { getCurrentMember } from "@/lib/auth";
import { redirect } from "next/navigation";
import CalendarView from "./CalendarView";

export default async function CalendarPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");

  return <CalendarView canEdit={member.role !== "VIEWER"} />;
}
