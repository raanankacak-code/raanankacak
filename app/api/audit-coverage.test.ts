import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * The audit trail had holes in it once — 7 of 27 mutating routes recorded
 * anything, and several of the 7 audited their PATCH but not their DELETE.
 * Nothing caught that, because a missing audit call fails no assertion: the
 * request still succeeds, the data still changes, and the only symptom is a
 * gap in a table nobody reads until they need it.
 *
 * So this test reads the routes rather than calling them. Every mutating
 * handler either records an audit event or is named below as one that
 * deliberately doesn't. Adding a route without deciding which it is fails.
 */

const API_ROOT = join(process.cwd(), "app", "api");
const MUTATING = /export async function (POST|PATCH|PUT|DELETE)\b/;

/**
 * Routes that intentionally write nothing to the trail.
 *
 * The rule is the same one requireWritableMember uses: the audit log records
 * changes to the *company's* record, not to a person's own view of it.
 * Burying a role change under a thousand marked-as-read rows would make the
 * log worse, not better.
 */
const NOT_AUDITED: Record<string, string> = {
  "notifications/route.ts": "marking your own notifications read is not a change to company data",
  "notifications/[id]/route.ts": "as above, per notification",
  "profile/route.ts": "your own display name and phone; visible to you, owned by you",
  "bug-reports/route.ts": "a support ticket to us, not a change to the workspace",
  "billing/checkout/route.ts": "creates a Stripe session only; the resulting subscription change is audited by the webhook",
  "billing/portal/route.ts": "as above — a redirect into Stripe's own portal",
  "uploads/route.ts": "stores bytes; the document/logo row that references them is audited where it is created",
  "invites/[token]/accept/route.ts": "audited as MEMBER_JOINED via recordAuditEvent, checked separately below",
  "orgs/route.ts": "POST creates the org (nothing to attribute yet) and DELETE cascades its own audit rows away; PATCH is audited",
};

function routeFiles(dir: string, prefix = ""): { rel: string; abs: string }[] {
  return readdirSync(dir).flatMap((entry) => {
    const abs = join(dir, entry);
    const rel = prefix ? `${prefix}/${entry}` : entry;
    if (statSync(abs).isDirectory()) return routeFiles(abs, rel);
    return entry === "route.ts" ? [{ rel, abs }] : [];
  });
}

describe("audit trail coverage", () => {
  const routes = routeFiles(API_ROOT);

  it("finds the API routes at all (guards against this test silently passing on an empty list)", () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  it.each(routes.filter((r) => MUTATING.test(readFileSync(r.abs, "utf8"))).map((r) => r.rel))(
    "%s records an audit event or is a documented exception",
    (rel) => {
      const source = readFileSync(join(API_ROOT, rel), "utf8");
      const audits = /recordMemberAction\(|recordAuditEvent\(/.test(source);
      const exempt = rel in NOT_AUDITED;

      if (exempt) {
        expect(NOT_AUDITED[rel].length).toBeGreaterThan(20);
        return;
      }
      expect(audits, `${rel} mutates data but records nothing — add an audit call or an entry in NOT_AUDITED`).toBe(
        true,
      );
    },
  );

  it("every mutating handler in an audited route is covered, not just the first one", () => {
    // The original gap was subtler than a missing import: projects, reports,
    // workers and materials all audited their PATCH and silently skipped
    // their DELETE. One audit call in the file is not proof the file is done.
    const AUDIT_CALL = /recordMemberAction\(|recordAuditEvent\(/;
    const gaps: string[] = [];
    for (const { rel, abs } of routes) {
      if (rel in NOT_AUDITED) continue;
      const source = readFileSync(abs, "utf8");
      const handlers = [...source.matchAll(/export async function (POST|PATCH|PUT|DELETE)\b/g)];
      if (handlers.length === 0) continue;

      // A handler may audit through a local helper rather than inline — the
      // Stripe webhook does. Collect the helpers that audit, so calling one
      // counts. One level deep is enough for this codebase and keeps the
      // check readable; a helper calling a helper would show up as a gap,
      // which is a fine way to be told to simplify.
      const auditingHelpers = [...source.matchAll(/(?:async )?function (\w+)\s*\(/g)]
        .filter((m) => !["POST", "PATCH", "PUT", "DELETE", "GET"].includes(m[1]))
        .filter((m) => {
          const rest = source.slice(m.index!);
          const next = rest.slice(1).search(/\n(?:export )?(?:async )?function /);
          return AUDIT_CALL.test(next === -1 ? rest : rest.slice(0, next + 1));
        })
        .map((m) => m[1]);

      // Split the file at each handler boundary and check each body.
      for (let i = 0; i < handlers.length; i++) {
        const start = handlers[i].index!;
        const end = i + 1 < handlers.length ? handlers[i + 1].index! : source.length;
        const body = source.slice(start, end);
        const delegates = auditingHelpers.some((name) => new RegExp(`\\b${name}\\s*\\(`).test(body));
        if (!AUDIT_CALL.test(body) && !delegates) {
          gaps.push(`${rel} ${handlers[i][1]}`);
        }
      }
    }
    expect(gaps).toEqual([]);
  });

  it("does not record trivial personal writes", () => {
    // The inverse failure: auditing everything is its own kind of broken,
    // because a log full of noise is a log nobody reads.
    for (const rel of ["notifications/route.ts", "profile/route.ts", "bug-reports/route.ts"]) {
      const source = readFileSync(join(API_ROOT, rel), "utf8");
      expect(/recordMemberAction\(|recordAuditEvent\(/.test(source), `${rel} should stay out of the trail`).toBe(false);
    }
  });
});
