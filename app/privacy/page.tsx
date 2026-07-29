import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { OPERATOR } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy notice · BinaWorks",
  description: "What personal data BinaWorks holds, why, where it is stored, and how to have it corrected or removed.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy notice"
      subtitle="What personal data this service holds, why it holds it, and what you can do about it."
    >
      <section>
        <h3>Who this is about</h3>
        <p>
          BinaWorks is operated by <b>{OPERATOR.legalName}</b> ({OPERATOR.registrationNumber}), of{" "}
          {OPERATOR.address}. This notice covers Malaysia&rsquo;s Personal Data Protection Act 2010 (PDPA).
        </p>
        <p>
          There are two different relationships here, and they matter, because they decide who you should
          contact:
        </p>
        <ul>
          <li>
            <b>For your account,</b> we are the data user. Your name, email, phone number and role are held
            because you asked us for an account.
          </li>
          <li>
            <b>For everything inside a workspace</b> — workers, attendance, reports, photos, documents — the
            company that owns the workspace decides what goes in and how long it stays. We process it on their
            instructions. If you are a worker whose details are in someone&rsquo;s workspace, that company is
            the first place to ask; we will help you reach them, and we will act if they do not.
          </li>
        </ul>
      </section>

      <section>
        <h3>What is actually stored</h3>
        <p>
          This list is taken from the database schema rather than written in general terms, so it is worth
          reading literally.
        </p>

        <h4>People with accounts</h4>
        <ul>
          <li>Name, email address, phone number, and role within a workspace.</li>
          <li>
            Your password is never stored by this application. Authentication is handled by Supabase Auth,
            which stores a hash, not the password.
          </li>
          <li>
            An audit log of significant actions — who created, approved, changed or deleted what, and when.
            This exists so a company can answer questions about its own records; it is not used for anything
            else.
          </li>
        </ul>

        <h4>Workers recorded in a workspace</h4>
        <p>
          These people are usually <i>not</i> users of the service and have not signed up for anything, which
          is why this section is set out in full:
        </p>
        <ul>
          <li>Name and trade.</li>
          <li>
            <b>Identity card (IC) number</b>, where the company enters one.
          </li>
          <li>CIDB registration number and its expiry date.</li>
          <li>Daily rate, and the wages calculated from it.</li>
          <li>Attendance: date, present / half day / absent, and time in and out.</li>
        </ul>
        <p>
          IC numbers and wages are sensitive. A company using BinaWorks should enter them only where it needs
          to, and should say why to the workers concerned.
        </p>

        <h4>Content uploaded to a workspace</h4>
        <ul>
          <li>
            Daily report photos and project documents. Site photographs frequently show identifiable people,
            which makes them personal data even though nobody typed a name.
          </li>
          <li>Safety inspection records, including findings and any evidence attached to them.</li>
          <li>Material requests, calendar events, notifications and bug reports.</li>
        </ul>

        <h4>Payment</h4>
        <p>
          Card details are never seen by this service. Subscriptions run through Stripe; we store the Stripe
          customer and subscription identifiers and the resulting status, and nothing else.
        </p>
      </section>

      <section>
        <h3>Where it is kept</h3>
        <p>
          Records are stored in a Supabase-managed PostgreSQL database and uploaded files in a private
          Supabase Storage bucket, both hosted in <b>{OPERATOR.hostingRegion}</b>.
        </p>
        <p>
          PDPA restricts transferring personal data outside Malaysia. If the region above is not in Malaysia,
          that transfer is a decision the workspace owner is making by using this service, and it is stated
          here plainly rather than buried.
        </p>
        <p>Access controls, described here because they are the substance of the promise:</p>
        <ul>
          <li>
            Every table carrying business data is row-level-secured and scoped to one organisation. A query
            from one company cannot return another company&rsquo;s rows even if the application asks it to.
          </li>
          <li>
            The file bucket is private and has no public read path. Files are served only through an endpoint
            that checks the requester belongs to the owning organisation first.
          </li>
          <li>Traffic is encrypted in transit, and the application is served over HTTPS only.</li>
        </ul>
      </section>

      <section>
        <h3>How long it is kept</h3>
        <ul>
          <li>
            While a workspace exists, its data stays. Construction records are commonly needed years later, so
            nothing is deleted on a schedule.
          </li>
          <li>
            When an Owner deletes a workspace, its records and its uploaded files are removed. Sign-in
            accounts survive, so that a person who belongs to more than one company does not lose access to
            the others.
          </li>
          <li>
            Backups are retained by Supabase on the plan in force, and a deleted record can persist in a
            backup until that backup expires.
          </li>
        </ul>

        <h4>Two things are kept after deletion</h4>
        <p>
          Set out here rather than left to be discovered, because retaining anything after a deletion request
          without saying so is the thing this notice exists to prevent. Neither holds any workspace content —
          no worker records, no reports, no photos.
        </p>
        <ul>
          <li>
            <b>A record of acceptance:</b> that a named person accepted these documents, at which version and
            on what date. It is the evidence that an agreement existed, so removing it with the workspace
            would destroy the only proof either side has. It holds an email address, a user and organisation
            identifier, the document version and a timestamp.
          </li>
          <li>
            <b>A record of the deletion itself:</b> the workspace name, who deleted it, when, the plan it was
            on, and how many members, projects, workers, reports and files it contained at the time. Counts
            only — no names and no content. Without it, the deletion is the one event nobody can account for
            afterwards, because the log that would have recorded it is deleted along with everything else.
          </li>
        </ul>
      </section>

      <section>
        <h3>Your rights</h3>
        <p>Under the PDPA you may:</p>
        <ul>
          <li>Ask what personal data is held about you, and get a copy.</li>
          <li>Have inaccurate data corrected.</li>
          <li>Withdraw consent, or limit how the data is processed.</li>
        </ul>
        <p>
          Workspace Owners can export everything in their workspace at any time from{" "}
          <b>Settings → Export</b>, which is the fastest route to a copy.
        </p>
        <p>
          Otherwise, write to <b>{OPERATOR.privacyEmail}</b>. If your details are inside a company&rsquo;s
          workspace, tell us which company and we will pass the request on and follow it up. You may also
          complain to the Personal Data Protection Commissioner.
        </p>
      </section>

      <section>
        <h3>Changes</h3>
        <p>
          The version at the top of this page changes when the substance does. Acceptances are recorded
          against the version in force at the time, so it is always possible to establish what was agreed and
          when.
        </p>
      </section>
    </LegalPage>
  );
}
