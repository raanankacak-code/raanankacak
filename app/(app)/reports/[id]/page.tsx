import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { getReportById } from "@/lib/db/reports";
import { can } from "@/lib/permissions";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import ReportActions from "@/components/app/ReportActions";

export default async function ReportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return null;

  const { id } = await params;
  const report = await getReportById(member.orgId, id);
  if (!report) notFound();

  const manpower = (report.manpower as Record<string, number> | null) ?? {};
  const photos = (report.photos as string[] | null) ?? [];
  const totalManpower = Object.values(manpower).reduce((s, n) => s + n, 0);

  return (
    <>
      <Link href={`/reports?projectId=${report.project.id}`} className="back-link">
        ← Daily reports
      </Link>
      <div className="topbar" style={{ marginTop: 6 }}>
        <h2>{report.project.name}</h2>
        <div className="top-actions">
          <span className={`badge ${statusBadgeClass(report.status)}`}>
            <i className="dot" />
            {statusLabel(report.status)}
          </span>
          <ReportActions reportId={report.id} status={report.status} canReview={can(member.role, "reviewReports")} />
        </div>
        <div className="sub">
          {formatDate(report.date)} · {report.weather || "—"} · filed by {report.submittedByName}
        </div>
      </div>

      <div className="two-col">
        <div className="card">
          <div className="card-h">
            <h3>Site Diary</h3>
          </div>
          <div className="card-b" style={{ display: "grid", gap: 16 }}>
            <div>
              <label>Work completed</label>
              <p>{report.workCompleted || "—"}</p>
            </div>
            <div>
              <label>Delays / issues</label>
              <p>{report.delays || "—"}</p>
            </div>
            <div>
              <label>Notes</label>
              <p>{report.notes || "—"}</p>
            </div>
            {photos.length > 0 && (
              <div>
                <label>Site photos</label>
                <div className="photo-strip">
                  {photos.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={url} src={url} alt="Site photo" className="thumb" style={{ width: 120, height: 120 }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Manpower</h3>
          </div>
          <div className="card-b">
            {Object.keys(manpower).length === 0 ? (
              <p className="mut small">No manpower recorded.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Trade</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(manpower).map(([trade, count]) => (
                    <tr key={trade}>
                      <td>{trade}</td>
                      <td className="num">{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <div className="small mut" style={{ marginTop: 10 }}>
              Total: {totalManpower}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
