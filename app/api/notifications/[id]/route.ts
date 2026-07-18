import { NextResponse } from "next/server";
import { markRead, deleteNotification } from "@/lib/db/notifications";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id } = await params;
    await markRead(member.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id } = await params;
    await deleteNotification(member.orgId, id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
