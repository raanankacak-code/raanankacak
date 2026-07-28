/**
 * An id taken from a URL is a string until proven otherwise.
 *
 * Postgres rejects a non-uuid for a uuid column with an error, so a query
 * built from `/projects/not-a-uuid` throws rather than returning no rows —
 * and the user gets "Something went wrong" for what is simply a page that
 * does not exist. A malformed id cannot match any row, so treating it as
 * "not found" is both correct and the better experience.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}
