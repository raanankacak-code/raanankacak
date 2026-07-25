import { NextResponse } from "next/server";
import { getDocumentById, deleteDocument } from "@/lib/db/documents";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { removeObjectsByUrl } from "@/lib/uploads";
import { can } from "@/lib/permissions";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireWritableMember();
    const { id } = await params;
    const doc = await getDocumentById(member.orgId, id);
    if (!doc) throw new ApiError(404, "Document not found");
    if (!can(member.role, "manageDocs") && doc.uploadedById !== member.id) {
      throw new ApiError(403, "Your role can't delete this document");
    }
    await deleteDocument(member.orgId, id);
    await removeObjectsByUrl(member.orgId, [doc.url]);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
