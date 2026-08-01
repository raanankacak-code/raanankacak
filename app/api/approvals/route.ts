import { NextResponse } from "next/server";
import { z } from "zod";
import { createApproval, listApprovalsViaSession } from "@/lib/db/approvals";
import { getProjectById } from "@/lib/db/projects";
import { countClientsForProject, listClientsForProject } from "@/lib/db/projectAccess";
import { getOrganizationById } from "@/lib/db/organizations";
import { sendEmail, approvalRequestEmailHtml } from "@/lib/email";
import { appOrigin } from "@/lib/appOrigin";
import { recordMemberAction } from "@/lib/db/auditLog";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { safeUrlSchema } from "@/lib/url-validation";
import { APPROVAL_STATUSES } from "@/lib/approvals";

// `status`, `code`, `requestedBy*` and every decision field are deliberately
// absent. A caller who could set them could file a request already approved
// by a client who never saw it.
const createSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3).max(200),
  description: z.string().max(4000).optional(),
  photos: z.array(safeUrlSchema).max(12).optional(),
});

export async function GET(request: Request) {
  try {
    // Any member of staff may read the sign-off record; it is the project's
    // history, not a management secret. The client's own view of it comes
    // from the portal, through the same row-level security.
    const member = await requireMember();
    const url = new URL(request.url);
    const projectId = url.searchParams.get("projectId") ?? undefined;
    const statusParam = url.searchParams.get("status") ?? undefined;
    const status = APPROVAL_STATUSES.find((s) => s === statusParam);

    const approvals = await listApprovalsViaSession(member.orgId, { projectId, status });
    return NextResponse.json({ approvals });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    // Asking a customer to sign something off is running the project, so it
    // sits with the roles that run projects.
    const member = await requireWritableMember("manageProjects");
    const body = createSchema.parse(await request.json());

    const project = await getProjectById(member.orgId, body.projectId);
    if (!project) throw new ApiError(404, "Project not found");

    // A request nobody can answer is a request that sits pending for ever
    // and makes the app look broken. Say so at the point of asking.
    if ((await countClientsForProject(member.orgId, body.projectId)) === 0) {
      throw new ApiError(
        400,
        "No client has access to this project yet. Invite them from the Team page first, then raise this again.",
      );
    }

    const approval = await createApproval(member.orgId, {
      projectId: body.projectId,
      title: body.title,
      description: body.description,
      photos: body.photos,
      requestedById: member.id,
      requestedByName: member.name,
    });

    await recordMemberAction(member, {
      action: "APPROVAL_REQUESTED",
      entityType: "project_approval",
      entityId: approval.id,
      summary: `${member.name} sent "${approval.title}" to the client for sign-off on ${project.name}`,
      metadata: { code: approval.code, projectId: project.id },
    });

    // Tell them. Without this the request waits in the portal until the
    // client happens to sign in, which for a sign-off is the difference
    // between an answer this week and an answer when somebody telephones.
    // Deactivated accounts are skipped: they cannot sign in to answer.
    const org = await getOrganizationById(member.orgId);
    const link = `${appOrigin(request)}/portal/${project.id}`;
    const recipients = (await listClientsForProject(member.orgId, project.id)).filter((c) => c.active);
    const results = await Promise.all(
      recipients.map((c) =>
        sendEmail({
          to: c.email,
          subject: `${org?.name ?? "Your contractor"} needs your sign-off: ${approval.title}`,
          html: approvalRequestEmailHtml({
            orgName: org?.name ?? "Your contractor",
            projectName: project.name,
            title: approval.title,
            description: approval.description,
            link,
          }),
        }),
      ),
    );

    // 201 either way: the request exists and the client will see it when they
    // sign in. emailsSent is what lets the UI say whether anybody was told,
    // rather than implying it.
    return NextResponse.json(
      { approval, emailsSent: results.filter((r) => r.delivered).length, clientCount: recipients.length },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
