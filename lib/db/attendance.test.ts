import { beforeEach, describe, expect, it, vi } from "vitest";

const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const createSessionClientMock = vi.fn();
const createAdminClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: createSessionClientMock,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: createAdminClientMock,
}));

const {
  listAttendanceForProjectDateViaSession,
  sumLaborCostForProject,
  getDaysWorkedByWorkerForProject,
  sumLaborCostForOrg,
  getDaysWorkedByWorker,
} = await import("@/lib/db/attendance");

beforeEach(() => {
  eqMock.mockReset();
  selectMock.mockReset();
  fromMock.mockReset();
  createSessionClientMock.mockReset();

  // The real chain terminates on the second .eq() call, which supabase-js
  // makes directly awaitable (thenable) — no trailing .order()/.limit().
  const chain = {
    eq: eqMock,
    then: (resolve: (v: unknown) => void) => resolve({ data: [], error: null }),
  };
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
      eq: vi.fn(() => ({
        then: (resolve: (v: unknown) => void) =>
          resolve({ data: null, error: new Error("query failed") }),
      })),
    });

    await expect(
      listAttendanceForProjectDateViaSession("project-1", "2026-07-19"),
    ).rejects.toThrow("query failed");
  });
});

/**
 * The cost report's two figures. Both used to sum a fetched list, which
 * PostgREST caps at 1000 rows — measured against a real project of 40
 * workers over 60 days, that reported RM 114,000 of labour against a true
 * RM 270,000. Aggregating in the database is the fix, so what these tests
 * hold is that the aggregation is where the number comes from.
 */
describe("cost report figures", () => {
  const rpcMock = vi.fn();

  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
    createAdminClientMock.mockReturnValue({ rpc: rpcMock, from: fromMock });
  });

  it("sums wages in the database rather than over a capped row list", async () => {
    rpcMock.mockResolvedValue({ data: 270000, error: null });

    expect(await sumLaborCostForProject("project-1")).toBe(270000);
    expect(rpcMock).toHaveBeenCalledWith("labor_cost_for_project", {
      p_project_id: "project-1",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reads a numeric wage total returned as a string", async () => {
    // numeric comes back from PostgREST as a string once it is large enough.
    rpcMock.mockResolvedValue({ data: "270000.5", error: null });

    expect(await sumLaborCostForProject("project-1")).toBe(270000.5);
  });

  it("reports zero wages for a project with no attendance", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    expect(await sumLaborCostForProject("project-1")).toBe(0);
  });

  it("groups days worked per worker in the database", async () => {
    rpcMock.mockResolvedValue({
      data: [
        { worker_id: "w-1", days: 45 },
        { worker_id: "w-2", days: "12.5" },
      ],
      error: null,
    });

    expect(await getDaysWorkedByWorkerForProject("project-1")).toEqual({
      "w-1": 45,
      "w-2": 12.5,
    });
    expect(rpcMock).toHaveBeenCalledWith("days_worked_by_worker_for_project", {
      p_project_id: "project-1",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("propagates an aggregation error instead of reporting no cost", async () => {
    // Returning 0 here would put a confident, wrong number on a cost report.
    rpcMock.mockResolvedValue({ data: null, error: new Error("rpc failed") });

    await expect(sumLaborCostForProject("project-1")).rejects.toThrow(
      "rpc failed",
    );
    await expect(getDaysWorkedByWorkerForProject("project-1")).rejects.toThrow(
      "rpc failed",
    );
  });
});

/**
 * The org-wide pair, behind the dashboard wage total and the monthly
 * attendance summary. Measured on a 2400-record org, the old capped select
 * returned 30 of 60 workers — half the crew missing from the summary
 * outright — at 25.5 days each instead of 30.
 */
describe("org-wide labour figures", () => {
  const rpcMock = vi.fn();

  beforeEach(() => {
    rpcMock.mockReset();
    rpcMock.mockResolvedValue({ data: null, error: null });
    createAdminClientMock.mockReturnValue({ rpc: rpcMock, from: fromMock });
  });

  it("totals org wages in the database", async () => {
    rpcMock.mockResolvedValue({ data: "180000", error: null });

    expect(await sumLaborCostForOrg("org-1")).toBe(180000);
    expect(rpcMock).toHaveBeenCalledWith("labor_cost_for_org", {
      p_org_id: "org-1",
    });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("passes the summary's date window through to the aggregate", async () => {
    rpcMock.mockResolvedValue({
      data: [{ worker_id: "w-1", days: 7.5 }],
      error: null,
    });

    await getDaysWorkedByWorker("org-1", {
      from: "2025-01-01",
      to: "2025-01-31",
    });

    expect(rpcMock).toHaveBeenCalledWith("days_worked_by_worker", {
      p_org_id: "org-1",
      p_from: "2025-01-01",
      p_to: "2025-01-31",
      p_project_id: null,
    });
  });

  it("narrows to one project when the summary is filtered", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });

    await getDaysWorkedByWorker(
      "org-1",
      { from: "2025-01-01", to: "2025-01-31" },
      "project-9",
    );

    expect(rpcMock).toHaveBeenCalledWith(
      "days_worked_by_worker",
      expect.objectContaining({ p_project_id: "project-9" }),
    );
  });

  it("keeps every worker the aggregate returns", async () => {
    // The capped version silently dropped whole workers, not just days.
    rpcMock.mockResolvedValue({
      data: Array.from({ length: 60 }, (_, i) => ({
        worker_id: `w-${i}`,
        days: 30,
      })),
      error: null,
    });

    const days = await getDaysWorkedByWorker("org-1", {
      from: "2025-01-01",
      to: "2025-12-31",
    });

    expect(Object.keys(days)).toHaveLength(60);
  });

  it("propagates an aggregation error rather than showing zero wages", async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error("rpc failed") });

    await expect(sumLaborCostForOrg("org-1")).rejects.toThrow("rpc failed");
    await expect(
      getDaysWorkedByWorker("org-1", { from: "a", to: "b" }),
    ).rejects.toThrow("rpc failed");
  });
});
