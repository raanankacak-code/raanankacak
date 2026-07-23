import { redirect } from "next/navigation";
import { getCurrentMember } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { getSubscriptionForOrg, isSubscriptionWritable, planFor, trialDaysLeft } from "@/lib/db/subscriptions";
import { PLANS, type Plan } from "@/lib/billing/plans";
import { countActiveProjectsForOrg } from "@/lib/db/projects";
import { countActiveWorkersForOrg } from "@/lib/db/workers";
import { countActiveMembersForOrg, countPendingInvitesForOrg } from "@/lib/db/team";
import { formatCurrency, formatDate } from "@/lib/format";

function limitLabel(limit: number | null): string {
  return limit === null ? "Unlimited" : String(limit);
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = limit === null ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const nearLimit = limit !== null && used >= limit * 0.8;
  return (
    <div style={{ display: "grid", gap: 6 }}>
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span className="small">{label}</span>
        <span className="num small" style={{ color: nearLimit ? "var(--amber-text)" : "inherit" }}>
          {used} / {limitLabel(limit)}
        </span>
      </div>
      {limit !== null && (
        <div style={{ height: 7, borderRadius: 99, background: "var(--panel2)", border: "1px solid var(--line2)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,var(--amber-deep),var(--amber))" }} />
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, current }: { plan: Plan; current: boolean }) {
  return (
    <div className="card" style={current ? { borderColor: "var(--amber)" } : undefined}>
      <div className="card-h">
        <h3>{plan.name}</h3>
        {current && (
          <div className="right">
            <span className="badge b-amber">
              <i className="dot" />
              Current plan
            </span>
          </div>
        )}
      </div>
      <div className="card-b" style={{ display: "grid", gap: 10 }}>
        <div>
          <b className="num" style={{ fontSize: 22 }}>{formatCurrency(plan.priceMyr)}</b>
          <span className="small mut"> /month</span>
        </div>
        <ul className="small" style={{ margin: 0, paddingLeft: 18, display: "grid", gap: 4 }}>
          <li>{limitLabel(plan.maxActiveProjects)} active projects</li>
          <li>{limitLabel(plan.maxWorkers)} workers on the roster</li>
          <li>{limitLabel(plan.maxTeamAccounts)} team accounts</li>
          <li>{plan.costReports ? "Cost reports included" : "No cost reports"}</li>
          <li>{plan.customBranding ? "Custom branding" : "Standard branding"}</li>
        </ul>
      </div>
    </div>
  );
}

export default async function BillingPage() {
  const member = await getCurrentMember();
  if (!member || !can(member.role, "manageOrg")) redirect("/dashboard");

  const sub = await getSubscriptionForOrg(member.orgId);
  const plan = planFor(sub);
  const writable = isSubscriptionWritable(sub);
  const daysLeft = trialDaysLeft(sub);

  const [projects, workers, members, pendingInvites] = await Promise.all([
    countActiveProjectsForOrg(member.orgId),
    countActiveWorkersForOrg(member.orgId),
    countActiveMembersForOrg(member.orgId),
    countPendingInvitesForOrg(member.orgId),
  ]);

  return (
    <>
      <div className="topbar">
        <h2>Billing</h2>
        <div className="sub">Your plan, trial status and usage.</div>
      </div>

      {!writable && (
        <div className="card" style={{ borderColor: "var(--bad)", marginBottom: 14 }}>
          <div className="card-b">
            <b style={{ color: "var(--bad-text)" }}>Your workspace is read-only.</b>{" "}
            <span className="small mut">
              {sub.status === "TRIALING"
                ? "Your free trial has ended. All data is safe and can still be viewed and exported."
                : "Your subscription is inactive. All data is safe and can still be viewed and exported."}{" "}
              Choose a plan below to continue working.
            </span>
          </div>
        </div>
      )}

      <div className="two-col">
        <div className="card">
          <div className="card-h">
            <h3>Current Plan</h3>
          </div>
          <div className="card-b" style={{ display: "grid", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <b style={{ fontSize: 18 }}>{plan.name}</b>
              <span className={`badge ${writable ? "b-ok" : "b-bad"}`}>
                <i className="dot" />
                {sub.status === "TRIALING" ? (writable ? "TRIAL" : "TRIAL ENDED") : sub.status.replaceAll("_", " ")}
              </span>
            </div>
            {sub.status === "TRIALING" && writable && (
              <p className="small mut" style={{ margin: 0 }}>
                <b className="num">{daysLeft}</b> day{daysLeft === 1 ? "" : "s"} left in your free trial · ends{" "}
                {formatDate(sub.trialEndsAt)}
              </p>
            )}
            <p className="small mut" style={{ margin: 0 }}>
              Online payment is coming soon. To activate or change a plan today, contact BinaWorks support — your
              account manager will set it up for you.
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-h">
            <h3>Usage</h3>
          </div>
          <div className="card-b" style={{ display: "grid", gap: 14 }}>
            <UsageRow label="Active projects" used={projects} limit={plan.maxActiveProjects} />
            <UsageRow label="Workers on roster" used={workers} limit={plan.maxWorkers} />
            <UsageRow label="Team accounts (incl. pending invites)" used={members + pendingInvites} limit={plan.maxTeamAccounts} />
          </div>
        </div>
      </div>

      <div className="topbar" style={{ marginTop: 18 }}>
        <h2 style={{ fontSize: 18 }}>Plans</h2>
        <div className="sub">Prices in Malaysian Ringgit (MYR) · cancel anytime.</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        {Object.values(PLANS).map((p) => (
          <PlanCard key={p.id} plan={p} current={p.id === sub.plan} />
        ))}
      </div>
    </>
  );
}
