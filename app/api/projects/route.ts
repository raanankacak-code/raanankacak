import { NextResponse } from "next/server";
import { z } from "zod";
import { listProjectsForOrg, createProject } from "@/lib/db/projects";
import { requireMember, apiErrorResponse } from "@/lib/auth";

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
    const projects = await listProjectsForOrg(member.orgId);
    return NextResponse.json({ projects });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const member = await requireMember("manageProjects");
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
    return NextResponse.json({ project }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
