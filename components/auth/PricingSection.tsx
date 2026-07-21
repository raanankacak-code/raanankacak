import Link from "next/link";

const PLANS = [
  {
    name: "Starter",
    price: "RM999",
    forWho: "For small contractors running their first sites on BinaWorks.",
    features: [
      "Up to 3 active projects",
      "25 workers on the roster",
      "Daily reports, attendance & wages",
      "Material requests with approvals",
      "5 team member accounts",
      "Email support",
    ],
    cta: "Start with Starter",
    popular: false,
  },
  {
    name: "Professional",
    price: "RM1,799",
    forWho: "For established firms juggling multiple sites and a bigger crew.",
    features: [
      "Unlimited projects",
      "100 workers on the roster",
      "Cost reports & budget tracking",
      "Calendar, deadlines & inspections",
      "Custom branding & letterheads",
      "20 team member accounts",
      "Priority support",
    ],
    cta: "Start with Professional",
    popular: true,
  },
  {
    name: "Enterprise",
    price: "RM1,999",
    forWho: "For groups that need every seat, every site, and someone on the phone.",
    features: [
      "Everything in Professional",
      "Unlimited workers & team accounts",
      "Dedicated onboarding for your crew",
      "Phone & WhatsApp support",
      "Priority feature requests",
    ],
    cta: "Talk to us",
    popular: false,
  },
];

export default function PricingSection() {
  return (
    <section className="lg-pricing" aria-label="Pricing plans">
      <h2>Simple pricing for growing contractors</h2>
      <p className="pr-sub">
        Every plan includes daily reports, attendance, material requests and the full mobile experience.
      </p>
      <div className="price-grid">
        {PLANS.map((plan) => (
          <div key={plan.name} className={`price-card${plan.popular ? " pop" : ""}`}>
            {plan.popular && <div className="pc-flag">Most popular</div>}
            <div className="pc-name">{plan.name}</div>
            <div className="pc-price num">
              {plan.price}
              <small> /month</small>
            </div>
            <div className="pc-for">{plan.forWho}</div>
            <ul>
              {plan.features.map((f) => (
                <li key={f}>
                  <b>✓</b>
                  {f}
                </li>
              ))}
            </ul>
            <Link href="/signup" className={`btn${plan.popular ? " btn-amber" : ""}`} style={{ justifyContent: "center" }}>
              {plan.cta}
            </Link>
          </div>
        ))}
      </div>
      <p className="pc-note">
        Prices in Malaysian Ringgit (MYR) · 14-day free trial on every plan · cancel anytime.
      </p>
    </section>
  );
}
