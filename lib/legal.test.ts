import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { LEGAL_VERSION, OPERATOR, PLACEHOLDER, REVIEWED, unfilledOperatorFields } from "@/lib/legal";

const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("legal metadata", () => {
  it("versions the documents by date, so the stored acceptance is legible", () => {
    expect(LEGAL_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(LEGAL_VERSION))).toBe(false);
  });

  it("states the hosting region, because PDPA cares where the data sits", () => {
    // Read from the Supabase project itself rather than guessed: this one is
    // ap-southeast-1, which is Singapore, which is a cross-border transfer.
    // Leaving it as a placeholder would have been the easy wrong answer.
    expect(PLACEHOLDER.test(OPERATOR.hostingRegion)).toBe(false);
  });

  /**
   * The whole point of the REVIEWED flag.
   *
   * While it is false the pages show a draft notice and the placeholders are
   * allowed to stand. The moment someone flips it to true, this test starts
   * demanding that every one of them has been replaced — so the flag cannot
   * be true and the document half-written at the same time.
   */
  it("has no placeholders left once it is marked reviewed", () => {
    if (!REVIEWED) {
      expect(unfilledOperatorFields().length, "nothing to do while REVIEWED is false").toBeGreaterThan(0);
      return;
    }
    expect(unfilledOperatorFields()).toEqual([]);
  });
});

describe("the documents themselves", () => {
  const privacy = read("app", "privacy", "page.tsx");
  const terms = read("app", "terms", "page.tsx");

  it("names every category of personal data the schema actually holds", () => {
    // The failure mode of a privacy notice is being written from a template
    // and quietly omitting the sensitive column somebody added later. These
    // are the ones in supabase/schema.sql that identify a person.
    for (const term of ["IC", "CIDB", "attendance", "wages", "photo"]) {
      expect(privacy.toLowerCase(), `privacy notice does not mention ${term}`).toContain(term.toLowerCase());
    }
  });

  it("discloses that acceptance records outlive a deleted workspace", () => {
    // Retaining personal data past a deletion request without saying so is
    // the specific thing that turns a defensible decision into a breach.
    expect(privacy).toMatch(/kept after deletion/i);
  });

  it("quotes prices from the plan table rather than typing them in", () => {
    // A price typed into prose drifts away from the price charged. This is
    // the structural guarantee that it cannot.
    expect(terms).toContain("PLANS");
    expect(terms).not.toMatch(/RM\s?\d{3}/);
  });

  it("both documents are reachable without signing in", () => {
    const proxy = read("proxy.ts");
    // [\s\S] rather than the `s` flag: tsconfig targets ES2017 here.
    const publicPaths = /const PUBLIC_PATHS = \[([\s\S]*?)\]/.exec(proxy)?.[1] ?? "";
    expect(publicPaths).toContain('"/terms"');
    expect(publicPaths).toContain('"/privacy"');
  });
});
