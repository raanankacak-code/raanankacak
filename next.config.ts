import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    // The app renders plain <img> tags only — next/image is unused. Disabling
    // optimization removes the /_next/image endpoint (and with it the sharp/
    // SVG-processing attack surface flagged by npm audit) instead of leaving
    // an unused endpoint exposed.
    unoptimized: true,
  },
};

export default nextConfig;
