"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS, can } from "@/lib/permissions";
import type { Role } from "@/lib/db/types";
import {
  DashIcon,
  ProjIcon,
  RepIcon,
  AttIcon,
  MatIcon,
  CalIcon,
  TeamIcon,
  GearIcon,
  HelpIcon,
  AuditIcon,
  BillingIcon, SafetyIcon, DefectIcon, EquipIcon } from "@/components/app/icons";
import NotificationBell from "@/components/app/NotificationBell";
import GlobalSearch from "@/components/app/GlobalSearch";
import KeyboardShortcuts from "@/components/app/KeyboardShortcuts";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
  show: boolean;
  mobile?: boolean;
  badge?: number;
};

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
  orgLogoUrl,
  materialsBadge,
  safetyBadge,
  defectsBadge,
  equipmentBadge,
  billing,
}: {
  children: React.ReactNode;
  memberName: string;
  role: Role;
  orgName: string;
  orgShortName: string | null;
  orgLogoUrl: string | null;
  materialsBadge: number;
  safetyBadge: number;
  defectsBadge: number;
  equipmentBadge: number;
  billing: { trialing: boolean; daysLeft: number; readOnly: boolean };
}) {
  const pathname = usePathname();
  const router = useRouter();
  const displayName = orgShortName || orgName;

  const navItems: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: <DashIcon />, show: true },
    { href: "/projects", label: "Projects", icon: <ProjIcon />, show: true },
    { href: "/reports", label: "Daily Reports", icon: <RepIcon />, show: can(role, "viewReports") },
    {
      href: "/attendance",
      label: "Attendance",
      icon: <AttIcon />,
      show: can(role, "takeAttendance") || can(role, "manageWorkers"),
    },
    {
      href: "/materials",
      label: "Material Requests",
      icon: <MatIcon />,
      show: can(role, "viewMaterials"),
      badge: materialsBadge || undefined,
    },
    {
      href: "/safety",
      label: "Safety",
      icon: <SafetyIcon />,
      show: can(role, "viewReports"),
      badge: safetyBadge || undefined,
    },
    {
      href: "/defects",
      label: "Defects",
      icon: <DefectIcon />,
      show: can(role, "viewReports"),
      badge: defectsBadge || undefined,
    },
    {
      href: "/equipment",
      label: "Equipment",
      icon: <EquipIcon />,
      show: can(role, "viewReports"),
      badge: equipmentBadge || undefined,
    },
    { href: "/calendar", label: "Calendar", icon: <CalIcon />, show: true },
    { href: "/team", label: "Team", icon: <TeamIcon />, show: can(role, "manageUsers") },
    {
      href: "/settings",
      label: "Company Settings",
      icon: <GearIcon />,
      show: role === "OWNER" || role === "ADMIN",
    },
    { href: "/audit-log", label: "Audit Log", icon: <AuditIcon />, show: can(role, "viewAuditLog"), mobile: false },
    { href: "/billing", label: "Billing", icon: <BillingIcon />, show: can(role, "manageOrg"), mobile: false },
    { href: "/help", label: "Help Center", icon: <HelpIcon />, show: true, mobile: false },
  ];
  const visible = navItems.filter((n) => n.show);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="shell">
      <KeyboardShortcuts />
      <aside className="side">
        <div className="brand">
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogoUrl} className="brand-logo" alt={`${orgName} logo`} />
          ) : (
            <div className="brand-mark">{displayName.slice(0, 1).toUpperCase()}</div>
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 16.5, lineHeight: 1.15, letterSpacing: ".04em" }}>{displayName}</h1>
            <div className="powered">
              Powered by Bina<span>Works</span>
            </div>
          </div>
        </div>

        <div className="navlbl">Site Operations</div>
        {visible.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item${active ? " active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span aria-hidden>{item.icon}</span>
              <span>{item.label}</span>
              {!!item.badge && <span className="nav-badge">{item.badge}</span>}
            </Link>
          );
        })}

        <div className="side-foot">
          <div className="userchip">
            <Link href="/profile" className="uopen" aria-label="Open my profile" title="My profile">
              <div className="avatar">{initials(memberName)}</div>
              <div style={{ minWidth: 0 }}>
                <div className="nm" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {memberName}
                </div>
                <div className="rl">{ROLE_LABELS[role]}</div>
              </div>
            </Link>
            <NotificationBell />
          </div>
          <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 8 }} onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="main" id="main">
        <div className="mobile-topchip">
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogoUrl} className="brand-logo" style={{ width: 30, height: 30 }} alt="" />
          ) : (
            <div className="brand-mark">{displayName.slice(0, 1).toUpperCase()}</div>
          )}
          <b>{displayName}</b>
          <NotificationBell compact />
          <button className="btn btn-ghost btn-sm" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
        <GlobalSearch />
        {billing.readOnly ? (
          <div className="billing-banner ro" role="status">
            {can(role, "manageOrg") ? (
              <>
                Your {billing.trialing ? "free trial has ended" : "subscription is inactive"} — the workspace is
                read-only. <Link href="/billing">Choose a plan</Link> to continue working.
              </>
            ) : (
              <>This workspace is read-only right now. Ask your company Owner or Admin to update the subscription.</>
            )}
          </div>
        ) : billing.trialing && billing.daysLeft <= 7 ? (
          <div className="billing-banner" role="status">
            <b className="num">{billing.daysLeft}</b> day{billing.daysLeft === 1 ? "" : "s"} left in your free trial.
            {can(role, "manageOrg") && (
              <>
                {" "}
                <Link href="/billing">See plans</Link>
              </>
            )}
          </div>
        ) : null}
        {children}
      </main>

      {can(role, "submitReports") && pathname !== "/reports/new" && (
        <Link href="/reports/new" className="fab" aria-label="Create daily report">
          ＋<span>Report</span>
        </Link>
      )}

      <nav className="mobile-nav">
        {visible
          .filter((n) => n.mobile !== false)
          .map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link key={item.href} href={item.href} className={active ? "active" : ""}>
                <span aria-hidden>{item.icon}</span>
                <span>{item.label.split(" ")[0]}</span>
              </Link>
            );
          })}
      </nav>
    </div>
  );
}
