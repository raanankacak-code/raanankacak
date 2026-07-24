import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(),
}));

const { listAttendanceForProjectDateViaSession } = await import("@/lib/db/attendance");

beforeEach(() => {
  eqMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  // The real chain terminates on the second .eq() call, which supabase-js
  // makes directly awaitable (thenable) — no trailing .order()/.limit().
  const chain = { eq: eqMock, then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }) };
  eqMock.mockReturnValue(chain);
  selectMock.mockReturnValue(chain);
  fromMock.mockReturnValue({ select: selectMock });
  createSessionClientMock.mockResolvedValue({ from: fromMock });
});

describe("listAttendanceForProjectDateViaSession", () => {
  it("queries through the session-bound (RLS-subject) client, not the admin client", async () => {
    await listAttendanceForProjectDateViaSession("project-1", "2026-07-19");

    expect(createSessionClientMock).toHaveBeenCalledTimes(1);
    expect(fromMock).toHaveBeenCalledWith("attendance_records");
  });

  it("still applies the project_id and date filters as defense in depth alongside RLS", async () => {
    await listAttendanceForProjectDateViaSession("project-1", "2026-07-19");

    expect(eqMock).toHaveBeenCalledWith("project_id", "project-1");
    expect(eqMock).toHaveBeenCalledWith("date", "2026-07-19");
  });

  it("propagates a query error instead of swallowing it", async () => {
    eqMock.mockReturnValueOnce({
      eq: vi.fn(() => ({ then: (resolve: (v: unknown) => void) => resolve({ data: null, error: new Error("query failed") }) })),
    });

    await expect(listAttendanceForProjectDateViaSession("project-1", "2026-07-19")).rejects.toThrow("query failed");
  });
});
