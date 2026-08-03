import { createAdminClient } from "@/lib/supabase/admin";
import { removeAllObjectsForOrg } from "@/lib/uploads";
import type { Organization, OrgMember, Role } from "@/lib/db/types";

function mapOrganization(row: Record<string, unknown>): Organization {
  return {
    id: row.id as string,
    name: row.name as string,
    shortName: row.short_name as string | null,
    ssmNumber: row.ssm_number as string | null,
    cidbNumber: row.cidb_number as string | null,
    email: row.email as string | null,
    phone: row.phone as string | null,
    website: row.website as string | null,
    description: row.description as string | null,
    addressLine1: row.address_line1 as string | null,
    addressLine2: row.address_line2 as string | null,
    city: row.city as string | null,
    postcode: row.postcode as string | null,
    state: row.state as string | null,
    country: row.country as string,
    currency: row.currency as string,
    timezone: row.timezone as string,
    logoUrl: row.logo_url as string | null,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };
}

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

export async function getOrganizationById(
  id: string,
): Promise<Organization | null> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOrganization(data) : null;
}

export async function updateOrganization(
  id: string,
  input: Partial<{
    name: string;
    shortName: string | null;
    ssmNumber: string | null;
    cidbNumber: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    description: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    postcode: string | null;
    state: string | null;
    country: string;
    currency: string;
    timezone: string;
    logoUrl: string | null;
  }>,
): Promise<Organization> {
  const { data, error } = await createAdminClient()
    .from("organizations")
    .update({
      name: input.name,
      short_name: input.shortName,
      ssm_number: input.ssmNumber,
      cidb_number: input.cidbNumber,
      email: input.email,
      phone: input.phone,
      website: input.website,
      description: input.description,
      country: input.country,
      currency: input.currency,
      timezone: input.timezone,
      address_line1: input.addressLine1,
      address_line2: input.addressLine2,
      city: input.city,
      postcode: input.postcode,
      state: input.state,
      logo_url: input.logoUrl,
    })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return mapOrganization(data);
}

export async function getMemberByUserId(
  userId: string,
  { activeOnly = false }: { activeOnly?: boolean } = {},
): Promise<OrgMember | null> {
  let query = createAdminClient()
    .from("org_members")
    .select("*")
    .eq("user_id", userId);
  if (activeOnly) query = query.eq("active", true);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data ? mapOrgMember(data) : null;
}

export async function createOrganizationWithOwner(input: {
  name: string;
  shortName?: string;
  ssmNumber?: string;
  cidbNumber?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  postcode?: string;
  ownerUserId: string;
  ownerEmail: string;
  ownerName: string;
}): Promise<{ org: Organization; member: OrgMember }> {
  const supabase = createAdminClient();

  const { data: orgRow, error: orgError } = await supabase
    .from("organizations")
    .insert({
      name: input.name,
      short_name: input.shortName,
      ssm_number: input.ssmNumber,
      cidb_number: input.cidbNumber,
      email: input.email,
      phone: input.phone,
      address_line1: input.addressLine1,
      city: input.city,
      state: input.state,
      postcode: input.postcode,
    })
    .select("*")
    .single();
  if (orgError) throw orgError;

  const { data: memberRow, error: memberError } = await supabase
    .from("org_members")
    .insert({
      org_id: orgRow.id,
      user_id: input.ownerUserId,
      name: input.ownerName,
      email: input.ownerEmail,
      role: "OWNER" satisfies Role,
    })
    .select("*")
    .single();
  if (memberError) {
    await supabase.from("organizations").delete().eq("id", orgRow.id);
    throw memberError;
  }

  return { org: mapOrganization(orgRow), member: mapOrgMember(memberRow) };
}

/**
 * Permanently deletes an organisation and everything belonging to it.
 *
 * Sign-in accounts are deliberately left alone. One Owner should not be able
 * to destroy a colleague's login — which may be used for another workspace,
 * or to accept a future invitation — so members simply lose their membership
 * and land back on the "create a company" screen.
 *
 * Uploaded files are removed first: the database cascade knows nothing about
 * the storage bucket, so deleting the org first would orphan every object
 * with no record left of which they were.
 */
export async function deleteOrganization(orgId: string): Promise<void> {
  const supabase = createAdminClient();

  await removeAllObjectsForOrg(orgId);

  // organizations -> members, projects, workers, reports, materials,
  // documents, calendar, notifications, audit log, subscription all cascade.
  const { error } = await supabase
    .from("organizations")
    .delete()
    .eq("id", orgId);
  if (error) throw error;
}
