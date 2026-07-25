import { NextResponse } from "next/server";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { getObject } from "@/lib/uploads";

const CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  txt: "text/plain",
};

/**
 * Streams a file back from the private uploads bucket. This route is the
 * only way to read an uploaded file, so the org check below is what enforces
 * tenant isolation for every document, site photo and logo in the app.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const member = await requireMember();
    const { path: segments } = await params;
    const [orgId, ...rest] = segments;
    const filename = rest.join("/");

    // Same 404 for another org's file as for a file that doesn't exist —
    // don't confirm the existence of objects the caller can't have.
    if (orgId !== member.orgId || rest.length !== 1) {
      throw new ApiError(404, "Not found");
    }

    const data = await getObject(orgId, filename);
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const ext = filename.split(".").pop()?.toLowerCase() ?? "";
    const contentType = CONTENT_TYPES[ext] ?? "application/octet-stream";

    return new NextResponse(new Uint8Array(data), {
      headers: {
        "Content-Type": contentType,
        // Never let a shared cache hold a tenant's file.
        "Cache-Control": "private, max-age=31536000, immutable",
        // Render inline only for types we trust; anything else downloads
        // instead of executing in the page's origin.
        "Content-Disposition": ext in CONTENT_TYPES ? "inline" : "attachment",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
