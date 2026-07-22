import { NextResponse } from "next/server";
import { z } from "zod";
import { createBugReport } from "@/lib/db/bugReports";
import { notify } from "@/lib/db/notifications";
import { requireMember, apiErrorResponse } from "@/lib/auth";

const createSchema = z.object({
  area: z.string().min(1).max(80),
  severity: z.string().min(1).max(40),
  description: z.string().min(1).max(4000),
  steps: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  try {
    const member = await requireMember();
    const body = createSchema.parse(await request.json());

    const report = await createBugReport(member.orgId, {
      reportedByUserId: member.userId,
      reportedByName: member.name,
      reportedByEmail: member.email,
      ...body,
    });

    await notify(
      member.orgId,
      "bug_report",
      "Bug Reported",
      `${member.name} reported an issue in ${body.area} (${report.ref}).`,
    );

    return NextResponse.json({ report }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
