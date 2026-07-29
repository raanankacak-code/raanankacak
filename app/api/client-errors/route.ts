import { NextResponse } from "next/server";
import { z } from "zod";
import { reportError } from "@/lib/logger";
import { checkRateLimit, getClientIp } from "@/lib/rateLimit";

/**
 * Where a crash in the browser gets reported from.
 *
 * The alternative is having the browser talk to the error tracker directly,
 * which would mean widening `connect-src` beyond `'self'` and shipping the
 * DSN in a public bundle. Posting here instead keeps the CSP as narrow as it
 * is and keeps the ingest key on the server, where a key belongs.
 *
 * This endpoint is unauthenticated by necessity: the errors most worth
 * hearing about are the ones that break the page before anything has loaded,
 * including on /login. That makes it the one route in the app anyone on the
 * internet can write to, so everything below treats the body as hostile —
 * strict shape, hard length caps, and a rate limit per IP.
 */
const clientErrorSchema = z.object({
  // Caps, not because a longer message breaks anything here, but because an
  // unbounded field on an open endpoint is a way to fill someone's error
  // quota and their bill.
  message: z.string().min(1).max(500),
  stack: z.string().max(8_000).optional(),
  digest: z.string().max(200).optional(),
  // Where it happened. A full URL would carry query strings, which in this
  // app can contain an invite token.
  path: z.string().max(500).optional(),
});

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    const rateLimit = await checkRateLimit(`client-error:${ip}`, 20, 60_000);
    if (!rateLimit.allowed) {
      // 204 rather than 429. The browser cannot do anything useful with a
      // refusal, and an error reporter that reports its own failures is a
      // loop waiting to happen.
      return new NextResponse(null, { status: 204 });
    }

    const body = clientErrorSchema.parse(await request.json());

    // Reconstructed as an Error so it groups in the tracker alongside server
    // errors rather than arriving as a bare string.
    const error = new Error(body.message);
    error.name = "ClientError";
    if (body.stack) error.stack = body.stack;

    reportError("Unhandled client error", error, {
      platform: "javascript",
      path: body.path,
      ...(body.digest ? { digest: body.digest } : {}),
      userAgent: request.headers.get("user-agent")?.slice(0, 200),
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    // Never 500 here. A failure to accept a crash report must not itself
    // produce a crash report.
    return new NextResponse(null, { status: 204 });
  }
}
