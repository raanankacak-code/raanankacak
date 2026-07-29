/**
 * Sending errors somewhere a person will see them.
 *
 * Structured logs on stdout are the right primitive but the wrong alarm: they
 * are only read by someone who already suspects a problem. This turns
 * logger.error into something that reaches you at 2am.
 *
 * ## Why not @sentry/nextjs
 *
 * The official SDK wraps next.config with a webpack plugin, injects a client
 * bundle, and talks to ingest.sentry.io from the browser — which would mean
 * widening a CSP that is deliberately narrow (`connect-src 'self'` plus
 * Supabase, with a per-request nonce and strict-dynamic). Client errors here
 * are POSTed to this app's own endpoint instead, so the CSP is untouched and
 * the DSN never reaches a browser.
 *
 * What this gives up, stated plainly: no breadcrumbs, no performance tracing,
 * no session replay, and no automatic source-map symbolication. What it keeps
 * is the part that matters — an exception, its stack, where it happened, and
 * Sentry's grouping and alerting on top.
 *
 * If you later want the full SDK, `setErrorReporter` in lib/logger.ts is the
 * seam: swap the implementation there and nothing else changes.
 */

export interface ParsedDsn {
  /** Where an envelope is POSTed. */
  envelopeUrl: string;
  /** Identifies the project; travels in the auth header, not the URL. */
  publicKey: string;
  projectId: string;
}

/**
 * A Sentry DSN looks like https://<publicKey>@<host>/<projectId>.
 *
 * Returns null for anything that is not one. A malformed DSN must not throw
 * at boot — a typo in an environment variable should not stop the app
 * serving traffic — but it must not be silently treated as "no DSN" either,
 * so lib/config.ts checks this separately and refuses to start rather than
 * leaving you believing you have alerting when you do not.
 */
export function parseDsn(dsn: string): ParsedDsn | null {
  let url: URL;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const publicKey = url.username;
  const projectId = url.pathname.replace(/^\//, "");
  if (!publicKey || !projectId || !/^\d+$/.test(projectId)) return null;

  return {
    envelopeUrl: `${url.protocol}//${url.host}/api/${projectId}/envelope/`,
    publicKey,
    projectId,
  };
}

interface StackFrame {
  filename: string;
  function: string;
  lineno?: number;
  colno?: number;
}

/**
 * Turns a V8 stack string into frames Sentry can display.
 *
 * Reversed, because Sentry renders the most recent call last while V8 puts
 * it first — an unreversed stack reads upside down and points at the wrong
 * line as the culprit.
 */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];

  const frames: StackFrame[] = [];
  for (const line of stack.split("\n")) {
    // "    at fnName (/path/file.js:12:34)" or "    at /path/file.js:12:34"
    const match = /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$/.exec(line);
    if (!match) continue;
    frames.push({
      function: match[1] ?? "<anonymous>",
      filename: match[2],
      lineno: Number(match[3]),
      colno: Number(match[4]),
    });
  }
  return frames.reverse();
}

export interface SentryEvent {
  event_id: string;
  timestamp: number;
  platform: string;
  level: string;
  release?: string;
  environment?: string;
  exception: { values: { type: string; value: string; stacktrace?: { frames: StackFrame[] } }[] };
  tags?: Record<string, string>;
  extra?: Record<string, unknown>;
}

/** Keys whose values must never leave this process. */
const SECRET_KEY = /(key|token|secret|password|authorization|cookie|dsn)/i;

/**
 * Context is arbitrary and assembled at call sites, so it is filtered here
 * rather than trusted. An error report is the last place you want a service
 * role key to turn up, because it travels to a third party and is then
 * retained by them.
 */
export function redact(context: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : value;
  }
  return out;
}

