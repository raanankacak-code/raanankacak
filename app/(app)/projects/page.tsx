import Link from "next/link";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { can } from "@/lib/permissions";
import { formatCurrency, formatDate, statusBadgeClass, statusLabel } from "@/lib/format";

export default async function ProjectsPage() {
  const member = await getCurrentMember();
  if (!member) return null;

  const [org, projects] = await Promise.all([
    prisma.organization.findUnique({ where: { id: member.orgId } }),
    prisma.project.findMany({
      where: { orgId: member.orgId },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { workers: true } } },
    }),
  ]);

  const totalValue = projects.reduce((s, p) => s + (p.contractValue ? Number(p.contractValue) : 0), 0);

  return (
    <>
      <div className="topbar">
        <h2>Projects</h2>
        {can(member.role, "manageProjects") && (
          <div className="top-actions">
            <Link href="/projects/new" className="btn btn-amber">
              + New project
            </Link>
          </div>
        )}
        <div className="sub">
          {org?.name} — {projects.length} project{projects.length === 1 ? "" : "s"}, {formatCurrency(totalValue)} total contract value.
        </div>
      </div>

      <div className="card">
        {projects.length === 0 ? (
          <div className="empty">
            <div className="e-ic">▤</div>
            <div className="e-t">No projects yet</div>
            <p>Create your first project to start tracking daily reports and attendance.</p>
            {can(member.role, "manageProjects") && (
              <Link href="/projects/new" className="btn btn-amber">
                + New project
              </Link>
            )}
          </div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead>
                <tr>
                  <th>Project</th>
                  <th>Client</th>
                  <th>Contract value</th>
                  <th>Duration</th>
                  <th>Progress</th>
                  <th>Status</th>
                  <th>Workers</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="rowlink">
                    <td>
                      <Link href={`/projects/${p.id}`}>
                        <b>{p.name}</b>
                      </Link>
                      {p.siteAddress && <div className="small mut">{p.siteAddress}</div>}
                    </td>
                    <td>{p.client || "—"}</td>
                    <td className="num">{formatCurrency(p.contractValue)}</td>
                    <td className="small mono">
                      {formatDate(p.startDate)} → {formatDate(p.endDate)}
                    </td>
                    <td className="num">{p.progressPct}%</td>
                    <td>
                      <span className={`badge ${statusBadgeClass(p.status)}`}>
                        <i className="dot" />
                        {statusLabel(p.status)}
                      </span>
                    </td>
                    <td className="num">{p._count.workers}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
