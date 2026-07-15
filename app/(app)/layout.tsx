import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentMember } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import AppShell from "@/components/app/AppShell";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const member = await getCurrentMember();
  if (!member) redirect("/signup/company");

  const org = await prisma.organization.findUnique({ where: { id: member.orgId } });
  if (!org) redirect("/signup/company");

  return (
    <AppShell memberName={member.name} role={member.role} orgName={org.name} orgShortName={org.shortName}>
      {children}
    </AppShell>
  );
}
