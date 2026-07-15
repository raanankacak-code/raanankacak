import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export default async function DashboardPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [org, projects, workerCount, todaysAttendance, recentReports] = await Promise.all([
    prisma.organization.findUnique({ where: { id: member.orgId } }),
    prisma.project.findMany({
      where: { orgId: member.orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { workers: true } } },
    }),
    prisma.worker.count({ where: { orgId: member.orgId, active: true } }),
    prisma.attendanceRecord.findMany({
      where: { orgId: member.orgId, date: new Date(todayISO()) },
    }),
    prisma.dailyReport.findMany({
      where: { orgId: member.orgId },
      orderBy: { date: "desc" },
      take: 6,
      include: { project: { select: { name: true } } },
    }),
  ]);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE").length;
  const completedProjects = projects.filter((p) => p.status === "COMPLETED").length;
  const presentToday = todaysAttendance.filter(
    (a) => a.status === "PRESENT" || a.status === "HALF_DAY",
  ).length;
  const totalContractValue = projects.reduce(
    (sum, p) => sum + (p.contractValue ? Number(p.contractValue) : 0),
    0,
  );

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
          Good morning, {member.name.split(" ")[0]} — {org?.name} at a glance · {formatDate(new Date())}
        </div>
      </div>

      <div className="kpis">
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--amber)" }}>
          <div className="k-lbl">Total Projects</div>
          <div className="k-val">{projects.length}</div>
          <div className="k-sub">{formatCurrency(totalContractValue)} under management</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--ok)" }}>
          <div className="k-lbl">Active Projects</div>
          <div className="k-val">{activeProjects}</div>
          <div className="k-sub">{completedProjects} completed</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--info)" }}>
          <div className="k-lbl">Workers on Roster</div>
          <div className="k-val">{workerCount}</div>
          <div className="k-sub">{presentToday} marked present today</div>
        </div>
        <div className="kpi" style={{ ["--kpi-c" as string]: "var(--amber-deep)" }}>
          <div className="k-lbl">Daily Reports</div>
          <div className="k-val">{recentReports.length}</div>
          <div className="k-sub">most recent 6 shown below</div>
        </div>
      </div>

      <div className="two-col">
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
            {projects.length === 0 ? (
              <div className="empty">
                <div className="e-ic">▤</div>
                <div className="e-t">No projects yet</div>
                <p>Create your first project to start tracking daily reports and attendance.</p>
                <Link href="/projects/new" className="btn btn-amber">
                  + New project
                </Link>
              </div>
            ) : (
              projects.slice(0, 6).map((p) => (
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
              ))
            )}
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
      </div>
    </>
  );
}
