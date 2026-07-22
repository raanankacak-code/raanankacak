import { NextResponse } from "next/server";
import { z } from "zod";
import { listInvitesForOrg, createInvite } from "@/lib/db/team";
import { notify } from "@/lib/db/notifications";
import { getOrganizationById } from "@/lib/db/organizations";
import { requireMember, apiErrorResponse } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { sendEmail, inviteEmailHtml } from "@/lib/email";

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

const inviteSchema = z.object({
  name: z.string().min(1).max(120),
  email: z.string().email(),
  role: z.enum(ROLES),
  phone: z.string().max(40).optional(),
  department: z.string().max(80).optional(),
  projectIds: z.array(z.string().uuid()).optional(),
});

export async function GET() {
  try {
    const member = await requireMember("manageUsers");
    const invites = await listInvitesForOrg(member.orgId);
    return NextResponse.json({ invites });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember("manageUsers");
    const body = inviteSchema.parse(await request.json());
    if (body.role === "OWNER" && member.role !== "OWNER") {
      return NextResponse.json({ error: "Only the Owner can invite another Owner" }, { status: 403 });
    }
    const invite = await createInvite(member.orgId, { ...body, invitedByName: member.name });
    await notify(member.orgId, "invite", "User Invited", `${body.email} invited as ${ROLE_LABELS[body.role]} by ${member.name}.`);

    const org = await getOrganizationById(member.orgId);
    const link = `${new URL(request.url).origin}/signup?invite=${invite.token}`;
    await sendEmail({
      to: invite.email,
      subject: `You're invited to join ${org?.name ?? "your company"} on BinaWorks`,
      html: inviteEmailHtml({
        orgName: org?.name ?? "your company",
        roleLabel: ROLE_LABELS[body.role],
        invitedByName: member.name,
        link,
      }),
    });

    return NextResponse.json({ invite }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
