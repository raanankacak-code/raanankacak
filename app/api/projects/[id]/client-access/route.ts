import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { getMemberById } from "@/lib/db/team";
import { grantProjectAccess, listClientsForProject, revokeProjectAccess } from "@/lib/db/projectAccess";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { isClient } from "@/lib/permissions";

const grantSchema = z.object({ memberId: z.string().uuid() });
const revokeSchema = z.object({ memberId: z.string().uuid() });

/** Who outside the company can see this project. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    // Whoever manages the team decides who sees what, so the same permission
    // gates reading the list as changing it.
    const member = await requireMember("manageUsers");
    const { id } = await params;

    const project = await getProjectById(member.orgId, id);
    if (!project) throw new ApiError(404, "Project not found");

    return NextResponse.json({ clients: await listClientsForProject(member.orgId, id) });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

/** Gives an existing client account sight of this project too. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageUsers");
    const { id } = await params;
    const body = grantSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, id);
    if (!project) throw new ApiError(404, "Project not found");

    const target = await getMemberById(member.orgId, body.memberId);
    if (!target) throw new ApiError(404, "That account is not in this workspace");
    // Staff are scoped by company, not by project. A row here for a member of
    // staff would imply a restriction that nothing enforces.
    if (!isClient(target.role)) throw new ApiError(400, "Only a client account is given access project by project");

    await grantProjectAccess(member.orgId, target.id, [project.id], member.name);

    await recordMemberAction(member, {
      action: "CLIENT_ACCESS_GRANTED",
      entityType: "project",
      entityId: project.id,
      summary: `${member.name} gave ${target.name} access to ${project.name}`,
      metadata: { projectId: project.id, memberId: target.id, email: target.email },
    });

    return NextResponse.json({ clients: await listClientsForProject(member.orgId, project.id) }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

/**
 * Takes it away again.
 *
 * What they already signed off stays on the record — project_approvals keeps
 * the name and email as they were at the moment of signing, so revoking
 * access removes their sight of the project without rewriting its history.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageUsers");
    const { id } = await params;
    const body = revokeSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, id);
    if (!project) throw new ApiError(404, "Project not found");

    const target = await getMemberById(member.orgId, body.memberId);
    if (!target) throw new ApiError(404, "That account is not in this workspace");

    await revokeProjectAccess(member.orgId, project.id, target.id);

    await recordMemberAction(member, {
      action: "CLIENT_ACCESS_REVOKED",
      entityType: "project",
      entityId: project.id,
      summary: `${member.name} removed ${target.name}'s access to ${project.name}`,
      metadata: { projectId: project.id, memberId: target.id, email: target.email },
    });

    return NextResponse.json({ clients: await listClientsForProject(member.orgId, project.id) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
