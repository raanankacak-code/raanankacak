import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, errorFields, isClientDisconnect, reportError, setErrorReporter } from "@/lib/logger";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("logger", () => {
  it("writes one parseable JSON line with ts, level and message", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    logger.info("something happened", { orgId: "org-1" });

    expect(spy).toHaveBeenCalledTimes(1);
    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.message).toBe("something happened");
    expect(parsed.orgId).toBe("org-1");
    expect(new Date(parsed.ts).getTime()).not.toBeNaN();
  });

  it("routes error-level entries to console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.error("it broke");

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0][0] as string).level).toBe("error");
  });
});

describe("errorFields", () => {
  it("captures name, message and stack from an Error", () => {
    const fields = errorFields(new TypeError("bad input"));
    expect(fields.errorName).toBe("TypeError");
    expect(fields.errorMessage).toBe("bad input");
    expect(typeof fields.stack).toBe("string");
  });

  it("stringifies non-Error throwables", () => {
    expect(errorFields("plain string throw")).toEqual({ errorMessage: "plain string throw" });
  });
});

describe("isClientDisconnect", () => {
  it("recognises Node's socket-closed error", () => {
    // Exactly what shows up when a browser navigates away mid-request.
    expect(isClientDisconnect(new Error("aborted"))).toBe(true);
  });

  it("recognises ECONNRESET and friends by code", () => {
    for (const code of ["ECONNRESET", "ECONNABORTED", "ABORT_ERR"]) {
      const err = Object.assign(new Error("socket hang up"), { code });
      expect(isClientDisconnect(err)).toBe(true);
    }
  });

  it("recognises a cancelled fetch", () => {
    const err = new Error("The operation was aborted.");
    err.name = "AbortError";
    expect(isClientDisconnect(err)).toBe(true);
  });

  it("does not misclassify a genuine failure", () => {
    expect(isClientDisconnect(new Error("column does not exist"))).toBe(false);
    expect(isClientDisconnect(new TypeError("x is not a function"))).toBe(false);
    expect(isClientDisconnect(Object.assign(new Error("nope"), { code: "23505" }))).toBe(false);
  });

  it("tolerates non-error values", () => {
    expect(isClientDisconnect(null)).toBe(false);
    expect(isClientDisconnect(undefined)).toBe(false);
    expect(isClientDisconnect("aborted")).toBe(false);
  });
});

describe("reportError", () => {
  afterEach(() => setErrorReporter(null));

  it("logs a real failure at error level and forwards it to the tracker", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const captured: unknown[] = [];
    setErrorReporter((err) => captured.push(err));

    const boom = new Error("database is on fire");
    reportError("Unhandled API error", boom, { errorId: "abc" });

    const parsed = JSON.parse(spy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("error");
    expect(parsed.errorId).toBe("abc");
    expect(parsed.errorMessage).toBe("database is on fire");
    expect(captured).toEqual([boom]);
  });

  it("does not raise an alert when the caller merely hung up", () => {
    // The whole point: these are routine, and reporting them would bury
    // real failures under noise.
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const captured: unknown[] = [];
    setErrorReporter((err) => captured.push(err));

    reportError("Unhandled API error", new Error("aborted"), { errorId: "abc" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(captured).toEqual([]);
    const parsed = JSON.parse(infoSpy.mock.calls[0][0] as string);
    expect(parsed.level).toBe("info");
    expect(parsed.reason).toBe("client-disconnect");
  });

  it("still logs when no tracker is configured", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => reportError("Unhandled server error", new Error("boom"))).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("errorFields", () => {
  it("includes a system error code when present, for triage", () => {
    const err = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    expect(errorFields(err)).toMatchObject({ errorCode: "ECONNRESET" });
  });
});
