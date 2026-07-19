import { NextResponse } from "next/server";
import { getProjectById } from "@/lib/db/projects";
import { listActiveWorkersForOrg } from "@/lib/db/workers";
import { sumLaborCostForProject, getDaysWorkedByWorkerForProject } from "@/lib/db/attendance";
import { listRequestsForProject } from "@/lib/db/materials";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const member = await requireMember("costReports");
    const { id: projectId } = await params;
    const project = await getProjectById(member.orgId, projectId);
    if (!project) throw new ApiError(404, "Project not found");

    const [workers, laborCost, daysByWorker, requests] = await Promise.all([
      listActiveWorkersForOrg(member.orgId, projectId),
      sumLaborCostForProject(projectId),
      getDaysWorkedByWorkerForProject(projectId),
      listRequestsForProject(projectId),
    ]);

    const contractValue = project.contractValue ?? 0;
    const earnedValue = Math.round((contractValue * project.progressPct) / 100);
    const delivered = requests.filter((r) => r.status === "DELIVERED").length;
    const committed = requests.filter((r) => r.status === "APPROVED" || r.status === "ORDERED").length;

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
