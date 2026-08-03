import { NextResponse } from "next/server";
import { requireMember, apiErrorResponse, ApiError } from "@/lib/auth";
import { buildOrgExport } from "@/lib/db/orgExport";
import { checkRateLimit } from "@/lib/rateLimit";
import { todayInOrgTimezone } from "@/lib/today";

/**
 * Downloads the whole workspace as JSON.
 *
 * Deliberately behind requireMember, not requireWritableMember: the Billing
 * page promises that when a trial lapses "all data is safe and can still be
 * viewed and exported", and locking someone out of their own site records
 * over a lapsed card would be far worse than refusing a write.
 */
export async function GET() {
  try {
    const member = await requireMember("manageOrg");

    // An export reads every table for the org, so it is the most expensive
    // request in the app — cheap to trigger, not cheap to serve.
    const rateLimit = await checkRateLimit(`org-export:${member.orgId}`, 5, 60 * 60_000);
    if (!rateLimit.allowed) {
      throw new ApiError(429, "Too many exports. Try again in a little while.");
    }

    const data = await buildOrgExport(member.orgId);
    const filename = `binaworks-export-${todayInOrgTimezone()}.json`;

    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        // Contains the entire workspace — never let a shared cache keep it.
        "Cache-Control": "no-store, private",
      },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }
}
