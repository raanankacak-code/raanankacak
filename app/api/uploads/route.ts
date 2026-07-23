import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireWritableMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { uploadsRoot } from "@/lib/uploads";
import { checkRateLimit } from "@/lib/rateLimit";

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
 * Local-disk file storage (Phase 1). Requires a persistent, writable
 * filesystem — this will NOT persist on ephemeral/serverless hosts
 * (e.g. Vercel). Fine for a self-hosted Node server or a VM/container
 * with a mounted volume. Swap for S3-compatible storage later if needed.
 */
export async function POST(request: Request) {
  try {
    const member = await requireWritableMember();
    // Uploads land on local disk with no per-org storage quota — cap request
    // rate so one account can't fill the shared disk (affects every org).
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
      throw new ApiError(400, "File too large (max 8MB)");
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
    const ext = EXT_BY_TYPE[file.type] || "bin";
    const filename = `${randomUUID()}.${ext}`;
    const orgDir = path.join(uploadsRoot(), member.orgId);
    await mkdir(orgDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(orgDir, filename), buffer);

    return NextResponse.json(
      { url: `/api/uploads/${member.orgId}/${filename}` },
      { status: 201 },
    );
  } catch (err) {
    return apiErrorResponse(err);
  }
}
