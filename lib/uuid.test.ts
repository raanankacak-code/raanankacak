import { describe, expect, it } from "vitest";
import { isUuid } from "@/lib/uuid";

describe("isUuid", () => {
  it("accepts the ids Postgres actually generates", () => {
    expect(isUuid("1c02b009-609e-46b3-98ff-145ce6d73d7e")).toBe(true);
    // Uppercase is the same value.
    expect(isUuid("1C02B009-609E-46B3-98FF-145CE6D73D7E")).toBe(true);
  });

  it("rejects what arrives from a hand-edited URL", () => {
    // Each of these previously reached Postgres and threw, turning a missing
    // page into "Something went wrong".
    for (const bad of ["not-a-uuid", "", "123", "1c02b009-609e-46b3-98ff", "../../etc/passwd"]) {
      expect(isUuid(bad), bad).toBe(false);
    }
  });

  it("rejects a well-shaped string that is not a uuid", () => {
    // Right length and dashes, wrong alphabet.
    expect(isUuid("zzzzzzzz-zzzz-4zzz-8zzz-zzzzzzzzzzzz")).toBe(false);
  });

  it("rejects the all-zero uuid, which has no valid version", () => {
    // Not a real generated id — worth failing fast rather than querying for it.
    expect(isUuid("00000000-0000-0000-0000-000000000000")).toBe(false);
  });
});
