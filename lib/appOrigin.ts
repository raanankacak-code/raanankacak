import { logger } from "@/lib/logger";

/**
 * The origin to build outbound links from — invite links, Stripe return URLs.
 *
 * These were built from `new URL(request.url).origin`, which in Next derives
 * from the Host header. Behind a proxy that does not pin Host, an attacker
 * can set it to a domain they control: the invite email is then genuinely
 * from us, genuinely signed, genuinely expected by the recipient — and the
 * "Accept invitation" button points at their site. The same header decides
 * where Stripe sends a customer back to after paying.
 *
 * So the origin comes from configuration when configured, and only falls back
 * to the request when it is not. The fallback keeps local development and
 * preview deployments working without ceremony; the warning is there so a
 * production deploy that forgot to set it says so in the logs rather than
 * looking fine.
 */
export function appOrigin(request: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      logger.error("NEXT_PUBLIC_APP_URL is set but is not a valid URL — falling back to the request host", {
        configured,
      });
    }
  }
  const origin = new URL(request.url).origin;
  logger.warn("NEXT_PUBLIC_APP_URL not set — building links from the request host, which a proxy can spoof", {
    origin,
  });
  return origin;
}
