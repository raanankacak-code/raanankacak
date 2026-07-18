export default function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-shell">
      <section className="lg-hero">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" style={{ width: 42, height: 42, fontSize: 21 }}>
            B
          </div>
          <h1 style={{ fontSize: 24 }}>
            Bina<span>Works</span>
          </h1>
        </div>
        <div className="lg-mid">
          <div className="eyebrow">Construction &amp; contractor management · Sarawak</div>
          <h1>
            Run the <span>site</span> from your pocket.
          </h1>
          <p className="lede">
            One system for daily reports, attendance and material requests — so the
            paperwork keeps up with the concrete, not the other way around.
          </p>
          <ul className="lg-points">
            <li>Daily reports with site photos, filed from the field in minutes</li>
            <li>Attendance and wages in RM, calculated for you</li>
            <li>Material requests approved from anywhere, with a full audit trail</li>
          </ul>
        </div>
      </section>
      <section className="lg-panel">
        <div className="auth">{children}</div>
      </section>
    </div>
  );
}
