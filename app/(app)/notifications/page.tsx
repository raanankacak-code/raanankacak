import { getCurrentMember } from "@/lib/auth";
import { redirect } from "next/navigation";
import NotificationsView from "./NotificationsView";

export default async function NotificationsPage() {
  const member = await getCurrentMember();
  if (!member) redirect("/login");

  return <NotificationsView />;
}
