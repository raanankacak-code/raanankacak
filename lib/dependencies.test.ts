import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The dependency tree, held to the advisories it has already been through.
 *
 * `npm audit` needs the network and a current advisory database, so it cannot
 * be a unit test. What can be a unit test is the outcome: the lockfile pins
 * the versions that were installed, and a version that has gone backwards is
 * the thing worth failing on. A `npm install` that quietly re-resolves a
 * transitive dependency below a patched version is exactly how a fixed
 * advisory comes back.
 *
 * This is not a substitute for running `npm audit --omit=dev` — it only knows
 * about advisories someone has already dealt with. It is the ratchet.
 */
const lock = JSON.parse(readFileSync(join(process.cwd(), "package-lock.json"), "utf8")) as {
  packages: Record<string, { version?: string }>;
};
const pkg = JSON.parse(readFileSync(join(process.cwd(), "package.json"), "utf8")) as {
  overrides?: Record<string, string>;
};

/** -1, 0 or 1. Enough for "at least this version"; not a semver library. */
function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0) ? -1 : 1;
  }
  return 0;
}

/**
 * Every copy of a package in the tree, by lockfile path.
 *
 * npm hoists what it can and nests what conflicts, so a package can appear
 * both at node_modules/x and at node_modules/y/node_modules/x. Checking only
 * the hoisted one is how the vulnerable postcss hid: the top level was
 * already on 8.5.22 while next carried its own 8.4.31 underneath.
 */
function installedCopies(name: string): [string, string][] {
  return Object.entries(lock.packages)
    .filter(([path]) => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`))
    .map(([path, meta]): [string, string] => [path, meta.version ?? "0.0.0"]);
}

describe("dependency advisories that have already been fixed", () => {
  /** package -> first version without the advisory, and what it was. */
  const patched: [string, string, string][] = [
    [
      "postcss",
      "8.5.18",
      "GHSA-qx2v-qp2m-jg93 / GHSA-6g55-p6wh-862q / GHSA-r28c-9q8g-f849 — XSS via unescaped </style>, and arbitrary file read via an attacker-controlled sourceMappingURL",
    ],
    ["sharp", "0.35.0", "GHSA-f88m-g3jw-g9cj — inherited libvips CVEs (2026-33327, 33328, 35590, 35591)"],
  ];

  it.each(patched)("every copy of %s is at least %s", (name, minimum) => {
    const copies = installedCopies(name);
    expect(copies.length, `${name} is not installed at all — has it been dropped?`).toBeGreaterThan(0);

    const behind = copies.filter(([, version]) => compareVersions(version, minimum) < 0);
    expect(behind.map(([path, version]) => `${path}@${version}`)).toEqual([]);
  });

  it("keeps the overrides that produce those versions", () => {
    // Without these, npm resolves next's own declared ranges and both come
    // back. The versions above would then fail, but this says why in one line
    // rather than making the next person work it out from a lockfile diff.
    expect(Object.keys(pkg.overrides ?? {}).sort()).toEqual(["postcss", "sharp"]);
  });

  it("does not override brace-expansion, however tempting a clean audit looks", () => {
    // The nine remaining dev-only advisories all trace to brace-expansion
    // <=5.0.7, reached through eslint's minimatch. The only patched release is
    // 5.0.8, and forcing it gives `npm audit` 0 vulnerabilities and eslint
    // this:
    //
    //   TypeError: expand is not a function
    //     at Minimatch.braceExpand (node_modules/minimatch/minimatch.js:271)
    //
    // because brace-expansion 5 is no longer a callable CommonJS export and
    // minimatch@3 calls it as one. A broken linter is worse than a DoS in
    // glob expansion that only runs when someone lints. See README.
    expect(pkg.overrides).not.toHaveProperty("brace-expansion");
  });
});
