#!/usr/bin/env node
/**
 * Post-deploy smoke check.
 *
 *   npm run smoke -- https://app.example.com
 *
 * Answers one question: is the thing that just deployed actually serving the
 * application, correctly configured, with its defences on? "The build
 * succeeded" does not answer it — a build succeeds happily with a missing
 * environment variable, a proxy that forgot to forward a header, or a stale
 * container still running last week's code.
 *
 * Deliberately dependency-free and run with plain node. It has to work in a
 * deploy pipeline where node_modules may not exist, and it must not become
 * one more thing that can break.
 *
 * Exits 0 if every check passes, 1 otherwise, so it can gate a deploy.
 * Checks that cannot be judged from outside are reported as skipped and do
 * not fail the run — a check that fails for an unknowable reason gets muted,
 * and a muted check is worse than no check.
 */

const results = [];
let target;

function record(status, name, detail = "") {
  results.push({ status, name, detail });
}

const pass = (name, detail) => record("pass", name, detail);
const fail = (name, detail) => record("fail", name, detail);
const skip = (name, detail) => record("skip", name, detail);

/**
 * fetch with a timeout, returning a plain object rather than a Response.
 *
 * The body is always read, even by checks that only look at headers. An
 * unread response body holds its socket open, and on Windows exiting with
 * those still live aborts the process with
 * `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING)` — after the
 * report has printed, so the output looks fine and the exit code is not.
 * Draining here is also why `process.exitCode` below is enough on its own.
 *
 * The timeout exists because a hung deploy should fail rather than hang.
 */
async function get(path, { redirect = "manual" } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(new URL(path, target), {
      redirect,
      signal: controller.signal,
      headers: { "user-agent": "binaworks-smoke/1.0" },
    });
    const body = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body,
      json: () => JSON.parse(body),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------- checks

async function checkHealth() {
  const res = await get("/api/health");
  if (res.status !== 200) {
    fail("health endpoint", `HTTP ${res.status} — the app is up enough to answer, but not healthy`);
    return;
  }
  const body = res.json();
  if (body.status !== "ok") {
    fail("health endpoint", `status "${body.status}"`);
    return;
  }
  // The health route only reports ok when a real query reached Postgres, so
  // this doubles as "the database credentials in production are right".
  if (body.db !== "ok") {
    fail("database reachable", `db "${body.db}" — check SUPABASE_SERVICE_ROLE_KEY and network egress`);
    return;
  }
  pass("health endpoint", `db ok, ${body.latencyMs}ms`);
}

async function checkSecurityHeaders() {
  const res = await get("/login", { redirect: "follow" });
  const required = {
    "x-frame-options": "DENY",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };

  for (const [header, expected] of Object.entries(required)) {
    const actual = res.headers.get(header);
    if (actual === expected) pass(`header ${header}`, expected);
    // A missing header here usually means a reverse proxy is stripping
    // them, not that the app stopped sending them — worth saying, because
    // it sends you to the right place.
    else fail(`header ${header}`, `expected "${expected}", got ${actual ?? "nothing"} (proxy stripping headers?)`);
  }

  if (res.headers.get("permissions-policy")) pass("header permissions-policy");
  else fail("header permissions-policy", "missing");

  const hsts = res.headers.get("strict-transport-security");
  if (target.protocol === "https:") {
    if (hsts) pass("header strict-transport-security", hsts);
    else fail("header strict-transport-security", "missing on an https origin");
  } else {
    skip("header strict-transport-security", "http origin — HSTS is inert, nothing to check");
  }

  // Next sets this unless poweredByHeader is off. It tells any visitor which
  // framework version to look up a CVE for.
  if (res.headers.get("x-powered-by")) fail("x-powered-by suppressed", res.headers.get("x-powered-by"));
  else pass("x-powered-by suppressed");
}

async function checkCsp() {
  const [a, b] = await Promise.all([get("/login", { redirect: "follow" }), get("/login", { redirect: "follow" })]);
  const csp = a.headers.get("content-security-policy");

  if (!csp) {
    fail("content-security-policy", "no CSP header — proxy.ts is not running");
    return;
  }

  for (const directive of ["'strict-dynamic'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'"]) {
    if (csp.includes(directive)) pass(`csp ${directive}`);
    else fail(`csp ${directive}`, "missing");
  }

  if (csp.includes("'unsafe-eval'")) {
    // Dev-only in this app. In production it means NODE_ENV is wrong, which
    // also means React is running its development build.
    fail("csp excludes 'unsafe-eval'", "present — is NODE_ENV set to production?");
  } else {
    pass("csp excludes 'unsafe-eval'");
  }

  // The nonce is the part that actually blunts XSS, and it is only worth
  // anything if it changes per request. A static nonce looks identical in a
  // header dump and defends nothing.
  const nonceOf = (h) => /'nonce-([^']+)'/.exec(h ?? "")?.[1];
  const first = nonceOf(csp);
  const second = nonceOf(b.headers.get("content-security-policy"));
  if (!first) fail("csp nonce", "no nonce in script-src");
  else if (first === second) fail("csp nonce is per-request", `same nonce twice (${first}) — it is not being regenerated`);
  else pass("csp nonce is per-request");
}

