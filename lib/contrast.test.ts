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
  const bodyText: [string, string, string][] = [
    ["--text on --panel (card body)", C.text, C.panel],
    ["--text on --ink (page background)", C.text, C.ink],
    ["--text on --panel2 (inputs, hover)", C.text, C.panel2],
    ["--mut on --panel (labels, secondary)", C.mut, C.panel],
    ["--mut on --ink", C.mut, C.ink],
    ["--faint on --panel (placeholders, captions)", C.faint, C.panel],
    ["--amber-text on --panel (links)", C.amberText, C.panel],
  ];

  it.each(bodyText)("%s", (_label, fg, bg) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  // Badge text sits on a translucent tint over the card, so the real
  // background is the composite, not the tint.
  const badges: [string, string, string][] = [
    ["b-amber", C.amberText, over("#ffb02015", C.panel)],
    ["b-ok", C.okText, over("#3ecf8e14", C.panel)],
    ["b-bad", C.badText, over("#ff616114", C.panel)],
    ["b-info", C.info, over("#5ea8ff14", C.panel)],
    ["b-mut", C.mut, over("#8ca1b810", C.panel)],
    ["b-teal", C.tealText, over("#4fd8c814", C.panel)],
    ["b-purple", C.purpleText, over("#c9a7ff14", C.panel)],
  ];

  it.each(badges)("badge %s text on its own tint", (_label, fg, bg) => {
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

  it("records why the bright accents are not used for text", () => {
    // Not a failure — a fact worth pinning. These are correct for fills,
    // borders and dots, and each has a -text twin for type. If one of these
    // ever passes, the twin has become unnecessary.
    expect(contrastRatio(C.amber, C.panel)).toBeLessThan(AA_TEXT);
    expect(contrastRatio(C.ok, C.panel)).toBeLessThan(AA_TEXT);
  });
});
