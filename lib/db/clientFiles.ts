import { createClient as createSessionClient } from "@/lib/supabase/server";

/**
 * May this client read this file?
 *
 * Uploaded files live at /api/uploads/{orgId}/{filename} — one bucket per
 * workspace, with no project in the path — so the org check that protects
 * staff is not enough for a client, who is scoped to a project rather than to
 * the workspace. A client may read a file only if some record they are
 * allowed to see points at it.
 *
 * The lookups run through the caller's own session, so row-level security
 * does the scoping: a row on a project they have no access to is invisible
 * here for exactly the same reason it is invisible in the portal. That means
 * this check cannot drift away from the policy — there is only one rule.
 */
export async function clientMaySeeFile(orgId: string, filename: string): Promise<boolean> {
  const url = `/api/uploads/${orgId}/${filename}`;
  const supabase = await createSessionClient();

  const referenced = async (
    table: string,
    column: string,
    value: unknown,
  ): Promise<boolean> => {
    const { data, error } = await supabase
      .from(table)
      .select("id")
      .filter(column, "cs", JSON.stringify(value))
      .limit(1);
    if (error) throw error;
    return (data ?? []).length > 0;
  };

  // Site diary photos.
  if (await referenced("daily_reports", "photos", [url])) return true;
  // Snag list: what was wrong, and what it looks like now.
  if (await referenced("defects", "photos", [url])) return true;
  if (await referenced("defects", "resolution_photos", [url])) return true;
  // Safety: evidence attached to the inspection, and to an individual finding
  // inside it — jsonb containment matches an element of the items array that
  // has this url among its own photos.
  if (await referenced("safety_inspections", "photos", [url])) return true;
  if (await referenced("safety_inspections", "items", [{ photos: [url] }])) return true;

  return false;
}
