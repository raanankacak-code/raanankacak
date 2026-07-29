import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /terms and /privacy are public on purpose and not merely as a convenience:
// the privacy notice has to be readable by someone with no account and no
// intention of getting one — a worker whose IC number sits in a customer's
// workspace. Redirecting them to a sign-in form would defeat the point.
const PUBLIC_PATHS = ["/login", "/signup", "/auth", "/forgot-password", "/reset-password", "/terms", "/privacy"];

/**
 * Per-request Content-Security-Policy.
 *
 * Scripts use a fresh nonce plus 'strict-dynamic', so an injected <script>
 * cannot execute even if it reaches the page — this is the directive that
 * actually blunts XSS. Next.js finds the nonce in this header and applies it
 * to its own framework and RSC-payload scripts automatically.
 *
 * Styles allow 'unsafe-inline' deliberately: the UI sets React `style`
 * props throughout, which render as inline style attributes that a
 * nonce cannot cover. Locking styles down would mean restyling the whole
 * app. The tradeoff is narrow (style injection, not code execution) and
 * scripts stay strict.
 *
 * connect-src includes the Supabase origin because the browser client talks
 * to it directly for auth.
 */
function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const supabaseOrigin = (() => {
    try {
      return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin;
    } catch {
      return "";
    }
  })();

  return [
    "default-src 'self'",
    // 'unsafe-eval' only in dev: React uses eval there to rebuild server
    // stack traces in the browser. Production needs no such thing.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    // blob:/data: cover locally previewed photos before upload.
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseOrigin.replace(/^https:/, "wss:")}` : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID();
  const csp = buildCsp(nonce);

  // Next.js reads the nonce off the *request* header to stamp its own script
  // tags, so it has to be set on both sides.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  let response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // Rebuilding the response here would drop the CSP header and the
          // x-nonce request header set above, leaving Next.js unable to stamp
          // its scripts — carry both across.
          response = NextResponse.next({ request: { headers: requestHeaders } });
          response.headers.set("Content-Security-Policy", csp);
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // A pending confirmation code or invite token means /login still has work
  // to do client-side (exchange the code, accept the invite) before it
  // redirects itself — don't short-circuit that here.
  const hasPendingAuthAction = request.nextUrl.searchParams.has("code") || request.nextUrl.searchParams.has("invite");

  if (user && (pathname === "/login" || pathname === "/signup") && !hasPendingAuthAction) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
