import { NextResponse } from "next/server";
import { z } from "zod";
import { listProjectsForOrgViaSession, createProject } from "@/lib/db/projects";
import { requireMember, requireWritableMember, apiErrorResponse } from "@/lib/auth";
import { assertCanCreateProject } from "@/lib/billing/limits";
import { recordMemberAction } from "@/lib/db/auditLog";

const projectSchema = z.object({
  name: z.string().min(2).max(200),
  client: z.string().max(200).optional(),
  siteAddress: z.string().max(300).optional(),
  contractValue: z.coerce.number().nonnegative().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "COMPLETED", "ON_HOLD"]).optional(),
  managerName: z.string().max(120).optional(),
});

export async function GET() {
  try {
    const member = await requireMember();
    const projects = await listProjectsForOrgViaSession(member.orgId);
    return NextResponse.json({ projects });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("manageProjects");
    await assertCanCreateProject(member.orgId);
    const body = projectSchema.parse(await request.json());

    const project = await createProject(member.orgId, {
      name: body.name,
      client: body.client,
      siteAddress: body.siteAddress,
      contractValue: body.contractValue,
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
      status: body.status ?? "PLANNING",
      managerName: body.managerName,
    });

    await recordMemberAction(member, {
      action: "PROJECT_CREATED",
      entityType: "project",
      entityId: project.id,
      summary: `${member.name} created the project "${project.name}"${project.client ? ` for ${project.client}` : ""}`,
      metadata: { name: project.name, client: project.client, contractValue: project.contractValue },
    });
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
