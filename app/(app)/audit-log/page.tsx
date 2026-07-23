import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { listAuditLogForOrg } from "@/lib/db/auditLog";
import { formatDateTime } from "@/lib/format";

const CATEGORY_LABELS: Record<string, string> = {
  project: "Project",
  worker: "Worker",
  material_request: "Material Request",
  daily_report: "Daily Report",
  org_member: "Team",
  org_invite: "Invitation",
};

export default async function AuditLogPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "viewAuditLog")) redirect("/dashboard");

  const entries = await listAuditLogForOrg(member.orgId);

  return (
    <>
      <div className="topbar">
        <h2>Audit Log</h2>
        <div className="sub">Compliance trail of financial edits, approvals and membership changes.</div>
      </div>

      <div className="card">
        {entries.length === 0 ? (
          <div className="empty">
            <div className="e-ic">🗒️</div>
            <div className="e-t">No activity recorded yet</div>
            <p>Financial edits, approvals and membership changes will appear here as they happen.</p>
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
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
                    <td className="small mut" style={{ whiteSpace: "nowrap" }}>
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td>
                      <span className="badge b-mut">{CATEGORY_LABELS[entry.entityType] ?? entry.entityType}</span>
                    </td>
                    <td>{entry.summary}</td>
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
