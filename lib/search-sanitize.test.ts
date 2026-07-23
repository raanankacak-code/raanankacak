import { describe, expect, it } from "vitest";
import { toIlikePattern } from "@/lib/search-sanitize";

describe("toIlikePattern", () => {
  it("wraps an ordinary search term in % wildcards", () => {
    expect(toIlikePattern("Riverside")).toBe("%Riverside%");
  });

  it("strips commas so a term can't terminate an .or() condition and inject another", () => {
    // Regression guard: `.or()` filter strings are built by string
    // interpolation, so a raw comma would end the current column.op.value
    // triple and let the rest of the term be parsed as a new one.
    expect(toIlikePattern("x,role.eq.OWNER")).toBe("%x role.eq.OWNER%");
  });

  it("strips parentheses used for PostgREST logical grouping", () => {
    expect(toIlikePattern("a)or(b.eq.1")).toBe("%a or b.eq.1%");
  });

  it("escapes literal SQL LIKE wildcards so they match literally", () => {
    expect(toIlikePattern("50%_off")).toBe("%50\\%\\_off%");
  });

  it("escapes a literal backslash before escaping wildcards", () => {
    expect(toIlikePattern("a\\b")).toBe("%a\\\\b%");
  });

  it("trims surrounding whitespace left after stripping structural characters", () => {
    expect(toIlikePattern("  hello  ")).toBe("%hello%");
  });
});
