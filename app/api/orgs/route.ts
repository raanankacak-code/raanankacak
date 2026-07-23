import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getMemberByUserId, createOrganizationWithOwner, updateOrganization } from "@/lib/db/organizations";
import { apiErrorResponse, ApiError, requireWritableMember } from "@/lib/auth";

const createOrgSchema = z.object({
  name: z.string().min(2).max(200),
  shortName: z.string().max(80).optional(),
  ssmNumber: z.string().max(80).optional(),
  cidbNumber: z.string().max(80).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(40).optional(),
  addressLine1: z.string().max(200).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  postcode: z.string().max(20).optional(),
  ownerName: z.string().min(1).max(120),
});

/** Creates a company workspace for the signed-in user and makes them Owner. */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || !user.email) {
      throw new ApiError(401, "Not signed in");
    }

    const existing = await getMemberByUserId(user.id);
    if (existing) {
      throw new ApiError(409, "This account already belongs to a company workspace");
    }

    const body = createOrgSchema.parse(await request.json());

    const { org } = await createOrganizationWithOwner({
      name: body.name,
      shortName: body.shortName,
      ssmNumber: body.ssmNumber,
      cidbNumber: body.cidbNumber,
      email: body.email,
      phone: body.phone,
      addressLine1: body.addressLine1,
      city: body.city,
      state: body.state,
      postcode: body.postcode,
      ownerUserId: user.id,
      ownerEmail: user.email!,
      ownerName: body.ownerName,
    });

    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}

const updateOrgSchema = z.object({
  name: z.string().min(2).max(200).optional(),
  shortName: z.string().max(80).nullable().optional(),
  ssmNumber: z.string().max(80).nullable().optional(),
  cidbNumber: z.string().max(80).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  website: z.string().max(200).nullable().optional(),
  description: z.string().max(2000).nullable().optional(),
  addressLine1: z.string().max(200).nullable().optional(),
  addressLine2: z.string().max(200).nullable().optional(),
  city: z.string().max(100).nullable().optional(),
  state: z.string().max(100).nullable().optional(),
  postcode: z.string().max(20).nullable().optional(),
  country: z.string().max(60).optional(),
  currency: z.string().max(10).optional(),
  timezone: z.string().max(60).optional(),
  logoUrl: z.string().max(500).nullable().optional(),
});

/** Updates the signed-in member's company profile (Company Settings page). */
export async function PATCH(request: Request) {
  try {
    const member = await requireWritableMember("manageOrg");
    const body = updateOrgSchema.parse(await request.json());
    const org = await updateOrganization(member.orgId, body);
    return NextResponse.json({ org });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
