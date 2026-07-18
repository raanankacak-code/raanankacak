import { NextResponse } from "next/server";
import { listNotificationsForOrg, countUnread, markAllRead } from "@/lib/db/notifications";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember();
    const [notifications, unread] = await Promise.all([
      listNotificationsForOrg(member.orgId),
      countUnread(member.orgId),
    ]);
    return NextResponse.json({ notifications, unread });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Marks every unread notification as read. */
export async function PATCH() {
  try {
    const member = await requireMember();
    await markAllRead(member.orgId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
