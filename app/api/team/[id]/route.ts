import { NextResponse } from "next/server";
import { z } from "zod";
import { getMemberById, updateMember, removeMember, countOwners } from "@/lib/db/team";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordAuditEvent } from "@/lib/db/auditLog";

const ROLES = [
  "OWNER",
  "ADMIN",
  "PROJECT_MANAGER",
  "SITE_SUPERVISOR",
  "ENGINEER",
  "QUANTITY_SURVEYOR",
  "SAFETY_OFFICER",
  "STOREKEEPER",
  "FINANCE",
  "VIEWER",
] as const;

const patchSchema = z.object({
  role: z.enum(ROLES).optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).max(120).optional(),
});

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireMember("manageUsers");
    const { id } = await params;
    const target = await getMemberById(me.orgId, id);
    if (!target) throw new ApiError(404, "User not found");
    if (target.role === "OWNER" && me.role !== "OWNER") {
      throw new ApiError(403, "Only the Owner can manage Owner accounts");
    }

    const body = patchSchema.parse(await request.json());
    const isSelf = target.id === me.id;
    if (isSelf && body.role) throw new ApiError(400, "You can't change your own role");
    if (isSelf && body.active === false) throw new ApiError(400, "You can't deactivate your own account");
    if (body.role === "OWNER" && me.role !== "OWNER") {
      throw new ApiError(403, "Only the Owner can grant the Owner role");
    }
    if (
      target.role === "OWNER" &&
      ((body.role && body.role !== "OWNER") || body.active === false) &&
      (await countOwners(me.orgId)) <= 1
    ) {
      throw new ApiError(400, "Your company needs at least one active Owner");
    }

    const member = await updateMember(me.orgId, id, body);

    if (body.role && body.role !== target.role) {
      await recordAuditEvent(me.orgId, {
        actorMemberId: me.id,
        actorName: me.name,
        action: "MEMBER_ROLE_CHANGED",
        entityType: "org_member",
        entityId: member.id,
        summary: `${me.name} changed ${target.name}'s role from ${target.role} to ${body.role}`,
        metadata: { from: target.role, to: body.role },
      });
    }
    if (body.active !== undefined && body.active !== target.active) {
      await recordAuditEvent(me.orgId, {
        actorMemberId: me.id,
        actorName: me.name,
        action: body.active ? "MEMBER_REACTIVATED" : "MEMBER_DEACTIVATED",
        entityType: "org_member",
        entityId: member.id,
        summary: `${me.name} ${body.active ? "reactivated" : "deactivated"} ${target.name}'s account`,
      });
    }

    return NextResponse.json({ member });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const me = await requireMember("manageUsers");
    const { id } = await params;
    const target = await getMemberById(me.orgId, id);
    if (!target) throw new ApiError(404, "User not found");
    if (target.role === "OWNER" && me.role !== "OWNER") {
      throw new ApiError(403, "Only the Owner can manage Owner accounts");
    }
    if (target.id === me.id) throw new ApiError(400, "You can't remove your own account");
    if (target.role === "OWNER" && (await countOwners(me.orgId)) <= 1) {
      throw new ApiError(400, "Your company needs at least one active Owner");
    }
    await removeMember(me.orgId, id);
    await recordAuditEvent(me.orgId, {
      actorMemberId: me.id,
      actorName: me.name,
      action: "MEMBER_REMOVED",
      entityType: "org_member",
      entityId: target.id,
      summary: `${me.name} removed ${target.name} (${target.role}) from the company`,
      metadata: { removedRole: target.role, removedEmail: target.email },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