export function buildEvent(
  err: unknown,
  context: Record<string, unknown> | undefined,
  options: { release?: string; environment?: string; platform?: string },
): SentryEvent {
  const error = err instanceof Error ? err : new Error(String(err));

  return {
    // Sentry wants 32 hex characters with no dashes.
    event_id: crypto.randomUUID().replace(/-/g, ""),
    timestamp: Date.now() / 1000,
    platform: options.platform ?? "node",
    level: "error",
    ...(options.release ? { release: options.release } : {}),
    ...(options.environment ? { environment: options.environment } : {}),
    exception: {
      values: [
        {
          type: error.name || "Error",
          value: error.message || String(err),
          stacktrace: { frames: parseStack(error.stack) },
        },
      ],
    },
    extra: redact(context),
  };
}

/** An envelope is newline-delimited JSON: header, item header, item. */
export function buildEnvelope(event: SentryEvent, dsn: string): string {
  return [
    JSON.stringify({ event_id: event.event_id, sent_at: new Date().toISOString(), dsn }),
    JSON.stringify({ type: "event" }),
    JSON.stringify(event),
  ].join("\n");
}

export interface ReporterOptions {
  dsn: string;
  release?: string;
  environment?: string;
  /** Injectable so tests can exercise the whole path without a network. */
  transport?: (url: string, body: string, headers: Record<string, string>) => Promise<void>;
  /** Injectable so the "too many errors" path can be tested without waiting. */
  now?: () => number;
}

/** Ceiling on events per minute. */
const MAX_PER_MINUTE = 30;

/**
 * Builds the function that lib/logger.ts calls for every reported error.
 *
 * Three properties matter more than features here:
 *
 *  - It never throws. A failure to report an error must not become a second
 *    error, and must never turn a handled 500 into an unhandled one.
 *  - It never blocks. Reporting is fire-and-forget with a timeout, because a
 *    slow ingest endpoint must not add latency to a user's request.
 *  - It has a ceiling. A hot loop throwing on every request would otherwise
 *    generate thousands of events, exhaust a quota, and bury the one error
 *    that mattered. Past the ceiling it drops events and says so once.
 */
export function createSentryReporter(options: ReporterOptions) {
  const parsed = parseDsn(options.dsn);
  if (!parsed) return null;

  const send =
    options.transport ??
    (async (url: string, body: string, headers: Record<string, string>) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 5_000);
      try {
        await fetch(url, { method: "POST", body, headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
    });

  const now = options.now ?? (() => Date.now());
  let windowStartedAt = now();
  let sentInWindow = 0;
  let announcedThrottle = false;

  return function report(err: unknown, context?: Record<string, unknown>): void {
    const t = now();
    if (t - windowStartedAt >= 60_000) {
      windowStartedAt = t;
      sentInWindow = 0;
      announcedThrottle = false;
    }
    if (sentInWindow >= MAX_PER_MINUTE) {
      if (!announcedThrottle) {
        announcedThrottle = true;
        // console, not logger.error — reporting that we are dropping reports
        // through the thing that reports would recurse.
        console.warn(
          JSON.stringify({
            ts: new Date().toISOString(),
            level: "warn",
            message: `Error reporting throttled at ${MAX_PER_MINUTE}/min — further events this minute are dropped`,
          }),
        );
      }
      return;
    }
    sentInWindow += 1;

    const platform = typeof context?.platform === "string" ? context.platform : "node";
    const event = buildEvent(err, context, {
      release: options.release,
      environment: options.environment,
      platform,
    });

    void send(parsed.envelopeUrl, buildEnvelope(event, options.dsn), {
      "content-type": "application/x-sentry-envelope",
      // The key travels in this header rather than the URL, so it stays out
      // of proxy access logs.
      "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=binaworks/1.0`,
    }).catch((sendError) => {
      // Swallowed on purpose, and noted on stdout so a permanently broken
      // ingest endpoint is still discoverable from the logs.
      console.warn(
        JSON.stringify({
          ts: new Date().toISOString(),
          level: "warn",
          message: "Failed to deliver error report",
          detail: sendError instanceof Error ? sendError.message : String(sendError),
        }),
      );
    });
  };
}
