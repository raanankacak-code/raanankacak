/**
 * Reading globals.css as data.
 *
 * Two test files scan the stylesheet for rules that target elements the app
 * does not render — the bug that left the phone's bottom navigation and the
 * project tab strip unstyled for milestones each. Both have to ignore
 * comments, and both have already been fooled by not doing so: one skipped a
 * real duplicate that followed a comment, the other read the word `button`
 * out of a sentence explaining that `.mobile-nav button` was the mistake.
 *
 * A scanner that reads prose as CSS reports on the wrong thing in both
 * directions, so the stripping lives in one place.
 */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}
