import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireMember, apiErrorResponse } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { toIlikePattern } from "@/lib/search-sanitize";

type Item = { icon: string; title: string; sub: string; category: string; href: string };
type Group = { category: string; items: Item[] };

const LIMIT = 4;

export async function GET(request: Request) {
  try {
    const member = await requireMember();
    const url = new URL(request.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    if (!q) return NextResponse.json({ groups: [] });

    const supabase = createAdminClient();
    const like = toIlikePattern(q);
    const groups: Group[] = [];

    const { data: projects } = await supabase
      .from("projects")
      .select("id, name, site_address, client, manager_name, status")
      .eq("org_id", member.orgId)
      .or(`name.ilike.${like},site_address.ilike.${like},client.ilike.${like},manager_name.ilike.${like}`)
      .limit(LIMIT);
    if (projects && projects.length) {
      groups.push({
        category: "Projects",
        items: projects.map((p) => ({
          icon: "🏗️",
          title: p.name as string,
          sub: `${p.site_address || "—"} · ${p.status} · ${p.manager_name || "—"}`,
          category: "Project",
          href: `/projects/${p.id}`,
        })),
      });
    }

    if (can(member.role, "manageWorkers") || can(member.role, "takeAttendance")) {
      const { data: workers } = await supabase
        .from("workers")
        .select("id, name, trade, project_id, projects(name)")
        .eq("org_id", member.orgId)
        .or(`name.ilike.${like},trade.ilike.${like},ic_number.ilike.${like},cidb_number.ilike.${like}`)
        .limit(LIMIT);
      if (workers && workers.length) {
        groups.push({
          category: "Workers",
          items: workers.map((w) => {
            const proj = w.projects as unknown as { name: string } | null;
            return {
              icon: "👷",
              title: w.name as string,
              sub: `${w.trade || "—"} · ${proj?.name ?? "—"}`,
              category: "Worker",
              href: `/projects/${w.project_id}?tab=workers`,
            };
          }),
        });
      }
    }

    if (can(member.role, "viewReports")) {
      const { data: reports } = await supabase
        .from("daily_reports")
        .select("id, date, work_completed, weather, submitted_by_name, project_id, projects(name)")
        .eq("org_id", member.orgId)
        .or(`work_completed.ilike.${like},notes.ilike.${like},delays.ilike.${like},weather.ilike.${like}`)
        .order("date", { ascending: false })
        .limit(LIMIT);
      if (reports && reports.length) {
        groups.push({
          category: "Daily Reports",
          items: reports.map((r) => {
            const proj = r.projects as unknown as { name: string } | null;
            return {
              icon: "🗒️",
              title: `Daily report — ${r.date}`,
              sub: `${(r.work_completed as string | null)?.slice(0, 58) || "—"} · ${proj?.name ?? "—"}`,
              category: "Daily Report",
              href: `/reports/${r.id}`,
            };
          }),
        });
      }
    }

    if (can(member.role, "viewMaterials")) {
      const { data: requests } = await supabase
        .from("material_requests")
        .select("id, code, material, status, justification, project_id, projects(name)")
        .eq("org_id", member.orgId)
        .or(`material.ilike.${like},code.ilike.${like},justification.ilike.${like}`)
        .limit(LIMIT);
      if (requests && requests.length) {
        groups.push({
          category: "Material Requests",
          items: requests.map((r) => {
            const proj = r.projects as unknown as { name: string } | null;
            return {
              icon: "📦",
              title: r.material as string,
              sub: `${r.code} · ${r.status} · ${proj?.name ?? "—"}`,
              category: "Material Request",
              href: `/materials/${r.id}`,
            };
          }),
        });
      }
    }

    const { data: docs } = await supabase
      .from("documents")
      .select("id, name, folder, project_id, projects(name)")
      .eq("org_id", member.orgId)
      .or(`name.ilike.${like},folder.ilike.${like}`)
      .limit(LIMIT);
    if (docs && docs.length) {
      groups.push({
        category: "Documents",
        items: docs.map((d) => {
          const proj = d.projects as unknown as { name: string } | null;
          return {
            icon: "📄",
            title: d.name as string,
            sub: `${d.folder} · ${proj?.name ?? "—"}`,
            category: "Document",
            href: `/projects/${d.project_id}?tab=documents`,
          };
        }),
      });
    }

    if (can(member.role, "manageUsers")) {
      const { data: users } = await supabase
        .from("org_members")
        .select("id, name, role, email")
        .eq("org_id", member.orgId)
        .or(`name.ilike.${like},email.ilike.${like}`)
        .limit(LIMIT);
      if (users && users.length) {
        groups.push({
          category: "Users",
          items: users.map((u) => ({
            icon: "👤",
            title: u.name as string,
            sub: `${u.role} · ${u.email}`,
            category: "User",
            href: `/team`,
          })),
        });
      }
    }

    return NextResponse.json({ groups });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
