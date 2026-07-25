import type { Metadata } from "next";
import { Barlow, Barlow_Condensed, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

/**
 * The CSP in proxy.ts carries a per-request nonce, and Next.js can only stamp
 * that onto script tags while server-rendering. A statically prerendered page
 * is built before any request exists, so its scripts get no nonce — and since
 * 'strict-dynamic' makes the browser ignore 'self', they would simply be
 * blocked, leaving those pages with no JavaScript at all.
 *
 * Only the five auth pages were still static; everything behind sign-in was
 * already dynamic, so this costs very little and keeps the script policy
 * strict rather than falling back to 'unsafe-inline'.
 */
export const dynamic = "force-dynamic";

const barlow = Barlow({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const barlowCondensed = Barlow_Condensed({
  variable: "--font-disp",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

export const metadata: Metadata = {
  title: "BinaWorks — Site Management",
  description: "Construction & contractor management for Sarawak site teams.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${barlow.variable} ${barlowCondensed.variable} ${plexMono.variable}`}
    >
      <body>
        <a
          className="skip-link"
          href="#main"
        >
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
