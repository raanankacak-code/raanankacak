import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { apiErrorResponse, ApiError } from "@/lib/auth";

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

    const existing = await prisma.orgMember.findFirst({
      where: { userId: user.id },
    });
    if (existing) {
      throw new ApiError(409, "This account already belongs to a company workspace");
    }

    const body = createOrgSchema.parse(await request.json());

    const org = await prisma.$transaction(async (tx) => {
      const created = await tx.organization.create({
        data: {
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
        },
      });
      await tx.orgMember.create({
        data: {
          orgId: created.id,
          userId: user.id,
          name: body.ownerName,
          email: user.email!,
          role: "OWNER",
        },
      });
      return created;
    });

    return NextResponse.json({ org }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    return apiErrorResponse(err);
  }
}
