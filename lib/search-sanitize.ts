/**
 * Prepares a user-supplied search term for use inside a PostgREST `ilike`
 * filter built via string interpolation (supabase-js's `.or()` takes a raw
 * filter string, so untrusted input must never reach it unescaped).
 *
 * - Strips characters that have structural meaning in PostgREST's filter
 *   mini-language (`,` separates conditions, `()` group them) so a search
 *   term can never terminate the intended condition early or inject an
 *   extra one.
 * - Escapes SQL LIKE wildcards (`%`, `_`) so a literal percent or
 *   underscore in the search term is matched literally instead of acting
 *   as a wildcard.
 */
export function toIlikePattern(term: string): string {
  const withoutStructuralChars = term.replace(/[,()]/g, " ");
  const escaped = withoutStructuralChars
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .trim();
  return `%${escaped}%`;
}
