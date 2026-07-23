import { describe, expect, it } from "vitest";
import { safeUrlSchema } from "@/lib/url-validation";

describe("safeUrlSchema", () => {
  it("accepts a relative upload path", () => {
    expect(safeUrlSchema.safeParse("/api/uploads/org-1/file.pdf").success).toBe(true);
  });

  it("accepts an https:// URL", () => {
    expect(safeUrlSchema.safeParse("https://example.com/drawing.pdf").success).toBe(true);
  });

  it("rejects a javascript: URL (stored-XSS vector when rendered as a link)", () => {
    expect(safeUrlSchema.safeParse("javascript:alert(document.cookie)").success).toBe(false);
  });

  it("rejects a data: URL", () => {
    expect(safeUrlSchema.safeParse("data:text/html,<script>alert(1)</script>").success).toBe(false);
  });

  it("rejects a plain http:// URL (only https is allowed)", () => {
    expect(safeUrlSchema.safeParse("http://example.com/file.pdf").success).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(safeUrlSchema.safeParse("").success).toBe(false);
  });
});
