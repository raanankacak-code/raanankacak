import { test, expect } from "@playwright/test";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/**
 * The smoke check, checked.
 *
 * scripts/smoke.mjs is the thing you run after a deploy to find out whether
 * the deploy worked. It is therefore exactly the kind of script that quietly
 * stops working — nobody notices a green run that is green because a check
 * silently stopped being performed.
 *
 * Playwright's webServer is a real production build on a real port, which is
 * precisely what the script expects, so running it here costs one process
 * and covers every check it makes.
 */
test.describe("post-deploy smoke check", () => {
  const baseURL = () => test.info().project.use.baseURL!;

  test("passes against a correctly deployed production build", async () => {
    const { stdout } = await run("node", ["scripts/smoke.mjs", baseURL()], { cwd: process.cwd() });

    // Non-zero exit makes execFile throw, so reaching here is the pass. The
    // assertions below guard the subtler failure: a run that exits 0 because
    // the checks stopped running at all.
    expect(stdout).toMatch(/health endpoint/);
    expect(stdout).toMatch(/csp nonce is per-request/);
    expect(stdout).toMatch(/signed-out visitor is sent to sign in/);
    expect(stdout).toMatch(/error pages leak nothing/);
    expect(stdout).not.toMatch(/FAIL/);

    // At least fifteen actual checks, not two and a summary.
    const passed = Number(/(\d+) passed/.exec(stdout)?.[1] ?? 0);
    expect(passed, `only ${passed} checks ran:\n${stdout}`).toBeGreaterThanOrEqual(15);
  });

  test("fails, loudly and with a non-zero exit, when there is nothing there", async () => {
    // A smoke check that cannot fail is decoration. This is the test that
    // stops it becoming that.
    const failure = await run("node", ["scripts/smoke.mjs", "http://127.0.0.1:9"], { cwd: process.cwd() }).catch(
      (err) => err as { code: number; stdout: string },
    );

    expect(failure).toHaveProperty("code", 1);
    expect((failure as { stdout: string }).stdout).toMatch(/FAIL/);
  });

  test("refuses an argument that is not a URL rather than guessing", async () => {
    const failure = await run("node", ["scripts/smoke.mjs", "not-a-url"], { cwd: process.cwd() }).catch(
      (err) => err as { code: number },
    );

    // 2, not 1: "you called this wrong" and "the deploy is broken" are
    // different answers, and a pipeline should be able to tell them apart.
    expect(failure).toHaveProperty("code", 2);
  });
});
