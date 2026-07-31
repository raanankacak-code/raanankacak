import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { listProjectsForClientViaSession } from "@/lib/db/projects";
import { listDiaryForClientViaSession } from "@/lib/db/reports";
import { listDefectsForOrgViaSession } from "@/lib/db/defects";
import { listInspectionsForOrgViaSession } from "@/lib/db/safety";
import { listApprovalsViaSession } from "@/lib/db/approvals";
import { isOutstanding } from "@/lib/defects";
import { formatDate, statusBadgeClass, statusLabel } from "@/lib/format";
import PortalApprovals from "@/components/portal/PortalApprovals";

const SEVERITY_LABELS: Record<string, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

const SEVERITY_BADGE: Record<string, string> = {
  LOW: "b-mut",
  MEDIUM: "b-info",
  HIGH: "b-amber",
  CRITICAL: "b-bad",
};

const OUTCOME_LABEL: Record<string, string> = {
  PASS: "Pass",
  ACTIONS_REQUIRED: "Actions required",
};

export default async function PortalProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return null;
  const { id } = await params;

  // Chosen from what the policy already lets this account read rather than
  // fetched by id and then checked: a project they have no access to is
  // simply not in this list, so there is no second rule to keep in step.
  const project = (await listProjectsForClientViaSession(member.orgId)).find((p) => p.id === id);
  if (!project) notFound();

  const [diary, defects, inspections, approvals] = await Promise.all([
    listDiaryForClientViaSession(member.orgId, project.id),
    listDefectsForOrgViaSession(member.orgId, { projectId: project.id, limit: 50 }),
    listInspectionsForOrgViaSession(member.orgId, { projectId: project.id, limit: 20 }),
    listApprovalsViaSession(member.orgId, { projectId: project.id }),
  ]);

  const outstanding = defects.filter((d) => isOutstanding(d.status));

  return (
    <>
      <div className="topbar">
        <h2>{project.name}</h2>
        <div className="sub">
          <Link href="/portal">← All your projects</Link>
        </div>
      </div>

      <div className="card">
        <div className="card-b">
          <div className="portal-proj-h">
            <span className={`badge ${statusBadgeClass(project.status)}`}>
              <i className="dot" />
              {statusLabel(project.status)}
            </span>
            <span className="small mut">
              {formatDate(project.startDate)} → {formatDate(project.endDate)}
            </span>
          </div>
          {project.siteAddress && <div className="small mut" style={{ marginTop: 6 }}>{project.siteAddress}</div>}
          <div className="portal-bar" aria-hidden>
            <div style={{ width: `${project.progressPct}%` }} />
          </div>
          <div className="small num">
            <b>{project.progressPct}%</b> complete
            {project.plannedPct > 0 && <span className="mut"> · {project.plannedPct}% planned by now</span>}
          </div>
        </div>
      </div>

      {/* Above the diary on purpose: the thing waiting on them is the reason
          they opened the page. */}
      <PortalApprovals
        approvals={approvals.map((a) => ({
          id: a.id,
          code: a.code,
          title: a.title,
          description: a.description,
          photos: a.photos,
          status: a.status,
          requestedByName: a.requestedByName,
          requestedAt: a.requestedAt.toISOString(),
          decidedByName: a.decidedByName,
          decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
          decisionComment: a.decisionComment,
        }))}
      />

      <div className="card">
        <div className="card-h">
          <h3>Site diary</h3>
          <span className="right small faint">{diary.length ? `${diary.length} most recent` : ""}</span>
        </div>
        {diary.length === 0 ? (
          <div className="card-b">
            <p className="mut small">No site reports have been filed yet.</p>
          </div>
        ) : (
          <div className="card-b portal-diary">
            {diary.map((entry) => (
              <article key={entry.id} className="portal-entry">
                <div className="portal-entry-h">
                  <b className="num">{formatDate(entry.date)}</b>
                  {entry.weather && <span className="badge b-mut">{entry.weather}</span>}
                </div>
                {entry.workCompleted && <p>{entry.workCompleted}</p>}
                {entry.delays && (
                  <p className="small" style={{ color: "var(--bad-text)" }}>
                    Delays: {entry.delays}
                  </p>
                )}
                {entry.photos.length > 0 && (
                  <div className="photo-strip">
                    {entry.photos.map((url) => (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={url} src={url} className="thumb" alt="" />
                    ))}
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Snag list</h3>
          <span className="right small faint">{outstanding.length} outstanding</span>
        </div>
        {defects.length === 0 ? (
          <div className="card-b">
            <p className="mut small">Nothing has been raised on this project.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            {/* `cards` — one card per snag below 700px. See globals.css. */}
            <table className="cards">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Defect</th>
                  <th>Severity</th>
                  <th>Due</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {defects.map((d) => (
                  <tr key={d.id}>
                    <td className="num" data-label="Ref">{d.code}</td>
                    <td className="card-t">
                      <div style={{ fontWeight: 600 }}>{d.title}</div>
                      {d.location && <div className="small mut">{d.location}</div>}
                    </td>
                    <td data-label="Severity">
                      <span className={`badge ${SEVERITY_BADGE[d.severity]}`}>{SEVERITY_LABELS[d.severity]}</span>
                    </td>
                    <td className="num" data-label="Due">
                      {d.dueDate ? formatDate(d.dueDate) : <span className="faint">—</span>}
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${statusBadgeClass(d.status)}`}>
                        <i className="dot" />
                        {statusLabel(d.status)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-h">
          <h3>Safety record</h3>
        </div>
        {inspections.length === 0 ? (
          <div className="card-b">
            <p className="mut small">No inspections have been filed yet.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            {/* `cards` — see globals.css. */}
            <table className="cards">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Date</th>
                  <th>Inspector</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((i) => (
                  <tr key={i.id}>
                    <td className="num" data-label="Ref">{i.code}</td>
                    <td className="card-t num">{formatDate(i.date)}</td>
                    <td data-label="Inspector">{i.inspectorName}</td>
                    <td data-label="Outcome">
                      <span className={`badge ${i.outcome === "PASS" ? "b-ok" : "b-amber"}`}>
                        {OUTCOME_LABEL[i.outcome] ?? i.outcome}
                        {i.failedCount > 0 ? ` · ${i.failedCount}` : ""}
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
