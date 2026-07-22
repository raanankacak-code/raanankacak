import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { getOrganizationById } from "@/lib/db/organizations";
import { listProjectsForOrg } from "@/lib/db/projects";
import { countActiveWorkersForOrg } from "@/lib/db/workers";
import { listAttendanceForOrgDate, sumLaborCostForOrg } from "@/lib/db/attendance";
import { listRecentReportsForOrg, listReports } from "@/lib/db/reports";
import { listRequestsForOrg } from "@/lib/db/materials";
import { listEventsForOrg } from "@/lib/db/calendar";
import { listNotificationsForOrg } from "@/lib/db/notifications";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);
}
function daysAhead(n: number) {
  return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
}

const NTF_ICON: Record<string, string> = {
  report: "🗒️",
  request: "✅",
  attendance: "👷",
  project: "🏗️",
  invite: "✉️",
  document: "📄",
  deadline: "⏰",
};

export default async function DashboardPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [org, projects, workerCount, todaysAttendance, recentReports, allReports, requests, events, notifications, laborCost] =
    await Promise.all([
      getOrganizationById(member.orgId),
      listProjectsForOrg(member.orgId),
      countActiveWorkersForOrg(member.orgId),
      listAttendanceForOrgDate(member.orgId, todayISO()),
      listRecentReportsForOrg(member.orgId, 6),
      listReports(member.orgId, { from: daysAgo(6) }),
      can(member.role, "viewMaterials") ? listRequestsForOrg(member.orgId) : Promise.resolve([]),
      listEventsForOrg(member.orgId, { from: todayISO(), to: daysAhead(30) }),
      listNotificationsForOrg(member.orgId, 6),
      sumLaborCostForOrg(member.orgId),
    ]);

  if (projects.length === 0) {
    return (
      <>
        <div className="topbar">
          <h2>Dashboard</h2>
          <div className="sub">
            Welcome, {member.name.split(" ")[0]} — let&rsquo;s set up {org?.name || "your workspace"}.
          </div>
        </div>
        <div className="card">
          <div className="empty">
            <div className="e-ic">🏗️</div>
            <div className="e-t">No Projects</div>
            <p>Create your first project to start managing construction work.</p>
            {can(member.role, "manageProjects") && (
              <Link href="/projects/new" className="btn btn-amber">
                ＋ Create Project
              </Link>
            )}
          </div>
        </div>
      </>
    );
  }

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const completedProjects = projects.filter((p) => p.status === "COMPLETED");
  const presentToday = todaysAttendance.filter((a) => a.status === "PRESENT" || a.status === "HALF_DAY").length;
  const absentToday = todaysAttendance.filter((a) => a.status === "ABSENT").length;
  const halfDayToday = todaysAttendance.filter((a) => a.status === "HALF_DAY").length;
  // Includes Planning/Active/On Hold so a brand-new (still-Planning) project's
  // contract value isn't invisible here — only fully Completed work drops off.
  const ongoingProjects = projects.filter((p) => p.status !== "COMPLETED");
  const totalContractValue = ongoingProjects.reduce((sum, p) => sum + (p.contractValue ? Number(p.contractValue) : 0), 0);
  const budgetUsage = totalContractValue ? Math.min(100, Math.round((laborCost / totalContractValue) * 100)) : 0;

  const pendingRequests = requests.filter((r) => r.status === "SUBMITTED");
  const approvedRequests = requests.filter((r) => r.status === "APPROVED");
  const rejectedRequests = requests.filter((r) => r.status === "REJECTED");
  const urgentRequests = requests.filter(
    (r) => r.neededBy && r.neededBy.toISOString().slice(0, 10) <= daysAhead(2) && !["DELIVERED", "REJECTED"].includes(r.status),
  );

  const todayReportsCount = allReports.filter((r) => r.date.toISOString().slice(0, 10) === todayISO()).length;
  const weekReportsCount = allReports.length;
  const upcomingInspections = events.filter((e) => e.type === "INSPECTION" && e.status === "SCHEDULED").length;
  const upcomingDeadlines = events
    .filter((e) => e.status === "SCHEDULED")
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
    .slice(0, 5);

  const quickActions = [
    can(member.role, "manageProjects") && { href: "/projects/new", label: "＋ New Project" },
    can(member.role, "submitReports") && { href: "/reports/new", label: "＋ Daily Report" },
    (can(member.role, "takeAttendance") || can(member.role, "manageWorkers")) && { href: "/attendance", label: "＋ Attendance" },
    can(member.role, "submitRequests") && { href: "/materials", label: "＋ Material Request" },
  ].filter((x): x is { href: string; label: string } => !!x);

  return (
    <>
      <div className="topbar">
        <h2>Dashboard</h2>
        <div className="top-actions">
          <Link href="/projects/new" className="btn btn-amber">
            + New project
          </Link>
        </div>
        <div className="sub">
          Good {new Date().getHours() < 12 ? "morning" : "day"}, {member.name.split(" ")[0]} — {org?.name} at a glance ·{" "}
          {formatDate(new Date())}
        </div>
      </div>

      {quickActions.length > 0 && (
        <div className="filters" style={{ marginBottom: 16 }}>
          {quickActions.map((a) => (
            <Link key={a.href} href={a.href} className="btn qa-btn">
              {a.label}
            </Link>
          ))}
        </div>
      )}

      <div className="kpis">
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--amber)" }}>
          <div className="k-lbl">Total Projects</div>
          <div className="k-val">{projects.length}</div>
          <div className="k-sub">{formatCurrency(totalContractValue)} under management</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--ok)" }}>
          <div className="k-lbl">Active Projects</div>
          <div className="k-val">{activeProjects.length}</div>
          <div className="k-sub">{completedProjects.length} completed</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--info)" }}>
          <div className="k-lbl">Workers Today</div>
          <div className="k-val">{presentToday}</div>
          <div className="k-sub">of {workerCount} on roster</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: pendingRequests.length ? "var(--bad)" : "var(--ok)" }}>
          <div className="k-lbl">Pending Requests</div>
          <div className="k-val">{pendingRequests.length}</div>
          <div className="k-sub">awaiting decision</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--info)" }}>
          <div className="k-lbl">Today&rsquo;s Reports</div>
          <div className="k-val">{todayReportsCount}</div>
          <div className="k-sub">{weekReportsCount} this week</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--amber)" }}>
          <div className="k-lbl">Upcoming Inspections</div>
          <div className="k-val">{upcomingInspections}</div>
          <div className="k-sub">next 30 days</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: budgetUsage > 85 ? "var(--bad)" : "var(--amber)" }}>
          <div className="k-lbl">Labour Cost</div>
          <div className="k-val">{budgetUsage}%</div>
          <div className="k-sub">of {formatCurrency(totalContractValue)} contract value</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--amber-deep)" }}>
          <div className="k-lbl">Daily Reports</div>
          <div className="k-val">{recentReports.length}</div>
          <div className="k-sub">most recent 6 shown below</div>
        </div>
      </div>

      <div className="two-col">
        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Project Progress</h3>
              <div className="right">
                <Link href="/projects" className="small">
                  All projects →
                </Link>
              </div>
            </div>
            <div className="card-b">
              {projects.slice(0, 6).map((p) => (
                <Link key={p.id} href={`/projects/${p.id}`} className="proj-row" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <b className="pr-name">{p.name}</b>
                    <span className={`badge ${statusBadgeClass(p.status)}`}>
                      <i className="dot" />
                      {statusLabel(p.status)}
                    </span>
                    <span className="pr-open" style={{ marginLeft: "auto" }}>
                      Open <span className="pr-go">→</span>
                    </span>
                  </div>
                  <div style={{ height: 6, background: "var(--panel2)", border: "1px solid var(--line2)", borderRadius: 99, overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${p.progressPct}%`,
                        background: "linear-gradient(90deg,var(--amber-deep),var(--amber))",
                      }}
                    />
                  </div>
                  <div className="small mut">
                    {p._count.workers} workers · {formatCurrency(p.contractValue)}
                  </div>
                </Link>
              ))}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Recent Daily Reports</h3>
              <div className="right">
                <Link href="/reports" className="small">
                  All reports →
                </Link>
              </div>
            </div>
            <div className="card-b">
              {recentReports.length === 0 ? (
                <p className="mut small">No daily reports submitted yet.</p>
              ) : (
                recentReports.map((r) => (
                  <Link
                    key={r.id}
                    href={`/reports/${r.id}`}
                    style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--line)" }}
                  >
                    <div>
                      <b style={{ fontSize: 13.5 }}>{r.project.name}</b>
                      <div className="small mut">
                        {formatDate(r.date)} · {r.weather || "—"}
                      </div>
                    </div>
                    <span className={`badge ${statusBadgeClass(r.status)}`}>
                      <i className="dot" />
                      {statusLabel(r.status)}
                    </span>
                  </Link>
                ))
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-h">
              <h3>Recent activity</h3>
              <span className="right small faint">latest first</span>
            </div>
            <div className="card-b" style={{ paddingTop: 6 }}>
              {notifications.length ? (
                notifications.map((n) => (
                  <div className="act-row" key={n.id}>
                    <div className="act-ic">{NTF_ICON[n.type] || "🔔"}</div>
                    <div style={{ minWidth: 0 }}>
                      <div className="small">{n.title}</div>
                      <div className="small faint">{n.description}</div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty" style={{ padding: 22 }}>
                  <div className="e-t">No activity yet</div>
                  <p>Reports, approvals and uploads will show up here as they happen.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="grid">
          <div className="card">
            <div className="card-h">
              <h3>Worker attendance</h3>
              <Link href="/attendance" className="right btn btn-ghost btn-sm">
                Open →
              </Link>
            </div>
            <div className="card-b" style={{ display: "grid", gap: 7 }}>
              {[
                ["Present", presentToday - halfDayToday, "#3ECF8E"],
                ["Half-day", halfDayToday, "#FFB020"],
                ["Absent", absentToday, "#FF6161"],
              ].map(([l, v, c]) => (
                <div className="small" key={l as string} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <i style={{ width: 9, height: 9, borderRadius: 3, background: c as string, display: "inline-block" }} />
                  {l}
                  <b className="num" style={{ marginLeft: "auto" }}>
                    {v}
                  </b>
                </div>
              ))}
            </div>
          </div>

          {can(member.role, "viewMaterials") && (
            <div className="card">
              <div className="card-h">
                <h3>Material request status</h3>
              </div>
              <div className="card-b">
                <div className="mini-cards">
                  {[
                    { l: "Pending", v: pendingRequests.length, c: "var(--amber-deep)" },
                    { l: "Approved", v: approvedRequests.length, c: "var(--info)" },
                    { l: "Rejected", v: rejectedRequests.length, c: "var(--bad)" },
                    { l: "Urgent", v: urgentRequests.length, c: "var(--bad)" },
                  ].map((c) => (
                    <Link key={c.l} href="/materials" className="mini-card">
                      <div className="mc-l">{c.l}</div>
                      <div className="mc-v" style={{ color: c.c }}>
                        {c.v}
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-h">
              <h3>Upcoming deadlines</h3>
              <Link href="/calendar" className="right btn btn-ghost btn-sm">
                Full calendar →
              </Link>
            </div>
            <div className="card-b" style={{ paddingTop: 8, display: "grid", gap: 2 }}>
              {upcomingDeadlines.length ? (
                upcomingDeadlines.map((d) => {
                  const days = Math.round((new Date(d.date).getTime() - new Date(todayISO()).getTime()) / 86400000);
                  return (
                    <div className="dl-row" key={d.id}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <b className="small" style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {d.title}
                        </b>
                        <span className="small faint">{d.projectId ? projects.find((p) => p.id === d.projectId)?.name : "Company-wide"}</span>
                      </div>
                      <div style={{ textAlign: "right", flex: "none" }}>
                        <div className="num small">{formatDate(d.date)}</div>
                        <div className="small" style={{ color: days <= 7 ? "var(--amber)" : "var(--faint)", fontWeight: 700 }}>
                          {days === 0 ? "Today" : `${days}d left`}
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="empty" style={{ padding: 20 }}>
                  <div className="e-t">No deadlines</div>
                  <p>Inspections and events will appear here.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
