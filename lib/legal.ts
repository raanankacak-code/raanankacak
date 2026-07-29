/**
 * The operator's details, the document version, and one flag that says whether
 * a human has actually read the result.
 *
 * These pages are a starting point written from what the app demonstrably
 * does — every category of personal data listed in /privacy was taken from
 * supabase/schema.sql, not from a template. That makes them accurate about
 * the software. It does not make them legal advice, and nobody involved in
 * writing them is a lawyer.
 *
 * So `reviewed` starts false. While it is false both pages carry a visible
 * notice saying so, and lib/legal.test.ts allows the placeholders below to
 * stay unfilled. Flip it to true only after a Malaysian advisor has read the
 * pages and the details below are real — at which point the same test starts
 * failing on any placeholder left behind. The flag cannot be true and the
 * document half-finished at the same time.
 */
export const OPERATOR = {
  /** Registered company name, as it appears on the SSM certificate. */
  legalName: "[registered company name]",
  /** SSM company registration number. */
  registrationNumber: "[SSM registration number]",
  /** Registered business address. */
  address: "[registered business address]",
  /** Where data subjects write to exercise their PDPA rights. */
  privacyEmail: "[privacy contact email]",
  /** General support address, shown on the terms page. */
  supportEmail: "[support email]",
  /**
   * The region the Supabase project runs in, e.g. "Singapore (ap-southeast-1)".
   * PDPA restricts transferring personal data outside Malaysia, so this has
   * to be stated rather than glossed over — see Project → Settings →
   * General → Region in the Supabase dashboard.
   */
  hostingRegion: "Singapore (ap-southeast-1)",
} as const;

/**
 * Bumped whenever the substance of either document changes.
 *
 * Stored alongside each acceptance, so "which version did they agree to" is
 * answerable years later. A date is used rather than a number because that is
 * the question people actually ask.
 */
export const LEGAL_VERSION = "2026-07-29";

/** Flip to true once a lawyer has reviewed both pages and OPERATOR is real. */
export const REVIEWED = false;

/** A placeholder is any bracketed instruction left in the text above. */
export const PLACEHOLDER = /\[[^\]]+\]/;

/** Every OPERATOR field still carrying a placeholder, by key. */
export function unfilledOperatorFields(): string[] {
  return Object.entries(OPERATOR)
    .filter(([, value]) => PLACEHOLDER.test(value))
    .map(([key]) => key);
}
