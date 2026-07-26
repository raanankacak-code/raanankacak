import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById, getProjectWithWorkers, updateProject, deleteProject } from "@/lib/db/projects";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { recordAuditEvent, recordMemberAction } from "@/lib/db/auditLog";
import { listDocumentsForProject } from "@/lib/db/documents";
import { listReports } from "@/lib/db/reports";
import { removeObjectsByUrl } from "@/lib/uploads";
import { formatCurrency } from "@/lib/format";

const updateSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  client: z.string().max(200).optional(),
  siteAddress: z.string().max(300).optional(),
  contractValue: z.coerce.number().nonnegative().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(["PLANNING", "ACTIVE", "COMPLETED", "ON_HOLD"]).optional(),
  progressPct: z.coerce.number().int().min(0).max(100).optional(),
  plannedPct: z.coerce.number().int().min(0).max(100).optional(),
  managerName: z.string().max(120).optional(),
});

async function loadProjectOrThrow(orgId: string, id: string) {
  const project = await getProjectById(orgId, id);
  if (!project) throw new ApiError(404, "Project not found");
  return project;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireMember();
    const { id } = await params;
    const project = await getProjectWithWorkers(member.orgId, id);
    if (!project) throw new ApiError(404, "Project not found");
    return NextResponse.json({ project: { ...project, _count: { workers: project.workers.length } } });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("manageProjects");
    const { id } = await params;
    const existing = await loadProjectOrThrow(member.orgId, id);
    const body = updateSchema.parse(await request.json());

    const project = await updateProject(member.orgId, id, {
      ...body,
      startDate: body.startDate || undefined,
      endDate: body.endDate || undefined,
    });

    if (body.contractValue !== undefined && body.contractValue !== existing.contractValue) {
      await recordAuditEvent(member.orgId, {
        actorMemberId: member.id,
        actorName: member.name,
        action: "PROJECT_CONTRACT_VALUE_CHANGED",
        entityType: "project",
        entityId: project.id,
        summary: `${member.name} changed the contract value of "${project.name}" from ${formatCurrency(existing.contractValue)} to ${formatCurrency(body.contractValue)}`,
        metadata: { from: existing.contractValue, to: body.contractValue },
      });
    }

    return NextResponse.json({ project });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const member = await requireWritableMember("deleteProjects");
    const { id } = await params;
    const existing = await loadProjectOrThrow(member.orgId, id);

    // Deleting the project cascades its documents and daily reports away, so
    // collect the files they point at first — afterwards there is nothing
    // left to tell us which objects belonged to this project.
    const [documents, reports] = await Promise.all([
      listDocumentsForProject(id),
      listReports(member.orgId, { projectId: id }),
    ]);
    const fileUrls = [...documents.map((d) => d.url), ...reports.flatMap((r) => r.photos)];

    await deleteProject(member.orgId, id);
    await removeObjectsByUrl(member.orgId, fileUrls);

    // Recorded after the fact, and with counts, because this is the most
    // destructive thing a member can do short of deleting the workspace:
    // every report, request and document under the project goes with it.
    await recordMemberAction(member, {
      action: "PROJECT_DELETED",
      entityType: "project",
      entityId: id,
      summary: `${member.name} deleted the project "${existing.name}", along with ${reports.length} daily reports and ${documents.length} documents`,
      metadata: { name: existing.name, reports: reports.length, documents: documents.length, files: fileUrls.length },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
