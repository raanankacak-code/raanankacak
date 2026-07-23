import { beforeEach, describe, expect, it, vi } from "vitest";

const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const { GET } = await import("@/app/api/health/route");

function fakeClient(result: { error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.limit = vi.fn(async () => result);
  return { from: vi.fn(() => builder) };
}

beforeEach(() => {
  createAdminClientMock.mockReset();
});

describe("GET /api/health", () => {
  it("returns ok with a latency figure when the database responds", async () => {
    createAdminClientMock.mockReturnValue(fakeClient({ error: null }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.db).toBe("ok");
    expect(typeof body.latencyMs).toBe("number");
  });

  it("returns 503 degraded when the database is unreachable, without leaking error detail", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    createAdminClientMock.mockReturnValue(fakeClient({ error: new Error("connection refused to db.internal:5432") }));

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body).toEqual({ status: "degraded", db: "unreachable" });
    expect(JSON.stringify(body)).not.toContain("db.internal");
    vi.restoreAllMocks();
  });
});
