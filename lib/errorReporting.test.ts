import { describe, expect, it, vi } from "vitest";
import {
  buildEnvelope,
  buildEvent,
  createSentryReporter,
  parseDsn,
  parseStack,
  redact,
} from "@/lib/errorReporting";

const DSN = "https://abc123def456@o12345.ingest.sentry.io/6789";

describe("parseDsn", () => {
  it("pulls the key, project and ingest URL out of a real DSN", () => {
    expect(parseDsn(DSN)).toEqual({
      envelopeUrl: "https://o12345.ingest.sentry.io/api/6789/envelope/",
      publicKey: "abc123def456",
      projectId: "6789",
    });
  });

  it.each([
    ["not a url at all", "sentry-please"],
    ["no public key", "https://o12345.ingest.sentry.io/6789"],
    ["no project id", "https://abc123@o12345.ingest.sentry.io/"],
    ["a non-numeric project id", "https://abc123@o12345.ingest.sentry.io/not-a-number"],
    ["the wrong protocol", "ftp://abc123@o12345.ingest.sentry.io/6789"],
    ["empty", ""],
  ])("returns null for %s", (_label, dsn) => {
    // Null rather than a throw: a typo in an environment variable must not
    // stop the app serving traffic. lib/config.ts turns this into a refusal
    // to boot separately, so it is never silently mistaken for "no DSN".
    expect(parseDsn(dsn)).toBeNull();
  });
});

describe("parseStack", () => {
  it("reads function, file, line and column out of a V8 stack", () => {
    const frames = parseStack(
      ["Error: boom", "    at doThing (/app/lib/thing.js:12:34)", "    at /app/lib/other.js:5:6"].join("\n"),
    );

    // Reversed: Sentry renders the most recent call last, V8 puts it first.
    // Unreversed, the report blames the wrong line.
    expect(frames).toEqual([
      { function: "<anonymous>", filename: "/app/lib/other.js", lineno: 5, colno: 6 },
      { function: "doThing", filename: "/app/lib/thing.js", lineno: 12, colno: 34 },
    ]);
  });

  it("skips lines that are not frames instead of inventing them", () => {
    expect(parseStack("Error: boom\n  some prose\n")).toEqual([]);
  });

  it("survives a missing stack", () => {
    expect(parseStack(undefined)).toEqual([]);
  });
});

describe("redact", () => {
  it("removes anything that looks like a credential", () => {
    // An error report travels to a third party and is retained by them. It
    // is the last place a service-role key should surface.
    expect(
      redact({
        path: "/api/projects",
        SUPABASE_SERVICE_ROLE_KEY: "super-secret",
        authorization: "Bearer x",
        sessionToken: "t",
        userPassword: "hunter2",
        cookie: "sb-access=1",
      }),
    ).toEqual({
      path: "/api/projects",
      SUPABASE_SERVICE_ROLE_KEY: "[redacted]",
      authorization: "[redacted]",
      sessionToken: "[redacted]",
      userPassword: "[redacted]",
      cookie: "[redacted]",
    });
  });

  it("leaves ordinary context alone", () => {
    expect(redact({ path: "/x", method: "GET", status: 500 })).toEqual({ path: "/x", method: "GET", status: 500 });
  });
});

