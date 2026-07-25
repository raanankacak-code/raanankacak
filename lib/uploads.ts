import { createAdminClient } from "@/lib/supabase/admin";

/**
 * File storage, backed by a *private* Supabase Storage bucket.
 *
 * Objects are keyed `{orgId}/{filename}`, and the bucket has no storage RLS
 * policies at all — which means the anon and authenticated keys cannot read
 * it, by design. The only way to reach a file is through this app's own
 * routes (`app/api/uploads/[...path]`), which check that the caller's org
 * matches the object's org prefix before streaming it back. Tenant
 * isolation for files is therefore enforced in one place, on every read.
 *
 * Deliberately NOT public and NOT signed-URL based: a public bucket would
 * make every site photo and client document world-readable to anyone with
 * the URL, and signed URLs expire, so they can't be the value we persist in
 * documents.url / daily_reports.photos / organizations.logo_url.
 */

export const UPLOADS_BUCKET = "uploads";

/** Object key for a file within an org's folder. `orgId` is never client-supplied. */
export function objectKey(orgId: string, filename: string): string {
  return `${orgId}/${filename}`;
}

export async function putObject(
  orgId: string,
  filename: string,
  body: Buffer,
  contentType: string,
): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(UPLOADS_BUCKET)
    .upload(objectKey(orgId, filename), body, { contentType, upsert: false });
  if (error) throw error;
}

/**
 * Returns the object's bytes, or null when it does not exist — callers turn
 * that into a 404 rather than leaking the difference between "wrong org" and
 * "no such file".
 */
export async function getObject(orgId: string, filename: string): Promise<ArrayBuffer | null> {
  const { data, error } = await createAdminClient()
    .storage.from(UPLOADS_BUCKET)
    .download(objectKey(orgId, filename));
  if (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
  return data ? data.arrayBuffer() : null;
}

export async function removeObject(orgId: string, filename: string): Promise<void> {
  const { error } = await createAdminClient()
    .storage.from(UPLOADS_BUCKET)
    .remove([objectKey(orgId, filename)]);
  if (error) throw error;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const status = "statusCode" in error ? String(error.statusCode) : "";
  return status === "404" || /not.?found/i.test(message);
}
