import { z } from "zod";

/**
 * Restricts a client-supplied URL to same-origin paths (e.g. `/api/uploads/...`)
 * or `https://` links. Blocks `javascript:`, `data:`, `vbscript:` and other
 * schemes that would execute or embed arbitrary content if the URL is later
 * rendered as a link (`<a href>`) or image (`<img src>`).
 */
export const safeUrlSchema = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith("/") || /^https:\/\//i.test(value), {
    message: "URL must be a relative path or start with https://",
  });
