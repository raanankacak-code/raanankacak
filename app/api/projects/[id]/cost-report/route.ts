import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db/projects";
import { listActiveWorkersForOrgViaSession } from "@/lib/db/workers";
import { sumLaborCostForProject, getDaysWorkedByWorkerForProject } from "@/lib/db/attendance";
import { countRequestsByStatusForProject } from "@/lib/db/materials";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { assertCostReportsIncluded } from "@/lib/billing/limits";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("costReports");
    await assertCostReportsIncluded(member.orgId);
    const { id: projectId } = await params;
    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const [workers, laborCost, daysByWorker, requestCounts] = await Promise.all([
      listActiveWorkersForOrgViaSession(member.orgId, projectId),
      sumLaborCostForProject(projectId),
      getDaysWorkedByWorkerForProject(projectId),
      // Counted in the database: these are cost figures, and filtering a
      // fetched list would quietly undercount past 1000 requests.
      countRequestsByStatusForProject(projectId),
    ]);

    const contractValue = project.contractValue ?? 0;
    const earnedValue = Math.round((contractValue * project.progressPct) / 100);
    const delivered = requestCounts.DELIVERED;
    const committed = requestCounts.APPROVED + requestCounts.ORDERED;

    const workerRows = workers.map((w) => {
      const daysWorked = daysByWorker[w.id] ?? 0;
      return {
        name: w.name,
        trade: w.trade,
        dailyRate: w.dailyRate,
        daysWorked,
        wages: daysWorked * (w.dailyRate ?? 0),
      };
    });

    return NextResponse.json({
      projectName: project.name,
      contractValue,
      progressPct: project.progressPct,
      plannedPct: project.plannedPct,
      earnedValue,
      laborCost,
      delivered,
      committed,
      workers: workerRows,
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
