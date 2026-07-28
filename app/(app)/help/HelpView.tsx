"use client";

import { useMemo, useState } from "react";
import Modal from "@/components/app/Modal";
import { apiFetch, ApiClientError } from "@/lib/api-client";
import { HELP_ARTICLES, HELP_CAT_CLS, APP_VERSION, type HelpArticle } from "./HelpData";

const CATS: ("All" | HelpArticle["cat"])[] = ["All", "Getting Started", "FAQ", "Video Tutorials"];

function ArticleCard({ a, onOpen }: { a: HelpArticle; onOpen: () => void }) {
  return (
    <div className="ha-card">
      {a.video && (
        <button className="ha-vid" onClick={onOpen} aria-label={`${a.title} — coming soon`}>
          <span className="ha-play">🎬</span>
          <span className="ha-len">Coming soon</span>
        </button>
      )}
      <div className="ha-t">
        {a.video ? "" : `${a.ic} `}
        {a.title}
      </div>
      <div className="ha-d">{a.desc}</div>
      <div className="ha-f">
        <span className={`badge ${HELP_CAT_CLS[a.cat]}`}>
          <span className="dot" />
          {a.cat}
        </span>
        <button className="ha-more" onClick={onOpen}>
          Read More →
        </button>
      </div>
    </div>
  );
}

type Admin = { name: string; email: string; role: "OWNER" | "ADMIN" };

