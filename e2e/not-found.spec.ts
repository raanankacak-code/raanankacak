import { test, expect } from "@playwright/test";
import { AUTH_STATE_PATH } from "./seed";

/**
 * Before this, a bad URL or a deleted record produced Next's default 404, and
 * a thrown server component produced the bare "Application error: a
 * server-side exception has occurred" page — no branding, no way back, and
 * nothing to quote to support.
 *
 * On the status codes: these pages answer 200, not 404, and an earlier
 * version of this comment blamed the wrong thing. It is not force-dynamic and
 * it is not loading.tsx — both were removed and rebuilt, and the status stayed
 * 200. Next streams any dynamic App Router response, and per its own docs
 * "once streaming begins, the HTTP response headers (including the status
 * code) have already been sent"; a real status would need notFound() to fire
 * before the first await, which a database lookup cannot do.
 *
 * What matters about a soft 404 is that a crawler indexes it, and Next
 * already handles that: it injects <meta name="robots" content="noindex">
 * when notFound() fires mid-stream. That is asserted below, because it is the
 * property actually worth having — everything here is behind sign-in anyway.
 */
test.describe("not found", () => {
  test("a signed-out visitor is sent to sign in, not told which URLs exist", async ({ page }) => {
    // The proxy redirects every non-public path before routing can 404, so an
    // anonymous caller cannot map the app by watching which paths come back
    // 404 and which come back 200.
    await page.goto("/no-such-page-anywhere");

    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Application error/i)).toHaveCount(0);
  });

  test.describe("signed in", () => {
    test.use({ storageState: AUTH_STATE_PATH });

    test("a project id that does not exist renders the in-app 404 with the shell intact", async ({ page }) => {
      await page.goto("/projects/00000000-0000-0000-0000-000000000000");

      await expect(page.getByText(/nothing here/i)).toBeVisible();
      await expect(page.getByText(/Application error/i)).toHaveCount(0);
      // The point of a boundary inside the shell rather than at the root:
      // navigation survives, so you are one click from everywhere else
      // instead of stranded on a bare page.
      await expect(page.getByRole("link", { name: /back to dashboard/i })).toBeVisible();
      await expect(page.locator("aside").first()).toBeVisible();
    });

    test("a missing report is handled too, so it is not just the projects route", async ({ page }) => {
      await page.goto("/reports/00000000-0000-0000-0000-000000000000");

      await expect(page.getByText(/nothing here/i)).toBeVisible();
      await expect(page.getByText(/Application error/i)).toHaveCount(0);
    });

    test("a malformed id is handled, not surfaced as a database error", async ({ page }) => {
      // Postgres rejects a non-uuid for a uuid column, so this reaches the
      // query layer rather than simply missing a row.
      await page.goto("/projects/not-a-uuid");

      const body = (await page.textContent("body")) ?? "";
      expect(body).not.toMatch(/invalid input syntax|PGRST\d+/i);
      await expect(page.getByText(/nothing here|something went wrong/i).first()).toBeVisible();
    });

    test("a soft 404 still tells crawlers not to index it", async ({ page }) => {
      const res = await page.goto("/projects/00000000-0000-0000-0000-000000000000");

      // 200 because the response streams (see the note at the top of this
      // file). If this ever becomes 404, that is an improvement — update the
      // note and this assertion rather than assuming the test is broken.
      expect(res?.status()).toBe(200);

      // The part that actually matters, injected by Next when notFound()
      // fires mid-stream.
      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
    });

    test("a malformed id reaches the 404, not the error boundary", async ({ page }) => {
      // Postgres rejects a non-uuid for a uuid column, so this used to throw
      // and render "Something went wrong" for what is simply a page that does
      // not exist. lib/uuid.ts turns it into a miss before the query runs.
      await page.goto("/projects/not-a-uuid");

      await expect(page.locator('meta[name="robots"][content*="noindex"]')).toHaveCount(1);
      await expect(page.getByText(/nothing here/i)).toBeVisible();
      await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    });
  });
});
