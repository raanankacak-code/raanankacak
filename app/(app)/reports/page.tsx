import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { listReportsViaSession, countReportsForOrg, DEFAULT_LIST_LIMIT } from "@/lib/db/reports";
import { listProjectNamesForOrg } from "@/lib/db/projects";
import { can } from "@/lib/permissions";
import ProjectFilterSelect from "@/components/app/ProjectFilterSelect";
import ReportsTable from "./ReportsTable";

/** One page of the list. Stepping by this rather than by the number of rows
 *  returned keeps "Newer" landing on real page boundaries from a short last
 *  page. */
const PAGE_SIZE = DEFAULT_LIST_LIMIT;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; offset?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { projectId, offset: offsetParam } = await searchParams;
  const offset = Math.max(0, Number(offsetParam) || 0);

  const [reports, projects, totalReports] = await Promise.all([
    listReportsViaSession(member.orgId, { projectId: projectId || undefined, offset }),
    listProjectNamesForOrg(member.orgId),
    countReportsForOrg(member.orgId, { projectId: projectId || undefined }),
  ]);

  // Real offsets rather than a hard cap: a workspace past DEFAULT_LIST_LIMIT
  // used to be shown its most recent page with no way to reach anything
  // older, which for a site diary is the half that matters at audit time.
  const firstShown = reports.length === 0 ? 0 : offset + 1;
  const lastShown = offset + reports.length;
  const hasOlder = lastShown < totalReports;
  const pageHref = (nextOffset: number) => {
    const params = new URLSearchParams();
    if (projectId) params.set("projectId", projectId);
    if (nextOffset > 0) params.set("offset", String(nextOffset));
    const qs = params.toString();
    return `/reports${qs ? `?${qs}` : ""}`;
  };

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
          {totalReports > reports.length ? ` Showing ${firstShown}–${lastShown} of ${totalReports}.` : ""}
        </div>
      </div>

      <div className="filters">
        <ProjectFilterSelect projects={projects} selected={projectId} basePath="/reports" />
      </div>

      <div className="card">
        {reports.length === 0 && offset > 0 ? (
          // Only reachable by editing the URL past the end. Saying so beats
          // claiming the workspace has no reports when it plainly does.
          <div className="empty">
            <div className="e-ic">📋</div>
            <div className="e-t">Nothing on this page</div>
            <p>There are {totalReports} reports in total — go back to see them.</p>
            <Link href={pageHref(0)} className="btn btn-amber">
              Back to the latest
            </Link>
          </div>
        ) : reports.length === 0 ? (
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

      {(offset > 0 || hasOlder) && (
        <div className="filters">
          {offset > 0 && (
            <Link href={pageHref(Math.max(0, offset - PAGE_SIZE))} className="btn">
              ← Newer
            </Link>
          )}
          {hasOlder && (
            <Link href={pageHref(offset + PAGE_SIZE)} className="btn">
              Older →
            </Link>
          )}
        </div>
      )}
    </>
  );
}
