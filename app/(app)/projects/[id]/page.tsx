import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { getProjectWithWorkers } from "@/lib/db/projects";
import { getLatestReportForProject, countReportsForProject, countReportsByStatusForProject } from "@/lib/db/reports";
import { countRequestsByStatusForProject } from "@/lib/db/materials";
import { countOpenFindingsForProject } from "@/lib/db/safety";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import RemoveWorkerButton from "@/components/app/RemoveWorkerButton";
import DeleteProjectButton from "@/components/app/DeleteProjectButton";
import DocumentsPanel from "@/components/app/project/DocumentsPanel";
import CostReportButton from "@/components/app/project/CostReportButton";

function cidbBadge(expiry: Date | null) {
  if (!expiry) return null;
  const days = Math.round((expiry.getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="badge b-bad"><i className="dot" />Expired</span>;
  if (days <= 30) return <span className="badge b-amber"><i className="dot" />Exp {formatDate(expiry)}</span>;
  return <span className="small mut">exp {formatDate(expiry)}</span>;
}

function daysBetween(from: number, to: Date | null) {
  if (!to) return null;
  return Math.round((to.getTime() - from) / 86400000);
}

function nowMs() {
  return Date.now();
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { id } = await params;
  const { tab = "overview" } = await searchParams;

  const project = await getProjectWithWorkers(member.orgId, id);
  if (!project) notFound();

  // Both "needs attention" figures are counted in the database. They used to
  // come from fetching every report and every request for the project and
  // filtering in JavaScript, which shipped two full tables' worth of rows —
  // photos, notes, justifications and all — to produce two integers.
  const [latestReport, reportCount, unreviewedReports, pendingRequests, openFindings] = await Promise.all([
    getLatestReportForProject(id),
    countReportsForProject(id),
    countReportsByStatusForProject(id, "SUBMITTED"),
    can(member.role, "viewMaterials")
      ? countRequestsByStatusForProject(id).then((c) => c.SUBMITTED)
      : Promise.resolve(0),
    countOpenFindingsForProject(member.orgId, id),
  ]);

  const now = nowMs();
  const expiringWorkers = project.workers.filter((w) => {
    const d = daysBetween(now, w.cidbExpiry);
    return d !== null && d <= 30 && d >= 0;
  });
  const daysLeftRaw = daysBetween(now, project.endDate);
  const daysLeft = daysLeftRaw !== null ? Math.max(0, daysLeftRaw) : null;
  const allClear = !pendingRequests && !unreviewedReports && !expiringWorkers.length && !openFindings;

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "workers", label: "Workers" },
    { key: "documents", label: "Documents" },
  ];

  return (
    <>
      <Link href="/projects" className="back-link">
        ← All projects
      </Link>
      <div className="topbar" style={{ marginTop: 6 }}>
        <h2>{project.name}</h2>
        <div className="top-actions">
          <span className={`badge ${statusBadgeClass(project.status)}`}>
            <i className="dot" />
            {statusLabel(project.status)}
          </span>
          {can(member.role, "costReports") && <CostReportButton projectId={project.id} />}
          {can(member.role, "manageProjects") && (
            <Link href={`/projects/${project.id}/edit`} className="btn btn-sm">
              Edit
            </Link>
          )}
          {can(member.role, "deleteProjects") && <DeleteProjectButton projectId={project.id} />}
        </div>
        <div className="sub">
          {[project.siteAddress, project.client].filter(Boolean).join(" · ")}
          {(project.startDate || project.endDate) && (
            <> · {formatDate(project.startDate)} → {formatDate(project.endDate)}</>
          )}
        </div>
      </div>

      <div className="tabbar">
        {tabs.map((t) => (
          <Link key={t.key} href={`/projects/${project.id}?tab=${t.key}`} className={tab === t.key ? "on" : ""}>
            {t.label}
          </Link>
        ))}
        <Link href={`/reports?projectId=${project.id}`}>Daily Reports</Link>
        <Link href={`/attendance?projectId=${project.id}`}>Attendance</Link>
        {can(member.role, "viewMaterials") && <Link href={`/materials?projectId=${project.id}`}>Material Requests</Link>}
        {can(member.role, "viewReports") && <Link href={`/safety?projectId=${project.id}`}>Safety</Link>}
      </div>

      {tab === "documents" ? (
        <DocumentsPanel projectId={project.id} canUpload={can(member.role, "uploadDocs") || can(member.role, "manageDocs")} />
      ) : tab === "workers" ? (
        <div className="card">
          <div className="card-h">
            <h3>Worker Roster</h3>
            <div className="right">
              {can(member.role, "manageWorkers") && (
                <Link href={`/projects/${project.id}/workers/new`} className="btn btn-amber btn-sm">
                  + Add worker
                </Link>
              )}
            </div>
          </div>
          {project.workers.length === 0 ? (
            <div className="empty">
              <div className="e-ic">👷</div>
              <div className="e-t">No workers yet</div>
              <p>Add workers to this project&rsquo;s roster to start taking attendance.</p>
            </div>
          ) : (
            <div className="tbl-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Worker</th>
                    <th>Trade</th>
                    <th>Rate/day</th>
                    <th>CIDB Green Card</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {project.workers.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <b>{w.name}</b>
                        {w.icNumber && <div className="small mut">{w.icNumber}</div>}
                      </td>
                      <td>{w.trade || "—"}</td>
                      <td className="num">{w.dailyRate ? formatCurrency(w.dailyRate) : "—"}</td>
                      <td>
                        {w.cidbNumber ? (
                          <>
                            <div className="small mono">{w.cidbNumber}</div>
                            {cidbBadge(w.cidbExpiry)}
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {can(member.role, "manageWorkers") && (
                          <>
                            <Link
                              href={`/projects/${project.id}/workers/${w.id}/edit`}
                              className="btn btn-ghost btn-sm"
                              aria-label={`Edit ${w.name}`}
                            >
                              Edit
                            </Link>{" "}
                            <RemoveWorkerButton workerId={w.id} workerName={w.name} />
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="kpis">
            <div className="kpi">
              <div className="k-lbl">Contract Value</div>
              <div className="k-val">{formatCurrency(project.contractValue)}</div>
              <div className="k-sub">{project.client || "No client set"}</div>
            </div>
            <div className="kpi">
              <div className="k-lbl">Progress</div>
              <div className="k-val">{project.progressPct}%</div>
              <div className="k-sub">plan {project.plannedPct}%</div>
            </div>
            <div className="kpi">
              <div className="k-lbl">Workers</div>
              <div className="k-val">{project.workers.length}</div>
              <div className="k-sub">on roster</div>
            </div>
            <div className="kpi">
              <div className="k-lbl">Daily Reports</div>
              <div className="k-val">{reportCount}</div>
              <div className="k-sub">filed to date</div>
            </div>
          </div>

          <div className="two-col">
            <div className="card">
              <div className="card-h">
                <h3>Latest Daily Report</h3>
                <div className="right">
                  <Link href={`/reports?projectId=${project.id}`} className="small">
                    All reports →
                  </Link>
                </div>
              </div>
              <div className="card-b">
                {latestReport ? (
                  <>
                    <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 8 }}>
                      <b>{formatDate(latestReport.date)}</b>
                      <span className="badge b-mut">{latestReport.weather || "—"}</span>
                      <span className={`badge ${statusBadgeClass(latestReport.status)}`}>
                        <i className="dot" />
                        {statusLabel(latestReport.status)}
                      </span>
                    </div>
                    <p className="mut small">{latestReport.workCompleted || "No details recorded."}</p>
                    <Link href={`/reports/${latestReport.id}`} className="btn btn-sm" style={{ marginTop: 10 }}>
                      Open report
                    </Link>
                  </>
                ) : (
                  <p className="mut small">No daily reports submitted for this project yet.</p>
                )}
              </div>
            </div>

            <div className="card">
              <div className="card-h">
                <h3>Needs attention</h3>
              </div>
              <div className="card-b" style={{ display: "grid", gap: 10 }}>
                {pendingRequests > 0 && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge b-amber">
                      <span className="dot" />
                      {pendingRequests}
                    </span>
                    <span className="small">material request{pendingRequests > 1 ? "s" : ""} awaiting approval</span>
                    <Link href={`/materials?projectId=${project.id}`} className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>
                      View
                    </Link>
                  </div>
                )}
                {openFindings > 0 && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge b-bad">
                      <span className="dot" />
                      {openFindings}
                    </span>
                    <span className="small">
                      safety inspection{openFindings > 1 ? "s" : ""} with findings still open
                    </span>
                    <Link href={`/safety?projectId=${project.id}`} className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>
                      View
                    </Link>
                  </div>
                )}
                {unreviewedReports > 0 && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge b-info">
                      <span className="dot" />
                      {unreviewedReports}
                    </span>
                    <span className="small">report{unreviewedReports > 1 ? "s" : ""} not yet reviewed</span>
                    <Link href={`/reports?projectId=${project.id}`} className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>
                      View
                    </Link>
                  </div>
                )}
                {expiringWorkers.length > 0 && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span className="badge b-bad">
                      <span className="dot" />
                      {expiringWorkers.length}
                    </span>
                    <span className="small">green card{expiringWorkers.length > 1 ? "s" : ""} expiring within 30 days</span>
                    <Link href={`/projects/${project.id}?tab=workers`} className="btn btn-sm btn-ghost" style={{ marginLeft: "auto" }}>
                      View
                    </Link>
                  </div>
                )}
                {allClear && <div className="small mut">All clear — nothing needs your attention on this project.</div>}
                {daysLeft !== null && (
                  <div className="small mut" style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                    <b className="num">{daysLeft}</b> days to contract end · {formatDate(project.endDate)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
