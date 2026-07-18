import { NextResponse } from "next/server";
import { z } from "zod";
import { updateMember } from "@/lib/db/team";
import { requireMember, apiErrorResponse } from "@/lib/auth";

const schema = z.object({ name: z.string().min(1).max(120) });

/** Self-service profile update — any signed-in member can rename themselves. */
export async function PATCH(request: Request) {
  try {
    const member = await requireMember();
    const body = schema.parse(await request.json());
    const updated = await updateMember(member.orgId, member.id, { name: body.name });
    return NextResponse.json({ member: updated });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
