import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { projectId } = await searchParams;

  const [reports, projects] = await Promise.all([
    prisma.dailyReport.findMany({
      where: { orgId: member.orgId, projectId: projectId || undefined },
      orderBy: { date: "desc" },
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.project.findMany({ where: { orgId: member.orgId }, select: { id: true, name: true } }),
  ]);

  const filteredProject = projects.find((p) => p.id === projectId);

  return (
    <>
      <div className="topbar">
        <h2>Daily Reports</h2>
        {can(member.role, "submitReports") && (
          <div className="top-actions">
            <Link href={`/reports/new${projectId ? `?projectId=${projectId}` : ""}`} className="btn btn-amber">
              + New report
            </Link>
          </div>
        )}
        <div className="sub">
          Site diary submitted from the field.{filteredProject ? ` Filtered to ${filteredProject.name}.` : ""}
        </div>
      </div>

      <div className="filters">
        <ProjectFilterSelect projects={projects} selected={projectId} basePath="/reports" />
      </div>

      <div className="card">
        {reports.length === 0 ? (
          <div className="empty">
            <div className="e-ic">📋</div>
            <div className="e-t">No daily reports yet</div>
            <p>File a report from site — weather, manpower, work completed and photos.</p>
            {can(member.role, "submitReports") && (
              <Link href="/reports/new" className="btn btn-amber">
                + New report
              </Link>
            )}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Project</th>
                  <th>Weather</th>
                  <th>Submitted by</th>
                  <th>Work completed</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id} className="rowlink">
                    <td className="mono">{formatDate(r.date)}</td>
                    <td>
                      <Link href={`/reports/${r.id}`}>
                        <b>{r.project.name}</b>
                      </Link>
                    </td>
                    <td>{r.weather || "—"}</td>
                    <td>{r.submittedByName}</td>
                    <td style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {r.workCompleted || "—"}
                    </td>
                    <td>
                      <span className={`badge ${statusBadgeClass(r.status)}`}>
                        <i className="dot" />
                        {statusLabel(r.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
