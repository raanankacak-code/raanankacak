import { NextResponse } from "next/server";
import { getApprovalById, withdrawApproval } from "@/lib/db/approvals";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { canWithdraw } from "@/lib/approvals";

/**
 * Withdrawing a request.
 *
 * There is no update path and no delete: a request that has been answered is
 * a record, and the only thing the contractor may do to one is take back a
 * question the client has not answered yet. Editing the title of something
 * already signed off would make the signature meaningless.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember("manageProjects");
    const { id } = await params;

    const existing = await getApprovalById(member.orgId, id);
    if (!existing) throw new ApiError(404, "Not found");
    if (!canWithdraw(existing.status)) {
      throw new ApiError(409, "The client has already answered this one. Raise a new request instead.");
    }

    // Conditional on still being PENDING inside the database too, so a
    // client answering at the same moment wins rather than being overwritten.
    const approval = await withdrawApproval(member.orgId, id);
    if (!approval) throw new ApiError(409, "The client answered this while you were withdrawing it.");

    await recordMemberAction(member, {
      action: "APPROVAL_WITHDRAWN",
      entityType: "project_approval",
      entityId: approval.id,
      summary: `${member.name} withdrew "${approval.title}" from the client`,
      metadata: { code: approval.code, projectId: approval.projectId },
    });

    return NextResponse.json({ approval });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
