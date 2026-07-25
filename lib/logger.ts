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

let reporter: ErrorReporter | null = null;

/**
 * The single seam for a hosted error tracker. Call this once at startup
 * (see instrumentation.ts) and every logger.error call site reports through
 * it — no per-call-site wiring, and nothing to remove if the vendor changes.
 *
 * Deliberately not wired to any SDK yet: none is configured, and an
 * unconfigured tracker is just dead weight in the bundle.
 */
export function setErrorReporter(next: ErrorReporter | null): void {
  reporter = next;
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
  reporter?.(err, context);
}
