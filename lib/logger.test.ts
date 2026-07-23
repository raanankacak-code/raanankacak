import { afterEach, describe, expect, it, vi } from "vitest";
import { logger, errorFields } from "@/lib/logger";

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
