import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The stylesheet against the markup it is written for.
 *
 * Six rules in globals.css styled `.mobile-nav button` for twenty-one
 * milestones. AppShell has always rendered links, so on a phone the bottom
 * navigation was unstyled the entire time: icons at their natural size,
 * labels in link amber running off the right edge, no active marker. Nothing
 * caught it — a selector that matches nothing is not an error anywhere, and
 * every browser test ran at desktop width where the nav is display:none.
 *
 * These are three seconds of string matching that would have.
 */
const root = process.cwd();
const CSS = readFileSync(join(root, "app", "globals.css"), "utf8");
const APP_SHELL = readFileSync(join(root, "components", "app", "AppShell.tsx"), "utf8");

/** The element each `.mobile-nav <x>` rule expects to find. */
function navRuleTargets(): string[] {
  return [...CSS.matchAll(/\.mobile-nav\s+([a-z]+)/g)].map((m) => m[1]);
}

describe("the mobile bottom navigation", () => {
  it("is styled for the element AppShell renders", () => {
    // AppShell renders next/link, which is an <a>.
    const navMarkup = /<nav className="mobile-nav">([\s\S]*?)<\/nav>/.exec(APP_SHELL)?.[1];
    expect(navMarkup, "the .mobile-nav element moved — this test needs to follow it").toBeTruthy();
    expect(navMarkup, "the nav items are no longer <Link>s; check what the CSS targets").toContain("<Link");

    const targets = new Set(navRuleTargets());
    expect(targets.has("a"), "no rule targets the <a> the nav is built from").toBe(true);
    expect(
      targets.has("button"),
      "a rule targets `.mobile-nav button`, and the nav contains no button — it will silently do nothing",
    ).toBe(false);
  });

  it("keeps every nav item big enough for a thumb", () => {
    // WCAG 2.2 2.5.8 asks 24px; a bottom bar used one-handed on site wants
    // more. e2e/mobile.spec.ts measures the rendered result; this catches a
    // careless edit without waiting for a browser.
    const heights = [...CSS.matchAll(/\.mobile-nav a\{[^}]*min-height:(\d+)px/g)].map((m) => Number(m[1]));
    expect(heights.length, "no min-height on the nav items at all").toBeGreaterThan(0);
    for (const h of heights) expect(h).toBeGreaterThanOrEqual(44);
  });
});

describe("the phone card layout", () => {
  const CARD_TABLES = [
    ["projects", "app/(app)/projects/ProjectsView.tsx"],
    ["daily reports", "app/(app)/reports/ReportsTable.tsx"],
    ["safety", "app/(app)/safety/SafetyView.tsx"],
    ["defects", "app/(app)/defects/DefectsView.tsx"],
    ["equipment", "app/(app)/equipment/EquipmentView.tsx"],
    ["materials", "app/(app)/materials/MaterialsView.tsx"],
    ["team", "app/(app)/team/TeamView.tsx"],
  ] as const;

  it.each(CARD_TABLES)("%s opts its list table into it", (_name, file) => {
    expect(readFileSync(join(root, file), "utf8")).toContain('<table className="cards">');
  });

  it("labels every cell it turns into a card row", () => {
    // The header row is hidden in card mode, so a cell with no data-label
    // and no card-t/card-a class is a value with nothing to say what it is.
    for (const [name, file] of CARD_TABLES) {
      const source = readFileSync(join(root, file), "utf8");
      // Bounded to the card table itself: these files also contain ordinary
      // tables — the usage log inside the equipment modal, for one — whose
      // cells are none of this test's business. Rows rendered by a separate
      // component (TeamView's InviteRow) fall outside this scan; those are
      // covered by e2e/mobile.spec.ts, which reads the rendered page.
      const tables = [...source.matchAll(/<table className="cards">([\s\S]*?)<\/table>/g)].map((m) => m[1]);
      expect(tables.length, `${name}: no card table found`).toBeGreaterThan(0);
      const cells = tables.flatMap((t) => [...t.matchAll(/<td(\s[^>]*)?>/g)].map((m) => m[1] ?? ""));
      const unlabelled = cells.filter(
        (attrs) => !attrs.includes("data-label") && !attrs.includes("card-t") && !attrs.includes("card-a"),
      );
      expect(unlabelled, `${name}: <td> with no data-label and no card-t/card-a`).toEqual([]);
    }
  });

  it("hides the header row it replaces with those labels", () => {
    expect(CSS).toMatch(/table\.cards thead\{display:none\}/);
  });
});
