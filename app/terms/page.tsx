import type { Metadata } from "next";
import LegalPage from "@/components/legal/LegalPage";
import { OPERATOR } from "@/lib/legal";
import { PLANS, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/billing/plans";

export const metadata: Metadata = {
  title: "Terms of service · BinaWorks",
  description: "The terms on which BinaWorks is provided: subscriptions, trials, your data, and how either side can end it.",
};

/** Prices are read from the plan table rather than typed here, so the page
 *  cannot quote a figure the billing code no longer charges. */
const plans = Object.values(PLANS);

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      subtitle="The agreement between your company and the operator of this service."
    >
      <section>
        <h3>Who is agreeing</h3>
        <p>
          This agreement is between <b>{OPERATOR.legalName}</b> ({OPERATOR.registrationNumber}) and the
          company whose workspace is created when you sign up. Whoever creates the workspace is confirming
          they may accept these terms on that company&rsquo;s behalf.
        </p>
      </section>

      <section>
        <h3>The service</h3>
        <p>
          BinaWorks is a construction and contractor management application: daily site reports, worker
          attendance and wage calculation, material requests, safety inspections, project documents, a
          calendar and an audit log.
        </p>
        <p>
          It is a record-keeping tool. It does not verify that what is recorded is true, and it is not a
          substitute for the statutory records or safety obligations your business is subject to. Whether a
          record kept here satisfies a particular legal requirement is your responsibility to establish.
        </p>
      </section>

      <section>
        <h3>Trials, plans and payment</h3>
        <p>
          Every new workspace begins with a <b>{TRIAL_DAYS}-day free trial</b> on the {PLANS[TRIAL_PLAN].name}{" "}
          plan. No card is required to start one.
        </p>
        <p>Plans, monthly, in Malaysian Ringgit:</p>
        <ul>
          {plans.map((p) => (
            <li key={p.id}>
              <b>
                {p.name} — RM{p.priceMyr.toLocaleString("en-MY")}
              </b>{" "}
              — {p.maxActiveProjects ?? "unlimited"} active projects, {p.maxWorkers ?? "unlimited"} workers,{" "}
              {p.maxTeamAccounts ?? "unlimited"} team accounts,{" "}
              {p.maxStorageBytes ? `${Math.round(p.maxStorageBytes / 1024 ** 3)} GB` : "unlimited"} file
              storage.
            </li>
          ))}
        </ul>
        <p>
          Payments are handled by Stripe. Subscriptions renew monthly until cancelled, and cancelling stops
          the next renewal rather than refunding the current period. Prices may change with notice; a change
          takes effect at your next renewal, never mid-period.
        </p>
      </section>

      <section>
        <h3>What happens when a trial or subscription ends</h3>
        <p>
          Your workspace becomes <b>read-only</b>. It is not deleted and nothing is thrown away: you can still
          sign in, read every record, and export the entire workspace from <b>Settings → Export</b>. What you
          cannot do is add to it or change it until a plan is active again.
        </p>
        <p>
          This is deliberate. A contractor locked out of last month&rsquo;s site reports because a card
          expired is a worse outcome than an unpaid invoice.
        </p>
      </section>

      <section>
        <h3>Your data stays yours</h3>
        <ul>
          <li>
            You own what you put in. We claim no rights over your projects, reports, photos or documents.
          </li>
          <li>
            We access workspace contents only where needed to run or support the service — for example
            investigating a fault you have reported.
          </li>
          <li>
            An Owner can export everything at any time, in a machine-readable form, including while read-only.
          </li>
          <li>
            An Owner can delete the workspace, which removes its records and its uploaded files. This cannot
            be undone. Sign-in accounts are left intact so that someone who belongs to more than one company
            does not lose the others.
          </li>
        </ul>
        <p>
          What personal data is held and on what basis is set out in the <a href="/privacy">privacy notice</a>,
          which forms part of these terms.
        </p>
      </section>

      <section>
        <h3>Your responsibilities</h3>
        <ul>
          <li>Keep sign-in credentials to yourself; anything done with your account is treated as done by you.</li>
          <li>
            Only enter personal data about workers and third parties where you are entitled to, and tell those
            people what you are recording and why. You decide what goes into your workspace, so this is your
            obligation, not ours.
          </li>
          <li>
            Do not use the service to break the law, to store material you have no right to store, or to
            attack the service or other customers.
          </li>
          <li>
            Do not attempt to reach another company&rsquo;s data. Tenant separation is enforced in the
            database, and attempts are logged.
          </li>
        </ul>
      </section>

      <section>
        <h3>Availability</h3>
        <p>
          The service is provided as it is, without a guaranteed uptime level. Maintenance, faults and
          dependency outages happen. If you need a contractual availability commitment, ask before you rely on
          one — none is implied here.
        </p>
      </section>

      <section>
        <h3>Liability</h3>
        <p>
          Nothing in these terms excludes liability that cannot lawfully be excluded. Subject to that, our
          total liability arising out of the service is limited to the fees you paid in the twelve months
          before the claim, and we are not liable for indirect or consequential loss, lost profit, or loss of
          data where you had the ability to export it.
        </p>
      </section>

      <section>
        <h3>Ending the agreement</h3>
        <ul>
          <li>You may cancel at any time from the Billing page.</li>
          <li>
            We may suspend or end an account that breaches these terms, or that is being used to harm the
            service or other customers. Except where the breach is serious, we will say what is wrong and give
            you a reasonable chance to fix it.
          </li>
          <li>Export your data before you delete a workspace. After deletion it is gone.</li>
        </ul>
      </section>

      <section>
        <h3>Governing law</h3>
        <p>
          These terms are governed by the laws of Malaysia, and the courts of Malaysia have jurisdiction.
        </p>
      </section>

      <section>
        <h3>Contact</h3>
        <p>
          {OPERATOR.legalName}, {OPERATOR.address}. Support: <b>{OPERATOR.supportEmail}</b>. Privacy requests:{" "}
          <b>{OPERATOR.privacyEmail}</b>.
        </p>
      </section>
    </LegalPage>
  );
}