async function checkPublicPages() {
  for (const path of ["/login", "/terms", "/privacy"]) {
    const res = await get(path, { redirect: "manual" });
    if (res.status === 200) pass(`${path} is public`);
    else if (res.status >= 300 && res.status < 400) {
      // /privacy in particular has to reach someone with no account. A
      // redirect to sign-in makes it useless as a notice.
      fail(`${path} is public`, `redirects to ${res.headers.get("location")}`);
    } else fail(`${path} is public`, `HTTP ${res.status}`);
  }
}

async function checkAuthGate() {
  // The single most important thing to verify after a deploy: that the
  // proxy is running at all. If it is not, every page below is wide open.
  const res = await get("/dashboard", { redirect: "manual" });
  const location = res.headers.get("location") ?? "";

  if (res.status >= 300 && res.status < 400 && location.includes("/login")) {
    pass("signed-out visitor is sent to sign in");
  } else if (res.status === 200) {
    fail("signed-out visitor is sent to sign in", "/dashboard rendered without a session — the proxy is not running");
  } else {
    fail("signed-out visitor is sent to sign in", `HTTP ${res.status} to ${location || "nowhere"}`);
  }
}

async function checkNoLeakedInternals() {
  // A 404 and a 500 are the two responses most likely to carry a stack
  // trace, a file path or a framework version into the open.
  const paths = ["/api/does-not-exist", "/definitely-not-a-page"];
  const smells = [
    [/\/home\/[a-z]+\//i, "an absolute filesystem path"],
    [/\bat\s+(?:Object|Module|async)\b/, "a stack frame"],
    [/node_modules/, "a node_modules path"],
    [/SUPABASE_SERVICE_ROLE_KEY|service_role/i, "a service-role reference"],
  ];

  let leaked = false;
  for (const path of paths) {
    const { body } = await get(path, { redirect: "follow" });
    for (const [pattern, what] of smells) {
      if (pattern.test(body)) {
        fail("error pages leak nothing", `${path} exposes ${what}`);
        leaked = true;
      }
    }
  }
  if (!leaked) pass("error pages leak nothing");
}

async function checkProductionBuild() {
  // A dev server serves the same pages and passes most checks above, so
  // this looks for something only a production build does: hashed, static
  // assets served immutable. Getting this wrong means the deploy is slow
  // and the React development build is shipping to customers.
  const { body: html } = await get("/login", { redirect: "follow" });
  const asset = /\/_next\/static\/[^"']+\.(?:js|css)/.exec(html)?.[0];

  if (!asset) {
    skip("production build", "no hashed asset found in the HTML to test");
    return;
  }

  const assetRes = await get(asset, { redirect: "follow" });
  const cache = assetRes.headers.get("cache-control") ?? "";
  if (cache.includes("immutable")) pass("production build", "static assets are immutable");
  else fail("production build", `static asset cache-control is "${cache}" — is this a dev server?`);
}

// ------------------------------------------------------------------ main

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error("usage: npm run smoke -- https://app.example.com");
    process.exitCode = 2;
    return;
  }

  try {
    target = new URL(raw);
  } catch {
    console.error(`Not a URL: ${raw}`);
    process.exitCode = 2;
    return;
  }

  console.log(`\nSmoke check against ${target.origin}\n`);

  const checks = [
    ["health", checkHealth],
    ["security headers", checkSecurityHeaders],
    ["content-security-policy", checkCsp],
    ["public pages", checkPublicPages],
    ["auth gate", checkAuthGate],
    ["error pages", checkNoLeakedInternals],
    ["production build", checkProductionBuild],
  ];

  for (const [name, run] of checks) {
    try {
      await run();
    } catch (err) {
      // A thrown check is a failed check. Swallowing it would turn an
      // unreachable host into a green run.
      fail(name, err instanceof Error ? err.message : String(err));
    }
  }

  const width = Math.max(...results.map((r) => r.name.length));
  for (const { status, name, detail } of results) {
    const mark = status === "pass" ? "  ok  " : status === "fail" ? " FAIL " : " skip ";
    console.log(`${mark} ${name.padEnd(width)}  ${detail}`);
  }

  const failed = results.filter((r) => r.status === "fail");
  const skipped = results.filter((r) => r.status === "skip");
  console.log(
    `\n${results.length - failed.length - skipped.length} passed, ${failed.length} failed` +
      (skipped.length ? `, ${skipped.length} skipped` : "") +
      "\n",
  );

  // exitCode rather than exit(): every body has been drained, so letting
  // the loop end on its own is both clean and enough. process.exit() with
  // live handles is what aborted the run on Windows.
  process.exitCode = failed.length > 0 ? 1 : 0;
}

main();
