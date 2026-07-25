import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrgMember } from "@/lib/db/types";

const requireMemberMock = vi.fn();
const putObjectMock = vi.fn();
const getObjectMock = vi.fn();
const checkRateLimitMock = vi.fn();

vi.mock("@/lib/auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
  return { ...actual, requireMember: requireMemberMock, requireWritableMember: requireMemberMock };
});

vi.mock("@/lib/uploads", () => ({
  putObject: putObjectMock,
  getObject: getObjectMock,
  objectKey: (orgId: string, filename: string) => `${orgId}/${filename}`,
  UPLOADS_BUCKET: "uploads",
}));

vi.mock("@/lib/rateLimit", () => ({ checkRateLimit: checkRateLimitMock }));

const assertCanStoreFileMock = vi.fn();

vi.mock("@/lib/billing/limits", () => ({ assertCanStoreFile: assertCanStoreFileMock }));

const { POST } = await import("@/app/api/uploads/route");
const { GET } = await import("@/app/api/uploads/[...path]/route");

const MEMBER_ORG_A: OrgMember = {
  id: "member-1",
  orgId: "org-A",
  userId: "user-1",
  name: "Org A Manager",
  email: "manager@org-a.test",
  role: "PROJECT_MANAGER",
  active: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

function uploadRequest(file: File) {
  const form = new FormData();
  form.append("file", file);
  return new Request("http://localhost/api/uploads", { method: "POST", body: form });
}

function pngFile(bytes = 10, name = "photo.png") {
  return new File([new Uint8Array(bytes)], name, { type: "image/png" });
}

beforeEach(() => {
  requireMemberMock.mockReset();
  putObjectMock.mockReset();
  getObjectMock.mockReset();
  checkRateLimitMock.mockReset();

  assertCanStoreFileMock.mockReset();

  requireMemberMock.mockResolvedValue(MEMBER_ORG_A);
  checkRateLimitMock.mockReturnValue({ allowed: true });
  putObjectMock.mockResolvedValue(undefined);
  assertCanStoreFileMock.mockResolvedValue(undefined);
});

describe("POST /api/uploads", () => {
  it("stores the file under the caller's own org, never a client-supplied one", async () => {
    const res = await POST(uploadRequest(pngFile()));

    expect(res.status).toBe(201);
    expect(putObjectMock).toHaveBeenCalledTimes(1);
    expect(putObjectMock.mock.calls[0][0]).toBe("org-A");
  });

  it("generates its own filename instead of trusting the uploaded name", async () => {
    // A client-supplied name could carry path separators ("../") or a
    // misleading double extension ("invoice.pdf.html").
    await POST(uploadRequest(pngFile(10, "../../etc/passwd.png")));

    const storedName = putObjectMock.mock.calls[0][1] as string;
    expect(storedName).not.toContain("/");
    expect(storedName).not.toContain("..");
    expect(storedName).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("returns a URL pointing at this app's download route, not at storage", async () => {
    // Persisted in the DB — it must stay behind the app's org check, and must
    // not be a storage URL that could outlive or bypass that check.
    const res = await POST(uploadRequest(pngFile()));
    const body = await res.json();

    expect(body.url).toMatch(/^\/api\/uploads\/org-A\/[0-9a-f-]{36}\.png$/);
  });

  it("rejects a disallowed file type before touching storage", async () => {
    const res = await POST(uploadRequest(new File(["<script/>"], "x.html", { type: "text/html" })));

    expect(res.status).toBe(400);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects an oversized file before touching storage", async () => {
    const res = await POST(uploadRequest(pngFile(21 * 1024 * 1024)));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "File too large (max 20MB)" });
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects when the upload rate limit is exhausted", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false });

    const res = await POST(uploadRequest(pngFile()));

    expect(res.status).toBe(429);
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("checks the storage quota against this file's size, and refuses when over", async () => {
    const { ApiError } = await import("@/lib/auth");
    assertCanStoreFileMock.mockRejectedValue(new ApiError(402, "over quota"));

    const res = await POST(uploadRequest(pngFile(1234)));

    expect(res.status).toBe(402);
    expect(assertCanStoreFileMock).toHaveBeenCalledWith("org-A", 1234);
    expect(putObjectMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/uploads/[...path]", () => {
  function getRequest(segments: string[]) {
    return GET(new Request("http://localhost/api/uploads"), {
      params: Promise.resolve({ path: segments }),
    });
  }

  it("streams back a file belonging to the caller's org", async () => {
    getObjectMock.mockResolvedValue(new Uint8Array([1, 2, 3]).buffer);

    const res = await getRequest(["org-A", "file.png"]);

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("image/png");
    expect(getObjectMock).toHaveBeenCalledWith("org-A", "file.png");
  });

  it("404s on another org's file without ever reading it", async () => {
    const res = await getRequest(["org-B", "file.png"]);

    expect(res.status).toBe(404);
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it("404s a missing file the same way as another org's, leaking no existence info", async () => {
    getObjectMock.mockResolvedValue(null);

    const missing = await getRequest(["org-A", "gone.png"]);
    const otherOrg = await getRequest(["org-B", "file.png"]);

    expect(missing.status).toBe(404);
    expect(otherOrg.status).toBe(404);
    expect(await missing.json()).toEqual(await otherOrg.json());
  });

  it("rejects a nested path that tries to escape the org folder", async () => {
    const res = await getRequest(["org-A", "..", "org-B", "file.png"]);

    expect(res.status).toBe(404);
    expect(getObjectMock).not.toHaveBeenCalled();
  });

  it("marks the response private and nosniff so it is never shared or re-typed", async () => {
    getObjectMock.mockResolvedValue(new Uint8Array([1]).buffer);

    const res = await getRequest(["org-A", "file.png"]);

    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  it("forces download for an unrecognised extension instead of rendering it inline", async () => {
    getObjectMock.mockResolvedValue(new Uint8Array([1]).buffer);

    const res = await getRequest(["org-A", "file.weird"]);

    expect(res.headers.get("Content-Disposition")).toBe("attachment");
    expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
  });
});
