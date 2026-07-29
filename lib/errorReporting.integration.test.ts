import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { createSentryReporter } from "@/lib/errorReporting";
import { reportError, setErrorReporter } from "@/lib/logger";

/**
 * The whole path, over a real socket.
 *
 * The unit tests inject a fake transport, which proves the envelope is built
 * correctly but never proves it can be sent. This stands a real HTTP server
 * in for Sentry's ingest endpoint and reports through the actual seam that
 * production uses — lib/logger's reportError — so what is exercised is
 * default fetch, real headers, and a real body arriving at the other end.
 *
 * What it does NOT prove: that Sentry itself accepts the envelope. There is
 * no account or DSN here to test against, so the wire format is built to the
 * documented spec and verified for shape, not acceptance. Worth knowing
 * before trusting the first production incident to it.
 */
describe("error reporting, over a socket", () => {
  let server: Server;
  let port: number;
  const received: { url: string; headers: Record<string, string | string[] | undefined>; body: string }[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        received.push({ url: req.url ?? "", headers: req.headers, body });
        res.writeHead(200).end();
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as { port: number }).port;
  });

  afterAll(async () => {
    setErrorReporter(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("delivers a well-formed envelope to the ingest endpoint", async () => {
    const dsn = `http://testkey@127.0.0.1:${port}/42`;
    const reporter = createSentryReporter({ dsn, release: "abc123", environment: "production" });
    expect(reporter, "a valid DSN produced no reporter").not.toBeNull();
    setErrorReporter(reporter);

    // Through the seam every call site already uses, not the reporter
    // directly — so this covers the wiring as well as the payload.
    reportError("Unhandled server error", new Error("something broke"), { path: "/api/projects" });

    await expect.poll(() => received.length, { timeout: 5_000 }).toBe(1);

    const [request] = received;
    expect(request.url).toBe("/api/42/envelope/");
    expect(request.headers["content-type"]).toBe("application/x-sentry-envelope");
    expect(String(request.headers["x-sentry-auth"])).toContain("sentry_key=testkey");

    const [header, itemHeader, payload] = request.body.split("\n").map((line) => JSON.parse(line));
    expect(header.dsn).toBe(dsn);
    expect(itemHeader).toEqual({ type: "event" });
    expect(payload).toMatchObject({
      release: "abc123",
      environment: "production",
      level: "error",
      platform: "node",
    });
    expect(payload.exception.values[0]).toMatchObject({ type: "Error", value: "something broke" });
    expect(payload.exception.values[0].stacktrace.frames.length).toBeGreaterThan(0);
    expect(payload.extra).toMatchObject({ path: "/api/projects" });
  });

  it("does not report a client disconnect", async () => {
    // Someone closing a tab mid-request is routine on a site, and would
    // otherwise be the loudest thing in the error stream while meaning
    // nothing is wrong.
    const before = received.length;
    const aborted = new Error("aborted");
    aborted.name = "AbortError";

    reportError("Unhandled server error", aborted, { path: "/api/uploads" });

    // Give it the same window the successful delivery above needed, so this
    // is "did not send" rather than "had not sent yet".
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(received.length).toBe(before);
  });
});
