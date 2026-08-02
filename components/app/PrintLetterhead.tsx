import type { Organization } from "@/lib/db/types";

/**
 * The company's own heading on a printed document.
 *
 * This is the difference between a record that looks like it came from the
 * contractor and one that looks like it came from an app. An officer being
 * handed a safety inspection wants to see who the company is, and their SSM
 * and CIDB numbers, without having to ask — those two numbers are how a
 * Malaysian contractor is identified on paper.
 *
 * Everything is optional: a workspace that has filled in nothing still gets a
 * clean heading with its name, rather than a row of empty labels.
 */
export default function PrintLetterhead({
  org,
  documentTitle,
  reference,
  date,
}: {
  org: Organization | null;
  documentTitle: string;
  reference?: string;
  date?: string;
}) {
  const address = [org?.addressLine1, org?.addressLine2, [org?.postcode, org?.city].filter(Boolean).join(" "), org?.state]
    .filter((part) => part && String(part).trim().length > 0)
    .join(", ");
  const registrations = [
    org?.ssmNumber ? `SSM ${org.ssmNumber}` : null,
    org?.cidbNumber ? `CIDB ${org.cidbNumber}` : null,
  ].filter(Boolean);
  const contact = [org?.phone, org?.email, org?.website].filter(Boolean);

  return (
    <div className="print-head">
      <div className="letterhead">
        {org?.logoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={org.logoUrl} alt="" className="letterhead-logo" />
        )}
        <div>
          <div className="letterhead-name">{org?.name ?? "—"}</div>
          {registrations.length > 0 && <div className="letterhead-line num">{registrations.join(" · ")}</div>}
          {address && <div className="letterhead-line">{address}</div>}
          {contact.length > 0 && <div className="letterhead-line">{contact.join(" · ")}</div>}
        </div>
      </div>
      <div className="letterhead-doc">
        {/* Still a heading: it is the document's title, and the page has to
            remain navigable by anyone using a screen reader. */}
        <h2 className="letterhead-title">{documentTitle}</h2>
        {reference && <div className="num letterhead-ref">{reference}</div>}
        {date && <div className="small mut num">{date}</div>}
      </div>
    </div>
  );
}
