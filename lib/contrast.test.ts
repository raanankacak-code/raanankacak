import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { contrastRatio, over, parseHex, relativeLuminance } from "@/lib/contrast";

/**
 * The palette, measured.
 *
 * Read from globals.css rather than duplicated here, so changing a colour
 * changes what this test checks. A copy would drift and then reassure us
 * about values the app no longer uses.
 */
const CSS = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");

function cssVar(name: string): string {
  const match = new RegExp(`--${name}\\s*:\\s*(#[0-9a-fA-F]{3,8})`).exec(CSS);
  if (!match) throw new Error(`--${name} not found in globals.css`);
  return match[1];
}

const C = {
  ink: cssVar("ink"),
  ink2: cssVar("ink2"),
  panel: cssVar("panel"),
  panel2: cssVar("panel2"),
  text: cssVar("text"),
  mut: cssVar("mut"),
  faint: cssVar("faint"),
  amber: cssVar("amber"),
  amberDeep: cssVar("amber-deep"),
  amberText: cssVar("amber-text"),
  okText: cssVar("ok-text"),
  badText: cssVar("bad-text"),
  tealText: cssVar("teal-text"),
  purpleText: cssVar("purple-text"),
  info: cssVar("info"),
  ok: cssVar("ok"),
  bad: cssVar("bad"),
};

/** WCAG AA: 4.5:1 for body text, 3:1 for large text and UI components. */
const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe("contrast helpers", () => {
  it("computes known ratios", () => {
    // Black on white is the documented maximum.
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
  });

  it("is symmetric, since contrast has no direction", () => {
    expect(contrastRatio("#17212D", "#ffffff")).toBeCloseTo(contrastRatio("#ffffff", "#17212D"), 10);
  });

  it("expands shorthand hex", () => {
    expect(parseHex("#fff")).toEqual({ r: 255, g: 255, b: 255, a: 1 });
  });

  it("flattens an alpha colour onto its backdrop", () => {
    // The badge backgrounds are 8%-ish tints; measuring them as opaque would
    // report a contrast nobody ever sees.
    expect(over("#00000080", "#ffffff")).toBe("#7f7f7f");
    expect(over("#ff0000ff", "#ffffff")).toBe("#ff0000");
  });

  it("orders luminance the way brightness does", () => {
    expect(relativeLuminance("#ffffff")).toBeGreaterThan(relativeLuminance("#808080"));
    expect(relativeLuminance("#808080")).toBeGreaterThan(relativeLuminance("#000000"));
  });
});

describe("palette meets WCAG AA", () => {
  /**
   * Every opaque surface a word can be set on. There are only four, and none
   * of them is reserved for one component — a caption written for the sidebar
   * gets reused inside an input group a month later.
   */
  const surfaces: [string, string][] = [
    ["--panel (cards)", C.panel],
    ["--ink (page background)", C.ink],
    ["--ink2 (sidebar, hero)", C.ink2],
    ["--panel2 (inputs, hover, search box)", C.panel2],
  ];

  /**
   * Every colour used for text, crossed with every one of them.
   *
   * The earlier version of this test picked a plausible pair per colour —
   * --faint on --panel, and nothing else. --faint passed there at 4.59 and
   * failed at 4.13 on --panel2, where the search-shortcut hint actually
   * lives, and an axe scan found it. Enumerating by hand is the mistake;
   * the cross product is the fix.
   */
  const textColours: [string, string][] = [
    ["--text", C.text],
    ["--mut", C.mut],
    ["--faint", C.faint],
    ["--amber-text", C.amberText],
    ["--ok-text", C.okText],
    ["--bad-text", C.badText],
    ["--teal-text", C.tealText],
    ["--purple-text", C.purpleText],
    ["--info", C.info],
  ];

  const bodyText = textColours.flatMap(([fgName, fg]) =>
    surfaces.map(([bgName, bg]): [string, string, string] => [`${fgName} on ${bgName}`, fg, bg]),
  );

  it.each(bodyText)("%s", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  // Badge text sits on a translucent tint over whatever is behind it, so the
  // real background is the composite — and "whatever is behind it" is not
  // always the card. A status badge appears in a table row, in a search
  // result on --panel2, and on the page background between cards.
  const badgeTints: [string, string, string][] = [
    ["b-amber", C.amberText, "#ffb02015"],
    ["b-ok", C.okText, "#3ecf8e14"],
    ["b-bad", C.badText, "#ff616114"],
    ["b-info", C.info, "#5ea8ff14"],
    ["b-mut", C.mut, "#8ca1b810"],
    ["b-teal", C.tealText, "#4fd8c814"],
    ["b-purple", C.purpleText, "#c9a7ff14"],
  ];

  const badges = badgeTints.flatMap(([label, fg, tint]) =>
    surfaces.map(([bgName, bg]): [string, string, string] => [`${label} over ${bgName}`, fg, over(tint, bg)]),
  );

  it.each(badges)("badge %s", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the amber button's text is readable on amber", () => {
    // #241A02 is hard-coded in .btn-amber and .skip-link rather than being a
    // variable, so it is asserted by value.
    expect(contrastRatio("#241A02", C.amber)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the focus ring stands out against every surface it lands on", () => {
    // A focus indicator is a UI component: 3:1 against what surrounds it.
    for (const surface of [C.panel, C.ink, C.panel2]) {
      expect(contrastRatio(C.amberDeep, surface), surface).toBeGreaterThanOrEqual(AA_LARGE);
    }
  });

  it("never sets --amber-deep as a text colour", () => {
    // 3.92:1 on white. Correct for the focus ring, the avatar border and the
    // progress gradient; not legal for a word. Six rules and three inline
    // styles were using it for type. The palette check above cannot catch
    // this on its own, because the value is fine — the usage is not.
    const asText = [...CSS.matchAll(/(?<![-\w])color\s*:\s*var\(--amber-deep\)/g)];
    expect(asText.map(() => "color:var(--amber-deep)")).toEqual([]);
  });

  it("records why the bright accents are not used for text", () => {
    // Not a failure — a fact worth pinning. These are correct for fills,
    // borders and dots, and each has a -text twin for type. If one of these
    // ever passes, the twin has become unnecessary.
    expect(contrastRatio(C.amber, C.panel)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(C.ok, C.panel)).toBeLessThan(AA_TEXT);
  });
});
