import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { putObject } from "@/lib/uploads";
import { assertCanStoreFile } from "@/lib/billing/limits";
import { checkRateLimit } from "@/lib/rateLimit";
import { can } from "@/lib/permissions";

const MAX_BYTES = 20 * 1024 * 1024; // 20MB
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
]);

/**
 * Accepts a file and stores it in the private Supabase Storage bucket under
 * the caller's own org prefix. The returned URL points back at this app's
 * download route rather than at storage directly, so every read stays behind
 * the org check there — see lib/uploads.ts for why.
 */
export async function POST(request: Request) {
  try {
    const member = await requireWritableMember();

    // This route only stores bytes; attaching them to a document, report or
    // company logo is permission-checked separately. But a role that can't
    // attach a file anywhere has no reason to store one either, and letting
    // it would let a read-only account burn the org's storage quota.
    const canAttachSomewhere =
      can(member.role, "uploadDocs") ||
      can(member.role, "manageDocs") ||
      can(member.role, "submitReports") ||
      can(member.role, "manageOrg");
    if (!canAttachSomewhere) {
      throw new ApiError(403, "Your role can't upload files");
    }

    // Rate-limit regardless of the storage quota below: that quota is a
    // ceiling, not a defence against one account churning through it.
    const rateLimit = checkRateLimit(`upload:${member.id}`, 30, 10 * 60_000);
    if (!rateLimit.allowed) {
      throw new ApiError(429, "Too many uploads. Try again in a few minutes.");
    }
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "No file provided");
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      throw new ApiError(400, "Unsupported file type");
    }
    if (file.size > MAX_BYTES) {
      throw new ApiError(400, `File too large (max ${MAX_BYTES / 1024 / 1024}MB)`);
    }

    const EXT_BY_TYPE: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "image/webp": "webp",
      "image/gif": "gif",
      "application/pdf": "pdf",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "text/plain": "txt",
    };
    // Checked after the cheap type/size rejections above, since it costs a
    // storage listing.
    await assertCanStoreFile(member.orgId, file.size);

    const ext = EXT_BY_TYPE[file.type] || "bin";
    // Server-generated name: never trust file.name, which is client-supplied
    // and could carry path separators or a misleading double extension.
    const filename = `${randomUUID()}.${ext}`;

    const buffer = Buffer.from(await file.arrayBuffer());
    await putObject(member.orgId, filename, buffer, file.type);

    return NextResponse.json(
      { url: `/api/uploads/${member.orgId}/${filename}` },
      { status: 201 },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
