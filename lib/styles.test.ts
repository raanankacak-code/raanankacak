import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * One stylesheet, one meaning per class name.
 *
 * A duplicated class is the quietest bug in CSS: nothing errors, both rules
 * apply, and the element silently wears whichever properties each declared.
 * It happened here — a `.letterhead` written for the printed inspection
 * record collided with a dead `.letterhead` left over from an abandoned
 * branding preview, and the company heading came out sitting in a grey box
 * nobody had asked for. It took a screenshot to notice.
 *
 * So: a bare class selector may be declared once, outside a media query.
 * Descendant selectors (`.a .b`), state variants (`.a:hover`) and anything
 * inside a `@media` block are all legitimate refinements and are ignored.
 */
const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

/** The stylesheet with comments and every @media block removed. */
function topLevelRules(css: string): string {
  // Comments first: a rule that follows one is still a rule, and an earlier
  // version of this test missed exactly those — which made it pass while the
  // duplicate it was written to catch sat in the file.
  const noComments = css.replace(/\/\*[\s\S]*?\*\//g, "");

  let out = "";
  let i = 0;
  while (i < noComments.length) {
    if (noComments.startsWith("@media", i)) {
      let depth = 0;
      let j = noComments.indexOf("{", i);
      for (; j < noComments.length; j++) {
        if (noComments[j] === "{") depth++;
        else if (noComments[j] === "}") {
          depth--;
          if (depth === 0) break;
        }
      }
      i = j + 1;
      continue;
    }
    out += noComments[i];
    i++;
  }
  return out;
}

describe("globals.css", () => {
  it("declares each bare class exactly once outside a media query", () => {
    const counts = new Map<string, number>();

    // Split on the closing brace and take what precedes each `{`: every rule
    // is counted, wherever it sits and whatever precedes it.
    for (const chunk of topLevelRules(CSS).split("}")) {
      const brace = chunk.indexOf("{");
      if (brace === -1) continue;
      for (const selector of chunk.slice(0, brace).split(",")) {
        const s = selector.trim();
        // Only `.foo` — one class, nothing else. That is the case where two
        // declarations can only be a collision rather than a refinement.
        if (!/^\.[a-zA-Z][\w-]*$/.test(s)) continue;
        counts.set(s, (counts.get(s) ?? 0) + 1);
      }
    }

    const duplicated = [...counts.entries()]
      .filter(([, n]) => n > 1)
      .map(([selector, n]) => `${selector} declared ${n} times`);

    expect(duplicated, "two rules for one class name — one of them is a surprise").toEqual([]);
  });

  it("keeps the app's furniture off the printed page", () => {
    // Every printable artefact is something a customer or an officer is
    // handed. A sidebar, a search box or a floating button on it says the
    // company sent a screenshot of an app rather than a document.
    const printBlock = /@media print\{([\s\S]*?)\n\}/.exec(CSS)?.[1] ?? "";
    expect(printBlock, "no @media print block found").not.toBe("");

    for (const furniture of [".side", ".mobile-nav", ".fab", ".no-print", ".skip-link", ".gs-wrap"]) {
      expect(printBlock, `${furniture} is not hidden when printing`).toContain(furniture);
    }
  });
});
