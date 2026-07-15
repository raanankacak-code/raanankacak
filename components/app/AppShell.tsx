"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/permissions";
import type { Role } from "@/app/generated/prisma/enums";

type NavItem = { href: string; label: string; icon: string };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: "▦" },
  { href: "/projects", label: "Projects", icon: "▤" },
  { href: "/reports", label: "Daily Reports", icon: "▥" },
  { href: "/attendance", label: "Attendance", icon: "▣" },
];

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
}

export default function AppShell({
  children,
  memberName,
  role,
  orgName,
  orgShortName,
}: {
  children: React.ReactNode;
  memberName: string;
  role: Role;
  orgName: string;
  orgShortName: string | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = orgShortName || orgName;

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">{displayName.slice(0, 1).toUpperCase()}</div>
          <div>
            <h1 style={{ fontSize: 15, lineHeight: 1.15 }}>{displayName}</h1>
            <div className="small faint" style={{ letterSpacing: ".06em" }}>
              POWERED BY BINAWORKS
            </div>
          </div>
        </div>

        <div className="navlbl">Site Operations</div>
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={`nav-item${active ? " active" : ""}`}>
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}

        <div className="side-foot">
          <div className="userchip">
            <div className="avatar">{initials(memberName)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="nm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {memberName}
              </div>
              <div className="rl">{ROLE_LABELS[role]}</div>
            </div>
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main" id="main">
        <div className="mobile-topchip">
          <div className="brand-mark">{displayName.slice(0, 1).toUpperCase()}</div>
          <b>{displayName}</b>
        </div>
        {children}
      </main>

      <nav className="mobile-nav">
        {NAV_ITEMS.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link key={item.href} href={item.href} className={active ? "active" : ""}>
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
