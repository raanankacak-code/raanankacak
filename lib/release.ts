/**
 * Which build is running.
 *
 * Attached to every error report, because the first useful question about a
 * spike in errors is "did it start with a deploy". Without it you are
 * comparing a graph against your memory of when you last shipped.
 *
 * The commit SHA is read from whichever variable the host sets — none of
 * these are set by us, and checking them in this order costs nothing. It
 * falls back to "unknown" rather than throwing: a missing release makes
 * reports less useful, not wrong, and is not a reason to refuse to serve.
 */
export function appRelease(): string {
  const sha =
    process.env.APP_RELEASE ??
    process.env.VERCEL_GIT_COMMIT_SHA ??
    process.env.RAILWAY_GIT_COMMIT_SHA ??
    process.env.RENDER_GIT_COMMIT ??
    process.env.GITHUB_SHA ??
    process.env.SOURCE_VERSION; // Heroku, Dokku

  // Short SHAs are what people actually paste into a chat, and Sentry treats
  // the release as an opaque string, so there is nothing to gain from 40.
  return sha ? sha.slice(0, 12) : "unknown";
}
