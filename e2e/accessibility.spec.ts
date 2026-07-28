import { test, expect, type Page } from "@playwright/test";
import { AUTH_STATE_PATH } from "./seed";

test.use({ storageState: AUTH_STATE_PATH });

/** What the browser currently has focused, as something readable in a failure. */
async function focusDescription(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return "none";
    const label = el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30) ?? "";
    return `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${label ? `[${label}]` : ""}`;
  });
}

test.describe("keyboard and screen-reader affordances", () => {
  test("a dialog takes focus, keeps it, and gives it back", async ({ page }) => {
    await page.goto("/team");
    const opener = page.getByRole("button", { name: /invite user/i }).first();
    await opener.waitFor();
    await opener.focus();
    await opener.press("Enter");

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Focus moves into the dialog rather than staying on the page behind it.
    await expect
      .poll(async () => dialog.evaluate((d) => d.contains(document.activeElement)))
      .toBe(true);

    // Tab all the way round. Without a trap, focus escapes to the page
    // underneath — where nothing is clickable, because the overlay covers it.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Tab");
      const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
      expect(inside, `focus left the dialog after ${i + 1} tabs: ${await focusDescription(page)}`).toBe(true);
    }

    // Shift+Tab from the first control wraps to the last, not out.
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press("Shift+Tab");
      const inside = await dialog.evaluate((d) => d.contains(document.activeElement));
      expect(inside, `focus left the dialog backwards after ${i + 1} tabs`).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    // And focus comes back to the button that opened it, rather than being
    // dumped at the top of the document.
    await expect.poll(async () => opener.evaluate((b) => b === document.activeElement)).toBe(true);
  });

  test("every form control on Settings has an accessible name", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("heading", { name: /settings/i }).first().waitFor();

    const unnamed = await page.evaluate(() => {
      const bad: string[] = [];
      document.querySelectorAll("input, select, textarea").forEach((el) => {
        const c = el as HTMLInputElement;
        if (c.type === "hidden") return;
        const labelled =
          (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`)) ||
          c.closest("label") ||
          c.getAttribute("aria-label") ||
          c.getAttribute("aria-labelledby");
        if (!labelled) bad.push(`${c.tagName.toLowerCase()}${c.name ? `[name=${c.name}]` : ""}`);
      });
      return bad;
    });

    expect(unnamed, "controls with no label, aria-label or wrapping <label>").toEqual([]);
  });

  test("ids generated for label association are unique on the page", async ({ page }) => {
    // Static ids are fine for single-instance forms and wrong the moment a
    // field is rendered inside a list. This is what would catch that.
    await page.goto("/settings");
    await page.getByRole("heading", { name: /settings/i }).first().waitFor();

    const duplicates = await page.evaluate(() => {
      const seen = new Map<string, number>();
      document.querySelectorAll("[id]").forEach((el) => seen.set(el.id, (seen.get(el.id) ?? 0) + 1));
      return [...seen.entries()].filter(([, n]) => n > 1).map(([id]) => id);
    });

    expect(duplicates).toEqual([]);
  });

  test("a <label> never points at a control that does not exist", async ({ page }) => {
    // The failure mode of the conversion this suite accompanies: a caption
    // left as a <label> promises a control to a screen reader and delivers
    // nothing.
    for (const path of ["/settings", "/team", "/reports/new"]) {
      await page.goto(path);
      const dangling = await page.evaluate(() =>
        [...document.querySelectorAll("label[for]")]
          .map((l) => (l as HTMLLabelElement).htmlFor)
          .filter((id) => !document.getElementById(id)),
      );
      expect(dangling, `dangling label[for] on ${path}`).toEqual([]);
    }
  });

  test("sortable columns announce that they sort, and which way", async ({ page }) => {
    await page.goto("/team");
    const header = page.locator("th[aria-sort]").first();
    await header.waitFor();

    // Unsorted must be "none", not a missing attribute — otherwise it is
    // indistinguishable from a column that cannot be sorted at all.
    await expect(header).toHaveAttribute("aria-sort", "none");

    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");

    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "descending");
  });

  test("the skip link is reachable and lands on the main region", async ({ page }) => {
    await page.goto("/dashboard");
    await page.keyboard.press("Tab");

    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(page.locator("#main")).toBeVisible();
  });
});
