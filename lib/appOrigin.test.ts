import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appOrigin } from "@/lib/appOrigin";

function requestFrom(url: string) {
  return new Request(url);
}

describe("appOrigin", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses the configured URL rather than the request host", () => {
    // The whole point: the request host is attacker-influenced behind a proxy
    // that does not pin Host, and this value ends up in an invite email link.
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.binaworks.my");

    expect(appOrigin(requestFrom("https://evil.example/api/team/invites"))).toBe("https://app.binaworks.my");
  });

  it("reduces a configured URL with a path to just its origin", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://app.binaworks.my/some/path?x=1");

    expect(appOrigin(requestFrom("https://whatever.example/x"))).toBe("https://app.binaworks.my");
  });

  it("falls back to the request origin when nothing is configured", () => {
    expect(appOrigin(requestFrom("http://localhost:3000/api/team/invites"))).toBe("http://localhost:3000");
  });

  it("falls back rather than crashing when the configured value is not a URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "not a url");

    expect(appOrigin(requestFrom("http://localhost:3000/x"))).toBe("http://localhost:3000");
  });
});
