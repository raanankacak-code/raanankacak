import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

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

/**
 * Extracts the object filename from a stored URL, but only when that URL
 * belongs to `orgId`. Returns null for anything else — an external https://
 * link, a malformed value, or (importantly) a URL pointing at a *different*
 * org's folder, so a crafted row value can never delete another tenant's
 * file.
 */
export function objectNameFromUrl(orgId: string, url: string): string | null {
  const match = /^\/api\/uploads\/([^/]+)\/([^/]+)$/.exec(url);
  if (!match) return null;
  const [, urlOrgId, filename] = match;
  if (urlOrgId !== orgId) return null;
  if (filename === "." || filename === "..") return null;
  return filename;
}

/**
 * Deletes the stored objects behind a set of URLs. Used when the rows that
 * referenced them go away — without this, deleting a document or report
 * leaves its bytes in the bucket forever, silently growing storage cost.
 *
 * Best-effort by design: a failure here must not fail the user's delete,
 * which has already succeeded from their point of view. Worst case we leak
 * an object, which is exactly the situation this function improves.
 */
export async function removeObjectsByUrl(orgId: string, urls: (string | null | undefined)[]): Promise<void> {
  const keys = urls
    .filter((u): u is string => typeof u === "string" && u.length > 0)
    .map((u) => objectNameFromUrl(orgId, u))
    .filter((name): name is string => name !== null)
    .map((name) => objectKey(orgId, name));
  if (keys.length === 0) return;

  const { error } = await createAdminClient().storage.from(UPLOADS_BUCKET).remove(keys);
  if (error) {
    logger.warn("Failed to remove storage objects", { orgId, count: keys.length, message: error.message });
  }
}

/**
 * Removes every object under an org's folder, and returns how many.
 *
 * Paged, for the same reason `sumStorageBytesForOrg` is: `list()` returns
 * 100 objects unless told otherwise. An unpaged version of this silently
 * deleted the first 100 files of a workspace and left the rest in the
 * bucket with the organization row already gone — unreachable, and retained
 * after the user asked for them to be deleted.
 *
 * The listing is completed before anything is removed. Deleting while
 * paging by offset would shift the window under itself and skip objects.
 */
export async function removeAllObjectsForOrg(orgId: string): Promise<number> {
  const storage = createAdminClient().storage.from(UPLOADS_BUCKET);
  const PAGE = 100;
  const keys: string[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await storage.list(orgId, { limit: PAGE, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const object of data) keys.push(objectKey(orgId, object.name));
    if (data.length < PAGE) break;
  }

  for (let i = 0; i < keys.length; i += PAGE) {
    const { error } = await storage.remove(keys.slice(i, i + PAGE));
    if (error) throw error;
  }
  return keys.length;
}

/**
 * Total bytes stored under an org's folder, read straight from the bucket
 * rather than a counter column — no drift, and no migration needed for the
 * files that already exist.
 */
export async function sumStorageBytesForOrg(orgId: string): Promise<number> {
  const storage = createAdminClient().storage.from(UPLOADS_BUCKET);
  const PAGE = 100;
  let offset = 0;
  let total = 0;

  for (;;) {
    const { data, error } = await storage.list(orgId, { limit: PAGE, offset });
    if (error) throw error;
    if (!data || data.length === 0) break;
    for (const object of data) {
      total += (object.metadata?.size as number | undefined) ?? 0;
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return total;
}

function isNotFound(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message) : "";
  const status = "statusCode" in error ? String(error.statusCode) : "";
  return status === "404" || /not.?found/i.test(message);
}
