type LogLevel = "info" | "warn" | "error";

/**
 * Structured JSON logger for server code. One JSON object per line on
 * stdout/stderr, so any log collector (Docker, journald, CloudWatch,
 * Grafana Loki, etc.) can parse fields without regexes. Deliberately
 * dependency-free; if a hosted error tracker (e.g. Sentry) is adopted
 * later, wire it in here so every call site benefits at once.
 */
function write(level: LogLevel, message: string, context?: Record<string, unknown>) {
  const entry = {
    ts: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  info: (message: string, context?: Record<string, unknown>) => write("info", message, context),
  warn: (message: string, context?: Record<string, unknown>) => write("warn", message, context),
  error: (message: string, context?: Record<string, unknown>) => write("error", message, context),
};

/** Serializes an unknown thrown value into loggable fields. */
export function errorFields(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const code = "code" in err ? String((err as { code?: unknown }).code) : undefined;
    return {
      errorName: err.name,
      errorMessage: err.message,
      ...(code ? { errorCode: code } : {}),
      stack: err.stack,
    };
  }
  return { errorMessage: String(err) };
}

/**
 * True when the request ended because the caller went away — navigated
 * mid-fetch, closed the tab, lost signal — rather than because anything
 * failed server-side.
 *
 * These surface as Node's "aborted" (socket closed with a request in
 * flight), ECONNRESET, or an AbortError from a cancelled fetch. They are
 * routine on a mobile-heavy app used on construction sites, and treating
 * them as errors makes the error stream useless: they would be the loudest
 * signal in it while meaning nothing is wrong. Log them as info instead, and
 * never report them to an error tracker.
 */
export function isClientDisconnect(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String((err as { name?: unknown }).name) : "";
  const message = "message" in err ? String((err as { message?: unknown }).message) : "";
  const code = "code" in err ? String((err as { code?: unknown }).code) : "";

  if (name === "AbortError") return true;
  if (code === "ECONNRESET" || code === "ECONNABORTED" || code === "ABORT_ERR") return true;
  return message === "aborted" || message === "The operation was aborted.";
}

type ErrorReporter = (err: unknown, context?: Record<string, unknown>) => void;

/**
 * The reporter lives on globalThis, not in a module variable, and that is
 * not a stylistic choice.
 *
 * Next bundles instrumentation.ts into its own server chunk, separate from
 * the chunks holding route handlers and pages. Each chunk gets its own copy
 * of this module, so `let reporter` assigned by register() is invisible to
 * every route: the boot log says "Error reporting enabled", each route
 * faithfully calls reportError, and nothing is ever sent. It fails in the
 * production build only — in dev the module graph is shared — and it fails
 * silently, which is the worst possible combination for the one mechanism
 * whose whole job is telling you something is wrong.
 *
 * Found by pointing a fake ingest server at a real production build and
 * getting no request while the log insisted reporting was on.
 */
const REPORTER_KEY = Symbol.for("binaworks.errorReporter");

type ReporterHolder = { [REPORTER_KEY]?: ErrorReporter | null };

/**
 * The single seam for a hosted error tracker. Call it once at startup (see
 * instrumentation.ts) and every reportError call site reports through it —
 * no per-call-site wiring, and nothing to remove if the vendor changes.
 */
export function setErrorReporter(next: ErrorReporter | null): void {
  (globalThis as ReporterHolder)[REPORTER_KEY] = next;
}

/** The reporter set at boot, if any. Exported for tests. */
export function getErrorReporter(): ErrorReporter | null {
  return (globalThis as ReporterHolder)[REPORTER_KEY] ?? null;
}

/**
 * Logs an unexpected failure and hands it to the error tracker, unless it is
 * just a caller hanging up — see isClientDisconnect.
 */
export function reportError(message: string, err: unknown, context?: Record<string, unknown>): void {
  if (isClientDisconnect(err)) {
    logger.info("Request aborted by client", { ...context, reason: "client-disconnect" });
    return;
  }
  logger.error(message, { ...context, ...errorFields(err) });
  getErrorReporter()?.(err, context);
}