describe("buildEvent", () => {
  it("produces an event id Sentry accepts", () => {
    const event = buildEvent(new Error("boom"), undefined, {});
    // 32 hex characters, no dashes.
    expect(event.event_id).toMatch(/^[0-9a-f]{32}$/);
  });

  it("carries the exception type, message and stack", () => {
    const event = buildEvent(new TypeError("bad argument"), { path: "/x" }, { release: "v1", environment: "production" });

    expect(event.exception.values[0]).toMatchObject({ type: "TypeError", value: "bad argument" });
    expect(event.exception.values[0].stacktrace!.frames.length).toBeGreaterThan(0);
    expect(event).toMatchObject({ release: "v1", environment: "production", level: "error" });
    expect(event.extra).toEqual({ path: "/x" });
  });

  it("wraps a thrown non-Error rather than dropping it", () => {
    // `throw "something went wrong"` is legal and does happen.
    const event = buildEvent("just a string", undefined, {});
    expect(event.exception.values[0].value).toBe("just a string");
  });

  it("uses seconds, not milliseconds, for the timestamp", () => {
    // Milliseconds here puts the event roughly fifty thousand years in the
    // future, and it silently never appears in the UI.
    const event = buildEvent(new Error("x"), undefined, {});
    expect(Math.abs(event.timestamp - Date.now() / 1000)).toBeLessThan(5);
  });
});

describe("buildEnvelope", () => {
  it("is three lines of newline-delimited JSON", () => {
    const event = buildEvent(new Error("boom"), undefined, {});
    const lines = buildEnvelope(event, DSN).split("\n");

    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0])).toMatchObject({ event_id: event.event_id, dsn: DSN });
    expect(JSON.parse(lines[1])).toEqual({ type: "event" });
    expect(JSON.parse(lines[2]).exception.values[0].value).toBe("boom");
  });
});

describe("createSentryReporter", () => {
  it("returns null for an unusable DSN, so nothing is wired up", () => {
    expect(createSentryReporter({ dsn: "nonsense" })).toBeNull();
  });

  it("posts an envelope with the key in the auth header, not the URL", async () => {
    const transport = vi.fn(async () => {});
    const report = createSentryReporter({ dsn: DSN, transport, release: "v9" })!;

    report(new Error("boom"), { path: "/api/x" });
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));

    const [url, body, headers] = transport.mock.calls[0] as unknown as [string, string, Record<string, string>];
    expect(url).toBe("https://o12345.ingest.sentry.io/api/6789/envelope/");
    // In the URL it would end up in every proxy access log along the way.
    expect(url).not.toContain("abc123def456");
    expect(headers["x-sentry-auth"]).toContain("sentry_key=abc123def456");
    expect(headers["content-type"]).toBe("application/x-sentry-envelope");
    expect(JSON.parse(body.split("\n")[2])).toMatchObject({ release: "v9" });
  });

  it("never throws when the transport fails", async () => {
    const transport = vi.fn(async () => {
      throw new Error("ingest is down");
    });
    const report = createSentryReporter({ dsn: DSN, transport })!;

    // A failure to report an error must not become a second error, and must
    // never turn a handled 500 into an unhandled one.
    expect(() => report(new Error("boom"))).not.toThrow();
    await vi.waitFor(() => expect(transport).toHaveBeenCalled());
  });

  it("returns immediately rather than waiting for the network", () => {
    let resolveSend: () => void = () => {};
    const transport = vi.fn(() => new Promise<void>((r) => (resolveSend = r)));
    const report = createSentryReporter({ dsn: DSN, transport })!;

    // If this awaited, every 500 would carry the ingest endpoint's latency.
    expect(report(new Error("boom"))).toBeUndefined();
    resolveSend();
  });

  it("stops after 30 events in a minute, so one hot loop cannot bury everything else", async () => {
    const transport = vi.fn(async () => {});
    const clock = 0;
    const report = createSentryReporter({ dsn: DSN, transport, now: () => clock })!;

    for (let i = 0; i < 50; i++) report(new Error(`boom ${i}`));
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(30));

    // A quota exhausted by a loop is a quota unavailable for the error that
    // actually mattered.
    expect(transport).toHaveBeenCalledTimes(30);
  });

  it("starts reporting again in the next minute", async () => {
    const transport = vi.fn(async () => {});
    let clock = 0;
    const report = createSentryReporter({ dsn: DSN, transport, now: () => clock })!;

    for (let i = 0; i < 50; i++) report(new Error("boom"));
    clock += 60_001;
    report(new Error("a new minute"));

    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(31));
  });
});
