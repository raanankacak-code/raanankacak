import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { uploadsRoot } from "@/lib/uploads";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/**
 * Local-disk file storage (Phase 1). Requires a persistent, writable
 * filesystem — this will NOT persist on ephemeral/serverless hosts
 * (e.g. Vercel). Fine for a self-hosted Node server or a VM/container
 * with a mounted volume. Swap for S3-compatible storage later if needed.
 */
export async function POST(request: Request) {
  try {
    const member = await requireMember();
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

    const ext = file.type.split("/")[1] || "bin";
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
