import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listInspectionsForOrgViaSession,
  countInspectionsForOrg,
  createInspection,
} from "@/lib/db/safety";
import { getProjectById } from "@/lib/db/projects";
import { notify } from "@/lib/db/notifications";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { safeUrlSchema } from "@/lib/url-validation";

const itemSchema = z.object({
  category: z.string().min(1).max(60),
  item: z.string().min(1).max(200),
  result: z.enum(["PASS", "FAIL", "NA"]),
  note: z.string().max(500).optional(),
});

// `outcome`, `status` and `failedCount` are deliberately absent: they are
// derived server-side from the items. Accepting them would let a caller file
// a failing inspection as a pass.
const createSchema = z.object({
  projectId: z.string().uuid(),
  date: z.string().min(1),
  items: z.array(itemSchema).min(1).max(200),
  notes: z.string().max(2000).optional(),
  photos: z.array(safeUrlSchema).max(20).optional(),
});

export async function GET(request: Request) {
  try {
    const member = await requireMember("viewReports");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    const [inspections, total] = await Promise.all([
      listInspectionsForOrgViaSession(member.orgId, { projectId, offset }),
      countInspectionsForOrg(member.orgId, { projectId }),
    ]);
    return NextResponse.json({ inspections, total, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("submitInspections");
    const body = createSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const inspection = await createInspection(member.orgId, {
      ...body,
      inspectorId: member.id,
      inspectorName: member.name,
    });

    if (inspection.failedCount > 0) {
      await notify(
        member.orgId,
        "safety",
        inspection.outcome === "FAIL" ? "Safety Inspection Failed" : "Safety Actions Required",
        `${inspection.code} on ${project.name} found ${inspection.failedCount} issue${inspection.failedCount === 1 ? "" : "s"}.`,
      );
    }

    await recordMemberAction(member, {
      action: "SAFETY_INSPECTION_FILED",
      entityType: "safety_inspection",
      entityId: inspection.id,
      summary: `${member.name} filed safety inspection ${inspection.code} on "${project.name}" — ${inspection.outcome.replace("_", " ").toLowerCase()}, ${inspection.failedCount} finding${inspection.failedCount === 1 ? "" : "s"}`,
      metadata: {
        code: inspection.code,
        date: inspection.date,
        outcome: inspection.outcome,
        failedCount: inspection.failedCount,
        projectId: project.id,
      },
    });

    return NextResponse.json({ inspection }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
