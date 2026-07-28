/**
 * WCAG relative luminance and contrast, so colour choices can be measured
 * rather than eyeballed.
 *
 * Lives in the app rather than a script because the palette drifts: a colour
 * gets nudged to look better and quietly drops under the threshold, and
 * nobody notices because it still looks fine to whoever changed it.
 */

/** Parse #rgb, #rrggbb, or #rrggbbaa. Alpha is returned separately. */
export function parseHex(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.trim().replace(/^#/, "");
  const full =
    h.length === 3 || h.length === 4
      ? h
          .split("")
          .map((c) => c + c)
          .join("")
      : h;
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(full)) {
    throw new Error(`Not a hex colour: ${hex}`);
  }
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
    a: full.length === 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1,
  };
}

/**
 * Flatten a translucent colour onto an opaque one.
 *
 * The badge backgrounds are all low-alpha (`#3ecf8e14` is 8% green), so
 * measuring them as if they were opaque would report a contrast the user
 * never sees. What reaches the eye is the composite.
 */
export function over(foreground: string, background: string): string {
  const f = parseHex(foreground);
  const b = parseHex(background);
  const mix = (fc: number, bc: number) => Math.round(fc * f.a + bc * (1 - f.a));
  const hex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${hex(mix(f.r, b.r))}${hex(mix(f.g, b.g))}${hex(mix(f.b, b.b))}`;
}

export function relativeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
