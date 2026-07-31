import { NextResponse } from "next/server";
import { z } from "zod";
import { getApprovalViaSession, recordDecision } from "@/lib/db/approvals";
import { notify } from "@/lib/db/notifications";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireClient, apiErrorResponse, ApiError } from "@/lib/auth";
import { canDecide, decisionCommentProblem } from "@/lib/approvals";

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "REJECTED"]),
  comment: z.string().max(2000).optional(),
});

/**
 * The client signs.
 *
 * The only write in the whole app a client account can make, so everything
 * about it is deliberate: the row is read through their own session first
 * (row-level security answers "is this yours?" as part of the read, not as a
 * separate check), the decision is conditional on the row still being pending
 * in the database, and the name and email written into the record are taken
 * from the signed-in account rather than from the request.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireClient();
    const { id } = await params;
    const body = decisionSchema.parse(await request.json());

    const existing = await getApprovalViaSession(member.orgId, id);
    // 404 rather than 403: whether a request exists on a project they cannot
    // see is itself information.
    if (!existing) throw new ApiError(404, "Not found");

    if (!canDecide(existing.status, body.decision)) {
      throw new ApiError(409, "This has already been answered.");
    }
    const problem = decisionCommentProblem(body.decision, body.comment);
    if (problem) throw new ApiError(400, problem);

    const approval = await recordDecision(member.orgId, id, {
      decision: body.decision,
      comment: body.comment,
      memberId: member.id,
      memberName: member.name,
      memberEmail: member.email,
    });
    // Null means the row stopped being pending between the read above and
    // the write — two taps on a slow connection, or a withdrawal landing at
    // the same moment. The first answer stands.
    if (!approval) throw new ApiError(409, "This has already been answered.");

    const verb = approval.status === "APPROVED" ? "approved" : "rejected";
    await notify(
      member.orgId,
      "approval",
      `Client ${verb} ${approval.code}`,
      `${member.name} ${verb} "${approval.title}"${approval.decisionComment ? `: ${approval.decisionComment}` : "."}`,
    );
    // Recorded under the client's own name: this is the entry someone will
    // look for months later when asked who signed off what.
    await recordMemberAction(member, {
      action: "APPROVAL_DECIDED",
      entityType: "project_approval",
      entityId: approval.id,
      summary: `${member.name} ${verb} "${approval.title}"`,
      metadata: {
        code: approval.code,
        projectId: approval.projectId,
        decision: approval.status,
        decidedByEmail: approval.decidedByEmail,
      },
    });

    return NextResponse.json({ approval });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
