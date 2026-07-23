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
    return { errorName: err.name, errorMessage: err.message, stack: err.stack };
  }
  return { errorMessage: String(err) };
}
