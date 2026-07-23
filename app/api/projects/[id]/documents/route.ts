import { NextResponse } from "next/server";
import { z } from "zod";
import { getProjectById } from "@/lib/db/projects";
import { listDocumentsForProject, createDocument } from "@/lib/db/documents";
import { notify } from "@/lib/db/notifications";
import { requireMember, requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { safeUrlSchema } from "@/lib/url-validation";

const createSchema = z.object({
  folder: z.string().min(1).max(60).default("Other"),
  name: z.string().min(1).max(300),
  url: safeUrlSchema,
  sizeBytes: z.coerce.number().nonnegative(),
  mimeType: z.string().max(120).optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember();
    const { id: projectId } = await params;
    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");
    const documents = await listDocumentsForProject(projectId);
    return NextResponse.json({ documents });
  } catch (err) {
    return apiErrorResponse(err);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember();
    if (!can(member.role, "uploadDocs") && !can(member.role, "manageDocs")) {
      throw new ApiError(403, "Your role can't upload documents");
    }
    const { id: projectId } = await params;
    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const body = createSchema.parse(await request.json());
    const document = await createDocument(member.orgId, projectId, {
      ...body,
      uploadedById: member.id,
      uploadedByName: member.name,
    });
    await notify(member.orgId, "document", "Document Uploaded", `${document.name} added to ${document.folder} — ${project.name}.`);
    return NextResponse.json({ document }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
