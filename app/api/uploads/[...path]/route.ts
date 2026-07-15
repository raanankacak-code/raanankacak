import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { uploadsRoot } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
};

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const member = await requireMember();
    const { path: segments } = await params;
    const [orgId, ...rest] = segments;

    if (orgId !== member.orgId) {
      throw new ApiError(404, "Not found");
    }

    const root = uploadsRoot();
    const filePath = path.resolve(root, orgId, ...rest);
    if (!filePath.startsWith(path.join(root, orgId))) {
      throw new ApiError(400, "Invalid path");
    }

    const ext = path.extname(filePath).slice(1).toLowerCase();
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    const data = await readFile(filePath);
    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return apiErrorResponse(err);
  }
}
