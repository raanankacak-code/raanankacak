import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger, errorFields } from "@/lib/logger";

/**
 * Unauthenticated health check for load balancers and uptime monitors.
 * Verifies the app can reach the database. Returns no data beyond
 * status flags — safe to expose publicly.
 */
export async function GET() {
  const startedAt = Date.now();
  try {
    const { error } = await createAdminClient()
      .from("organizations")
      .select("id", { head: true, count: "exact" })
      .limit(1);
    if (error) throw error;

    return NextResponse.json({
      status: "ok",
      db: "ok",
      latencyMs: Date.now() - startedAt,
    });
  } catch (err) {
    logger.error("Health check failed", errorFields(err));
    return NextResponse.json(
      { status: "degraded", db: "unreachable" },
      { status: 503 },
    );
  }
}
