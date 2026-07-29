import { NextResponse } from "next/server";
import { z } from "zod";
import { listDefectsForOrgViaSession, countDefectsForOrg, createDefect } from "@/lib/db/defects";
import { getProjectById } from "@/lib/db/projects";
import { getMemberById } from "@/lib/db/team";
import { notify } from "@/lib/db/notifications";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { safeUrlSchema } from "@/lib/url-validation";
import { DEFECT_SEVERITIES, DEFECT_STATUSES } from "@/lib/defects";

// `status`, `code`, `raisedBy*` and both close-out fields are deliberately
// absent. A caller that could set the status could raise a defect already
// closed, which is a record of nothing; the rest are the server's to decide.
const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(200),
  location: z.string().max(200).optional(),
  description: z.string().max(4000).optional(),
  severity: z.enum(DEFECT_SEVERITIES as [string, ...string[]]),
  /** An org_members id. Verified below to belong to this org. */
  assignedToId: z.string().uuid().optional(),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  photos: z.array(safeUrlSchema).max(12).optional(),
});

export async function GET(request: Request) {
  try {
    // Viewing matches the safety module: anyone who can see reports can see
    // the snag list. A defect nobody may look at cannot be chased.
    const member = await requireMember("viewReports");
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? undefined;
    const status = DEFECT_STATUSES.find((s) => s === statusParam);
    const offset = Math.max(0, Number(url.searchParams.get("offset") ?? 0) || 0);

    const [defects, total] = await Promise.all([
      listDefectsForOrgViaSession(member.orgId, { projectId, status, offset }),
      countDefectsForOrg(member.orgId, { projectId, status }),
    ]);
    return NextResponse.json({ defects, total, offset });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireWritableMember("raiseDefects");
    const body = createSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    // The assignee is resolved server-side rather than taken as a name from
    // the client. Otherwise a defect could be assigned to "Someone Else" —
    // a person who does not exist, or worse, someone in another workspace.
    let assignedToName: string | undefined;
    if (body.assignedToId) {
      const assignee = await getMemberById(member.orgId, body.assignedToId);
      if (!assignee) throw new ApiError(404, "That team member is not in this workspace");
      assignedToName = assignee.name;
    }

    const defect = await createDefect(member.orgId, {
      projectId: body.projectId,
      title: body.title,
      location: body.location,
      description: body.description,
      severity: body.severity as (typeof DEFECT_SEVERITIES)[number],
      assignedToId: body.assignedToId,
      assignedToName,
      dueDate: body.dueDate,
      photos: body.photos,
      raisedById: member.id,
      raisedByName: member.name,
    });

    // Only the severities somebody needs to act on today. Notifying on every
    // low-severity snag is how a notification bell gets ignored.
    if (defect.severity === "HIGH" || defect.severity === "CRITICAL") {
      await notify(
        member.orgId,
        "safety",
        defect.severity === "CRITICAL" ? "Critical Defect Raised" : "High-Severity Defect Raised",
        `${defect.code} on ${project.name}: ${defect.title}${defect.location ? ` (${defect.location})` : ""}`,
      );
    }

    await recordMemberAction(member, {
      action: "DEFECT_RAISED",
      entityType: "defect",
      entityId: defect.id,
      summary: `${member.name} raised defect ${defect.code} on "${project.name}" — ${defect.severity.toLowerCase()} severity${defect.assignedToName ? `, assigned to ${defect.assignedToName}` : ""}`,
      metadata: {
        code: defect.code,
        severity: defect.severity,
        projectId: project.id,
        assignedToId: defect.assignedToId,
        dueDate: defect.dueDate,
      },
    });

    return NextResponse.json({ defect }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
