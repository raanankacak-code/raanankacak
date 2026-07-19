import { NextResponse } from "next/server";
import { getDaysWorkedByWorker } from "@/lib/db/attendance";
import { listActiveWorkersForOrg } from "@/lib/db/workers";
import { getProjectById } from "@/lib/db/projects";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const url = new URL(request.url);
    const month = url.searchParams.get("month");
    const projectId = url.searchParams.get("projectId") || undefined;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      throw new ApiError(400, "month is required, format YYYY-MM");
    }
    if (projectId) {
      const project = await getProjectById(member.orgId, projectId);
      if (!project) throw new ApiError(404, "Project not found");
    }

    const from = `${month}-01`;
    const to = `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;

    const [workers, daysByWorker] = await Promise.all([
      listActiveWorkersForOrg(member.orgId, projectId),
      getDaysWorkedByWorker(member.orgId, { from, to }, projectId),
    ]);

    const rows = workers.map((w) => {
      const daysWorked = daysByWorker[w.id] ?? 0;
      const wages = daysWorked * (w.dailyRate ?? 0);
      return {
        id: w.id,
        name: w.name,
        trade: w.trade,
        icNumber: w.icNumber,
        dailyRate: w.dailyRate,
        cidbNumber: w.cidbNumber,
        cidbExpiry: w.cidbExpiry,
        daysWorked,
        wages,
      };
    });

    const totalWages = rows.reduce((sum, r) => sum + r.wages, 0);
    return NextResponse.json({ rows, totalWages });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
