import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAuditLogForOrgViaSession } from "@/lib/db/auditLog";
import { formatDateTime } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  project: "Project",
  worker: "Worker",
  material_request: "Material Request",
  daily_report: "Daily Report",
  document: "Document",
  calendar_event: "Calendar",
  attendance: "Attendance",
  safety_inspection: "Safety",
  organization: "Company",
  subscription: "Billing",
  org_member: "Team",
  org_invite: "Invitation",
};

export default async function AuditLogPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "viewAuditLog")) redirect("/dashboard");

  const entries = await listAuditLogForOrgViaSession(member.orgId);

  return (
    <>
      <div className="topbar">
        <h2>Audit Log</h2>
        <div className="sub">
          Compliance trail of every change to the company record — projects, workers, requests, reports, documents,
          attendance, membership and billing.
        </div>
      </div>

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🗒️</div>
            <div className="e-t">No activity recorded yet</div>
            <p>Changes to projects, workers, requests, reports, documents and team members appear here as they happen.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            {/* `cards` — below 700px the event, which is the whole point of
                the row, was squeezed into a third of the width and wrapped
                to six lines beside a date that needed one. See globals.css. */}
            <table className="cards">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Category</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="small mut" data-label="When" style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td data-label="Category">
                      <span className="badge b-mut">{CATEGORY_LABELS[entry.entityType] ?? entry.entityType}</span>
                    </td>
                    <td className="card-t">{entry.summary}</td>
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