export default function HelpView({
  orgName,
  memberFirstName,
  orgEmail,
  orgPhone,
  admins,
}: {
  orgName: string;
  memberFirstName: string;
  orgEmail: string | null;
  orgPhone: string | null;
  admins: Admin[];
}) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<(typeof CATS)[number]>("All");
  const [openArticle, setOpenArticle] = useState<HelpArticle | null>(null);
  const [bugOpen, setBugOpen] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const list = useMemo(() => {
    const query = q.trim().toLowerCase();
    return HELP_ARTICLES.filter((a) => cat === "All" || a.cat === cat).filter(
      (a) => !query || `${a.title} ${a.desc} ${a.body.join(" ")}`.toLowerCase().includes(query),
    );
  }, [q, cat]);

  return (
    <>
      <div className="topbar">
        <h2>Help Center</h2>
        <div className="top-actions">
          <span className="badge b-mut">
            <span className="dot" />
            {orgName} Workspace · v{APP_VERSION.v}
          </span>
        </div>
        <div className="sub">Guides, answers and support for {orgName}.</div>
      </div>

      <div className="filters">
        <input placeholder="Search help articles…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 250 }} />
        <div className="seg">
          {CATS.map((c) => (
            <button key={c} className={cat === c ? "on" : ""} onClick={() => setCat(c)}>
              {c}
            </button>
          ))}
        </div>
        {(q || cat !== "All") && (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setQ("");
              setCat("All");
            }}
          >
            Clear
          </button>
        )}
      </div>

      <div className="two-col">
        <div>
          {list.length === 0 ? (
            <div className="card">
              <div className="empty">
                <div className="e-ic">📖</div>
                <div className="e-t">No Articles Found</div>
                <p>Nothing matches &ldquo;{q.slice(0, 40)}&rdquo;. Try different keywords, or contact support.</p>
                <button
                  className="btn"
                  onClick={() => {
                    setQ("");
                    setCat("All");
                  }}
                >
                  Clear search
                </button>
              </div>
            </div>
          ) : cat === "All" ? (
            (["Getting Started", "FAQ", "Video Tutorials"] as const).map((c) => {
              const items = list.filter((a) => a.cat === c);
              if (!items.length) return null;
              return (
                <div key={c}>
                  <div className="gs-cat" style={{ padding: "14px 2px 10px" }}>
                    {c === "FAQ" ? "Frequently Asked Questions" : c}
                  </div>
                  <div className="help-grid">
                    {items.map((a) => (
                      <ArticleCard key={a.id} a={a} onOpen={() => setOpenArticle(a)} />
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="help-grid" style={{ marginTop: 4 }}>
              {list.map((a) => (
                <ArticleCard key={a.id} a={a} onOpen={() => setOpenArticle(a)} />
              ))}
            </div>
          )}
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Contact Support</h3>
            </div>
            <div className="card-b">
              <p className="small mut" style={{ marginBottom: 12 }}>
                BinaWorks doesn&rsquo;t have a live support line yet — for help with your workspace, reach out to your
                Owner or Admin.
              </p>
              {admins.length > 0 ? (
                <div style={{ display: "grid", gap: 8, marginBottom: (orgEmail || orgPhone) ? 14 : 0 }}>
                  {admins.map((a) => (
                    <a
                      key={a.email}
                      href={`mailto:${a.email}`}
                      className="hc-line"
                      style={{ textDecoration: "none", color: "inherit" }}
                    >
                      ✉ <b>{a.name}</b>
                      <span className="small mut">
                        {a.role === "OWNER" ? "Owner" : "Admin"} · {a.email}
                      </span>
                    </a>
                  ))}
                </div>
              ) : null}
              {(orgEmail || orgPhone) && (
                <>
                  {orgEmail && (
                    <div className="hc-line">
                      📧 <a href={`mailto:${orgEmail}`}>{orgEmail}</a>
                    </div>
                  )}
                  {orgPhone && (
                    <div className="hc-line">
                      📞 <b>{orgPhone}</b>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h3>Report a Bug</h3>
            </div>
            <div className="card-b">
              <p className="small mut" style={{ marginBottom: 12 }}>
                Something broken or behaving oddly? Tell us what happened.
              </p>
              <button className="btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => setBugOpen(true)}>
                🐞 Report Bug
              </button>
            </div>
          </div>
          <div className="card">
            <div className="card-h">
              <h3>System Version</h3>
            </div>
            <div className="card-b">
              <div className="hc-line">
                <span className="small mut" style={{ width: 76 }}>
                  Version
                </span>
                <b>v{APP_VERSION.v}</b>
              </div>
              <div className="hc-line">
                <span className="small mut" style={{ width: 76 }}>
                  Build
                </span>
                <b>{APP_VERSION.build}</b>
              </div>
              <div className="hc-line">
                <span className="small mut" style={{ width: 76 }}>
                  Channel
                </span>
                <span className="badge b-amber">
                  <span className="dot" />
                  {APP_VERSION.channel}
                </span>
              </div>
              <div className="powered" style={{ marginTop: 8 }}>
                Powered by Bina<span>Works</span>
              </div>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button className="btn btn-sm" style={{ flex: 1, justifyContent: "center" }} onClick={() => setChangelogOpen(true)}>
                  What&rsquo;s new
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {openArticle && (
        <Modal
          title={`${openArticle.video ? "🎬 " : `${openArticle.ic} `}${openArticle.title}`}
          onClose={() => setOpenArticle(null)}
          footer={
            <button className="btn btn-amber" onClick={() => setOpenArticle(null)}>
              Close
            </button>
          }
        >
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
            <span className={`badge ${HELP_CAT_CLS[openArticle.cat]}`}>
              <span className="dot" />
              {openArticle.cat}
            </span>
            <span className="small faint">{openArticle.video ? "Video tutorial · Coming soon" : "Article · 2 min read"}</span>
          </div>
          {openArticle.video && (
            <div className="ha-vid" style={{ height: 200, marginBottom: 14 }}>
              <span className="ha-play" style={{ width: 54, height: 54, fontSize: 20 }}>
                🎬
              </span>
              <span className="ha-len">Coming soon</span>
            </div>
          )}
          <div style={{ display: "grid", gap: 11 }}>
            {openArticle.body.map((p, i) => (
              <p key={i} className="small" style={{ color: "var(--mut)", lineHeight: 1.6 }}>
                {p}
              </p>
            ))}
          </div>
        </Modal>
      )}

      {bugOpen && <BugFormModal firstName={memberFirstName} onClose={() => setBugOpen(false)} />}

      {changelogOpen && (
        <Modal
          title={`What's New — v${APP_VERSION.v}`}
          onClose={() => setChangelogOpen(false)}
          footer={
            <button className="btn btn-amber" onClick={() => setChangelogOpen(false)}>
              Close
            </button>
          }
        >
          <div style={{ display: "grid", gap: 13 }}>
            <div>
              <b className="small">v0.9.4</b>
              <div className="small mut" style={{ marginTop: 3 }}>
                Team invites, materials, documents, calendar, notification center and global search.
              </div>
            </div>
            <div>
              <b className="small">v0.9.3</b>
              <div className="small mut" style={{ marginTop: 3 }}>
                Company settings, dynamic branding, dashboard widgets.
              </div>
            </div>
            <div>
              <b className="small">v0.9.2</b>
              <div className="small mut" style={{ marginTop: 3 }}>
                Ten-role permission system, email invitations.
              </div>
            </div>
            <div>
              <b className="small">v0.9.1</b>
              <div className="small mut" style={{ marginTop: 3 }}>
                Projects, daily reports, attendance with wages.
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}

function BugFormModal({ firstName, onClose }: { firstName: string; onClose: () => void }) {
  const AREAS = [
    "Dashboard",
    "Projects",
    "Daily Reports",
    "Attendance",
    "Material Requests",
    "Calendar",
    "Documents",
    "Team",
    "Company Settings",
    "Notifications",
    "Search",
    "Sign in / Registration",
    "Other",
  ];
  const [area, setArea] = useState(AREAS[0]);
  const [severity, setSeverity] = useState("Medium — annoying");
  const [desc, setDesc] = useState("");
  const [steps, setSteps] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [ref, setRef] = useState("");

  async function submit() {
    if (!desc.trim()) {
      setError("Please describe what happened.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const data = await apiFetch<{ report: { ref: string } }>("/api/bug-reports", {
        method: "POST",
        body: JSON.stringify({ area, severity, description: desc, steps: steps || undefined }),
      });
      setRef(data.report.ref);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (ref) {
    return (
      <Modal title="Bug Report Submitted" onClose={onClose} footer={<button className="btn btn-amber" onClick={onClose}>Done</button>}>
        <div style={{ textAlign: "center", padding: "8px 4px 2px" }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>🐞</div>
          <p style={{ marginBottom: 8 }}>Thanks, {firstName} — your report is in the queue.</p>
          <p className="mono" style={{ color: "var(--amber-text)", fontWeight: 600, fontSize: 16, marginBottom: 12 }}>
            {ref}
          </p>
          <p className="small mut" style={{ maxWidth: 360, margin: "0 auto" }}>
            We&rsquo;ll follow up at your account email if we need more detail.
          </p>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      title="Report a Bug"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-amber" disabled={submitting} onClick={submit}>
            {submitting ? "Submitting…" : "Submit Report"}
          </button>
        </>
      }
    >
      {error && <div className="auth-err">{error}</div>}
      <div className="form-grid">
        <div>
          <label htmlFor="helpview-where-did-it-happen">Where did it happen?</label>
          <select id="helpview-where-did-it-happen" value={area} onChange={(e) => setArea(e.target.value)}>
            {AREAS.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="helpview-severity">Severity</label>
          <select id="helpview-severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option>Low — cosmetic</option>
            <option>Medium — annoying</option>
            <option>High — blocks my work</option>
            <option>Critical — data problem</option>
          </select>
        </div>
        <div className="full">
          <label htmlFor="helpview-what-happened">What happened? *</label>
          <textarea id="helpview-what-happened" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="e.g. Clicking Approve on MR-108 shows a blank screen…" />
        </div>
        <div className="full">
          <label htmlFor="helpview-steps-to-reproduce-optional">
            Steps to reproduce <span className="faint">(optional)</span>
          </label>
          <textarea id="helpview-steps-to-reproduce-optional" value={steps} onChange={(e) => setSteps(e.target.value)} style={{ minHeight: 56 }} placeholder="1. Open… 2. Click… 3. See error" />
        </div>
      </div>
    </Modal>
  );
}
