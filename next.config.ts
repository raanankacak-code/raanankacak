import type { NextConfig } from "next";

/**
 * Response headers applied to everything the app serves.
 *
 * Content-Security-Policy is deliberately NOT here — it carries a per-request
 * nonce and so is set in proxy.ts, which runs per request. Everything below
 * is request-independent.
 */
const securityHeaders = [
  // This app is never meant to be framed; clickjacking a site that approves
  // material requests and edits contract values is a real risk.
  { key: "X-Frame-Options", value: "DENY" },
  // Never let a browser second-guess a declared Content-Type (an uploaded
  // file sniffed as HTML would run in this origin).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Send the full URL only to ourselves; other origins get the origin alone,
  // so project and report ids stay out of third-party referer logs.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Nothing here uses these; deny by default rather than leave them open.
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
  },
  // Two years, subdomains included, preload-eligible. Only takes effect over
  // HTTPS, so it is inert in local development.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  images: {
    // The app renders plain <img> tags only — next/image is unused. Disabling
    // optimization removes the /_next/image endpoint (and with it the sharp/
    // SVG-processing attack surface flagged by npm audit) instead of leaving
    // an unused endpoint exposed.
    unoptimized: true,
  },
  // Identifying the exact framework version to every visitor only helps
  // someone matching a CVE to this deployment.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
