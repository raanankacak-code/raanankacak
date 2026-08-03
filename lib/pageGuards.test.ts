import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Permission } from "./permissions";

/**
 * The form pages, against the permission each one needs.
 *
 * Every create button in the app is gated. The pages behind them were not:
 * five of them checked that you were signed in and went no further, so a
 * Viewer who reached the URL — from the dashboard, which showed them a
 * button it should not have, or from a bookmark — was handed the whole form
 * and only told no when they pressed Save. The API refused them throughout,
 * so nothing was ever written; what was missing was saying so first.
 *
 * A page cannot be permission-checked from the client, so this also insists
 * they stay server components. `"use client"` at the top of a form page is
 * how two of the five came to have no guard at all.
 */
const root = process.cwd();
const APP = join(root, "app", "(app)");

/** Route segments that mean "a form that writes something". */
const FORM_SEGMENTS = ["new", "edit"];

const REQUIRED: Record<string, Permission> = {
  "projects/new/page.tsx": "manageProjects",
  "projects/[id]/edit/page.tsx": "manageProjects",
  "projects/[id]/workers/new/page.tsx": "manageWorkers",
  "projects/[id]/workers/[workerId]/edit/page.tsx": "manageWorkers",
  "reports/new/page.tsx": "submitReports",
};

/** Every page.tsx under a `new/` or `edit/` segment, as a posix-ish path. */
function formPages(dir = APP): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...formPages(path));
    } else if (entry.name === "page.tsx" && FORM_SEGMENTS.includes(relative(APP, dir).split("/").pop() ?? "")) {
      found.push(relative(APP, path).split("\\").join("/"));
    }
  }
  return found.sort();
}

describe("form pages", () => {
  it("is the list this test knows about — a new one has to be added here", () => {
    // Otherwise the table below silently stops covering the app: a form page
    // added next month would be unguarded and no test would say so.
    expect(formPages()).toEqual(Object.keys(REQUIRED).sort());
  });

  it.each(Object.entries(REQUIRED))("%s checks %s before rendering the form", (page, permission) => {
    const source = readFileSync(join(APP, page), "utf8");

    expect(source.startsWith('"use client"'), `${page} is a client component and cannot check a permission`).toBe(
      false,
    );
    expect(source, `${page} never calls can()`).toContain("can(member.role,");
    expect(source, `${page} does not check ${permission}`).toContain(`"${permission}"`);
    // A check that does not send them anywhere is not a check.
    expect(source, `${page} checks the permission but does nothing about it`).toContain("redirect(");
  });
});
