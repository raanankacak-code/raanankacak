import { randomBytes } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { grantProjectAccess } from "@/lib/db/projectAccess";
import { createClient as createSessionClient } from "@/lib/supabase/server";
import type { InviteStatus, OrgInvite, OrgMember, Role } from "@/lib/db/types";

function mapOrgMember(row: Record<string, unknown>): OrgMember {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    userId: row.user_id as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as Role,
    active: row.active as boolean,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

function mapInvite(row: Record<string, unknown>): OrgInvite {
  return {
    id: row.id as string,
    orgId: row.org_id as string,
    token: row.token as string,
    name: row.name as string,
    email: row.email as string,
    role: row.role as Role,
    phone: row.phone as string | null,
    department: row.department as string | null,
    projectIds: (row.project_ids as string[] | null) ?? [],
    status: row.status as InviteStatus,
    invitedByName: row.invited_by_name as string,
    invitedAt: new Date(row.invited_at as string),
    expiresAt: new Date(row.expires_at as string),
    acceptedAt: row.accepted_at ? new Date(row.accepted_at as string) : null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

export async function listMembersForOrg(orgId: string): Promise<OrgMember[]> {
  const { data, error } = await createAdminClient()
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapOrgMember);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listMembersForOrgViaSession(
  orgId: string,
): Promise<OrgMember[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("org_members")
    .select("*")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapOrgMember);
}

export async function getMemberById(
  orgId: string,
  id: string,
): Promise<OrgMember | null> {
  const { data, error } = await createAdminClient()
    .from("org_members")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOrgMember(data) : null;
}

export async function updateMember(
  orgId: string,
  id: string,
  input: { role?: Role; active?: boolean; name?: string },
): Promise<OrgMember> {
  const { data, error } = await createAdminClient()
    .from("org_members")
    .update({ role: input.role, active: input.active, name: input.name })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapOrgMember(data);
}

export async function removeMember(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("org_members")
    .delete()
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}

/**
 * Team accounts in use, for the plan limit.
 *
 * Client accounts are excluded on purpose: a customer who has been given a
 * login to watch their own job is not one of the contractor's five staff
 * seats, and charging for them would make the feature something to avoid
 * using.
 */
export async function countActiveMembersForOrg(orgId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("org_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("role", "CLIENT")
    .eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function countPendingInvitesForOrg(
  orgId: string,
): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("org_invites")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .neq("role", "CLIENT")
    .eq("status", "PENDING");
  if (error) throw error;
  return count ?? 0;
}

export async function countOwners(orgId: string): Promise<number> {
  const { count, error } = await createAdminClient()
    .from("org_members")
    .select("*", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "OWNER")
    .eq("active", true);
  if (error) throw error;
  return count ?? 0;
}

export async function listInvitesForOrg(orgId: string): Promise<OrgInvite[]> {
  const { data, error } = await createAdminClient()
    .from("org_invites")
    .select("*")
    .eq("org_id", orgId)
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapInvite);
}

/** Tenant-isolation pilot rollout (see listProjectsForOrgViaSession in projects.ts). */
export async function listInvitesForOrgViaSession(
  orgId: string,
): Promise<OrgInvite[]> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from("org_invites")
    .select("*")
    .eq("org_id", orgId)
    .order("invited_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapInvite);
}

export async function getInviteByToken(
  token: string,
): Promise<OrgInvite | null> {
  const { data, error } = await createAdminClient()
    .from("org_invites")
    .select("*")
    .eq("token", token)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInvite(data) : null;
}

export async function getInviteById(
  orgId: string,
  id: string,
): Promise<OrgInvite | null> {
  const { data, error } = await createAdminClient()
    .from("org_invites")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapInvite(data) : null;
}

/**
 * Invite tokens are bearer credentials: the public lookup endpoint trades a
 * token for the invitee's name, email, role and company name, so a guessable
 * token is a PII disclosure. 32 bytes (256 bits) puts brute force out of
 * reach regardless of how well the rate limiter in front of it holds up.
 *
 * Older invites carry a shorter token from a previous scheme; lookup is an
 * exact match on the stored value, so those keep working until they expire.
 */
function genToken() {
  return "BW-" + randomBytes(32).toString("base64url");
}

export async function createInvite(
  orgId: string,
  input: {
    name: string;
    email: string;
    role: Role;
    phone?: string;
    department?: string;
    projectIds?: string[];
    invitedByName: string;
  },
): Promise<OrgInvite> {
  const { data, error } = await createAdminClient()
    .from("org_invites")
    .insert({
      org_id: orgId,
      token: genToken(),
      name: input.name,
      email: input.email,
      role: input.role,
      phone: input.phone,
      department: input.department,
      project_ids: input.projectIds ?? [],
      invited_by_name: input.invitedByName,
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapInvite(data);
}

export async function resendInvite(
  orgId: string,
  id: string,
): Promise<OrgInvite> {
  const { data, error } = await createAdminClient()
    .from("org_invites")
    .update({
      status: "PENDING",
      invited_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
    })
    .eq("id", id)
    .eq("org_id", orgId)
    .select("*")
    .single();
  if (error) throw error;
  return mapInvite(data);
}

export async function cancelInvite(orgId: string, id: string): Promise<void> {
  const { error } = await createAdminClient()
    .from("org_invites")
    .update({ status: "CANCELLED" })
    .eq("id", id)
    .eq("org_id", orgId);
  if (error) throw error;
}

export async function acceptInvite(
  token: string,
  input: { userId: string; email: string },
): Promise<{ invite: OrgInvite; member: OrgMember }> {
  const supabase = createAdminClient();
  const invite = await getInviteByToken(token);
  if (!invite) throw new Error("Invitation not found");
  if (invite.status !== "PENDING")
    throw new Error("This invitation is no longer valid");
  if (invite.expiresAt.getTime() < Date.now())
    throw new Error("This invitation has expired");
  // The token alone is a bearer credential — anyone who obtains it (a forwarded
  // link, a browser history entry, etc.) could otherwise join the org under a
  // different account. Require the signed-in account's email to match.
  if (invite.email.toLowerCase() !== input.email.toLowerCase()) {
    throw new Error("This invitation was sent to a different email address");
  }

  // The app assumes one workspace per account (getMemberByUserId uses
  // maybeSingle()). A second membership makes that query fail for *every*
  // authenticated request, locking the account out with no way back — so
  // refuse here rather than let someone accept their way into that state.
  const { data: existingMemberships, error: existingError } = await supabase
    .from("org_members")
    .select("id")
    .eq("user_id", input.userId);
  if (existingError) throw existingError;
  if (existingMemberships && existingMemberships.length > 0) {
    throw new Error(
      "This account already belongs to a company workspace. Sign up with a different email address to join this one.",
    );
  }

  const { data: memberRow, error: memberError } = await supabase
    .from("org_members")
    .insert({
      org_id: invite.orgId,
      user_id: input.userId,
      name: invite.name,
      email: input.email,
      role: invite.role,
    })
    .select("*")
    .single();
  if (memberError) throw memberError;

  // A client invitation names the projects it is for. Granting them here,
  // from the invitation rather than from anything the person signing up sent,
  // is what stops a client widening their own access at signup.
  if (invite.role === "CLIENT" && invite.projectIds.length > 0) {
    await grantProjectAccess(
      invite.orgId,
      memberRow.id as string,
      invite.projectIds,
      invite.invitedByName,
    );
  }

  const { data: inviteRow, error: inviteError } = await supabase
    .from("org_invites")
    .update({ status: "ACCEPTED", accepted_at: new Date().toISOString() })
    .eq("id", invite.id)
    .select("*")
    .single();
  if (inviteError) throw inviteError;

  return { invite: mapInvite(inviteRow), member: mapOrgMember(memberRow) };
}
