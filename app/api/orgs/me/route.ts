import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireMember, apiErrorResponse } from "@/lib/auth";

export async function GET() {
  try {
    const member = await requireMember();
    const org = await prisma.organization.findUnique({ where: { id: member.orgId } });
    return NextResponse.json({ member, org });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
