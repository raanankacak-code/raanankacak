import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { listProjectsForClientViaSession } from "@/lib/db/projects";
import { listApprovalsViaSession } from "@/lib/db/approvals";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";

export const metadata = { title: "Your projects" };

export default async function PortalHomePage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const projects = await listProjectsForClientViaSession(member.orgId);
  // One query for the workspace rather than one per project: row-level
  // security has already narrowed it to this client's projects.
  const waiting = await listApprovalsViaSession(member.orgId, { status: "PENDING" });
  const waitingByProject = waiting.reduce<Record<string, number>>((acc, a) => {
    acc[a.projectId] = (acc[a.projectId] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <div className="topbar">
        <h2>Your projects</h2>
        <div className="sub">Progress, the site diary, the safety record and the snag list — kept up to date by the site team.</div>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="e-ic">🏗️</div>
            <div className="e-t">Nothing shared with you yet</div>
            <p>
              When your contractor gives you access to a project it will appear here. If you were expecting to see one,
              ask them to check your access.
            </p>
          </div>
        </div>
      ) : (
        <div className="portal-projects">
          {projects.map((p) => (
            <Link key={p.id} href={`/portal/${p.id}`} className="card portal-proj">
              <div className="card-b">
                <div className="portal-proj-h">
                  <b>{p.name}</b>
                  <span className={`badge ${statusBadgeClass(p.status)}`}>
                    <i className="dot" />
                    {statusLabel(p.status)}
                  </span>
                </div>
                {waitingByProject[p.id] > 0 && (
                  <div className="badge b-amber" style={{ marginTop: 8 }}>
                    {waitingByProject[p.id]} waiting for you
                  </div>
                )}
                {p.siteAddress && <div className="small mut">{p.siteAddress}</div>}
                <div className="portal-bar" aria-hidden>
                  <div style={{ width: `${p.progressPct}%` }} />
                </div>
                <div className="portal-proj-f small">
                  <span className="num">
                    <b>{p.progressPct}%</b> complete
                  </span>
                  <span className="mut">
                    {formatDate(p.startDate)} → {formatDate(p.endDate)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
