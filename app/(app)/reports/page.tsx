import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { listReportsViaSession, countReportsForOrg, DEFAULT_LIST_LIMIT } from "@/lib/db/reports";
import { listProjectNamesForOrg } from "@/lib/db/projects";
import { can } from "@/lib/permissions";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";
import ReportsTable from "./ReportsTable";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { projectId } = await searchParams;

  const [reports, projects, totalReports] = await Promise.all([
    listReportsViaSession(member.orgId, { projectId: projectId || undefined }),
    listProjectNamesForOrg(member.orgId),
    countReportsForOrg(member.orgId, { projectId: projectId || undefined }),
  ]);

  // The list is capped. Saying so beats quietly showing a subset — before
  // this, a workspace past the cap looked like it simply had fewer reports.
  const capped = totalReports > reports.length;

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
          {capped
            ? ` Showing the ${DEFAULT_LIST_LIMIT} most recent of ${totalReports} — narrow by project to see older ones.`
            : ""}
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
          <ReportsTable
            rows={reports.map((r) => ({
              id: r.id,
              date: r.date.toISOString().slice(0, 10),
              projectName: r.project.name,
              weather: r.weather,
              submittedByName: r.submittedByName,
              workCompleted: r.workCompleted,
              status: r.status,
            }))}
          />
        )}
      </div>
    </>
  );
}
