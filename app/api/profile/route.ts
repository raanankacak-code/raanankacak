import { NextResponse } from "next/server";
import { z } from "zod";
import { updateMember } from "@/lib/db/team";
import { requireMember, apiErrorResponse } from "@/lib/auth";

const schema = z.object({ name: z.string().min(1).max(120) });

/**
 * Self-service profile update — any signed-in member can rename themselves.
 *
 * Clients included: this is their own display name, and it is the name that
 * goes on to a sign-off record, so being unable to correct a typo in it would
 * be a poor joke. Nothing else about them is editable here.
 */
export async function PATCH(request: Request) {
  try {
    const member = await requireMember(undefined, { allowClient: true });
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
