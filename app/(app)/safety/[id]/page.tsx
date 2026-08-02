import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getInspectionById } from "@/lib/db/safety";
import { getProjectById } from "@/lib/db/projects";
import { getOrganizationById } from "@/lib/db/organizations";
import { formatDate, formatDateTime } from "@/lib/format";
import type { SafetyInspectionItem } from "@/lib/db/types";
import PrintButton from "@/components/app/PrintButton";
import PrintLetterhead from "@/components/app/PrintLetterhead";
import InspectionPhotos from "@/components/app/safety/InspectionPhotos";

const OUTCOME_LABEL: Record<string, string> = {
  PASS: "Pass",
  ACTIONS_REQUIRED: "Actions required",
  FAIL: "Fail",
};

const RESULT_LABEL: Record<string, string> = { PASS: "Pass", FAIL: "Fail", NA: "N/A" };

/**
 * The whole record on one page, laid out to be printed.
 *
 * This is the artefact a DOSH or CIDB officer is actually handed. That is why
 * it is a page with a URL rather than the modal on the list: it can be linked
 * to, and it can be printed to PDF without a browser extension. Everything
 * checked is shown, not only what failed — "we looked at all of this" is half
 * of what an inspection record is for.
 */
export default async function InspectionPage({ params }: { params: Promise<{ id: string }> }) {
  const member = await getCurrentMember();
  if (!member) return null;
  if (!can(member.role, "viewReports")) redirect("/dashboard");

  const { id } = await params;
  const inspection = await getInspectionById(member.orgId, id);
  if (!inspection) notFound();

  const [project, org] = await Promise.all([
    getProjectById(member.orgId, inspection.projectId),
    getOrganizationById(member.orgId),
  ]);

  // Grouped in the order the categories first appear, which is the order the
  // site was walked.
  const grouped = inspection.items.reduce<Record<string, SafetyInspectionItem[]>>((acc, item) => {
    (acc[item.category] ??= []).push(item);
    return acc;
  }, {});

  return (
    <div className="print-doc">
      <div className="topbar no-print">
        <Link href="/safety" className="back-link">
          ← All inspections
        </Link>
        <div className="top-actions">
          <PrintButton />
        </div>
      </div>

      <div className="card print-card">
        {/* The company's own heading: an officer handed this should not have
            to ask who the contractor is, or for their SSM and CIDB numbers. */}
        <PrintLetterhead
          org={org}
          documentTitle="Safety Inspection Record"
          reference={inspection.code}
          date={formatDate(inspection.date)}
        />

        <div className="print-meta">
          <div>
            <div className="field-label">Project</div>
            <div>{project?.name ?? "—"}</div>
          </div>
          <div>
            <div className="field-label">Site address</div>
            <div>{project?.siteAddress || "—"}</div>
          </div>
          <div>
            <div className="field-label">Inspector</div>
            <div>{inspection.inspectorName}</div>
          </div>
          <div>
            <div className="field-label">Outcome</div>
            <div>
              <b>{OUTCOME_LABEL[inspection.outcome]}</b>
              {inspection.failedCount > 0
                ? ` — ${inspection.failedCount} finding${inspection.failedCount === 1 ? "" : "s"}`
                : ""}
            </div>
          </div>
          <div>
            <div className="field-label">Status</div>
            <div>
              {inspection.status === "CLOSED"
                ? `Closed${inspection.closedByName ? ` by ${inspection.closedByName}` : ""}${
                    inspection.closedAt ? ` on ${formatDate(inspection.closedAt)}` : ""
                  }`
                : "Open — findings outstanding"}
            </div>
          </div>
          <div>
            <div className="field-label">Filed</div>
            <div className="num">{formatDateTime(inspection.createdAt)}</div>
          </div>
        </div>

        {Object.entries(grouped).map(([category, items]) => (
          <div key={category} className="print-group">
            <div className="field-label">{category}</div>
            <table className="print-table">
              <tbody>
                {items.map((item, i) => (
                  <tr key={i} className={item.result === "FAIL" ? "row-fail" : undefined}>
                    <td>{item.item}</td>
                    <td style={{ width: 70, textAlign: "right", whiteSpace: "nowrap" }}>
                      <b>{RESULT_LABEL[item.result]}</b>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {items
              .filter((i) => i.result === "FAIL")
              .map((item, i) => (
                <div key={i} className="print-finding">
                  <div className="small">
                    <b>{item.item}</b>
                    {item.note ? ` — ${item.note}` : ""}
                  </div>
                  {item.photos && item.photos.length > 0 && (
                    <div className="photo-strip" style={{ marginTop: 6 }}>
                      {item.photos.map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={url} src={url} alt={`Evidence: ${item.item}`} className="thumb" />
                      ))}
                    </div>
                  )}
                </div>
              ))}
          </div>
        ))}

        {inspection.notes && (
          <div className="print-group">
            <div className="field-label">Notes</div>
            <p style={{ fontSize: 13.5, margin: 0 }}>{inspection.notes}</p>
          </div>
        )}

        <InspectionPhotos
          inspectionId={inspection.id}
          photos={inspection.photos}
          canAdd={can(member.role, "submitInspections")}
          canRemove={can(member.role, "closeInspections")}
        />

        <div className="print-sign">
          <div>
            <div className="sign-line" />
            <div className="small mut">Inspector — {inspection.inspectorName}</div>
          </div>
          <div>
            <div className="sign-line" />
            <div className="small mut">Site manager</div>
          </div>
        </div>
      </div>
    </div>
  );
}
