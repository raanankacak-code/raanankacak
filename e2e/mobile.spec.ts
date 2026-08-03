import { test, expect, type Page } from "@playwright/test";
import { AUTH_STATE_PATH } from "./seed";

/**
 * The phone.
 *
 * This app is used standing in a site office on a 5-inch screen, and until
 * this suite existed nothing was ever looked at below 1280px. That is how the
 * bottom navigation shipped completely unstyled for twenty-one milestones:
 * every rule in globals.css targeted `.mobile-nav button` and AppShell has
 * always rendered links. A hundred and twenty-nine tests passed over the top
 * of it, because they all asked "is this present" at desktop width.
 *
 * So these tests ask the questions a screenshot answers: is it laid out, can
 * a thumb hit it, and is the column that decides what you do next actually
 * on the screen.
 */

const PHONE = { width: 390, height: 844 }; // iPhone 12/13/14 CSS pixels
const LIST_PAGES = [
  "/projects",
  "/reports",
  "/safety",
  "/defects",
  "/equipment",
  "/materials",
  "/team",
  "/attendance",
  "/audit-log",
];

/** Pages that are not lists but still have to survive a 390px screen. */
const OTHER_PAGES = ["/dashboard", "/calendar"];

/**
 * The pages carrying the app's longest button labels ("Delete this company
 * permanently"). Buttons no longer wrap their text, so these are where that
 * would first show up as a screen you have to scroll sideways.
 */
const WIDE_LABEL_PAGES = ["/settings", "/profile"];

test.use({ storageState: AUTH_STATE_PATH, viewport: PHONE });

/**
 * One row on every list page.
 *
 * An empty page proves nothing about a layout, and a test that skips itself
 * when the workspace happens to be empty is how a regression hides. Cleaned
 * up afterwards so the specs that run after this one see the workspace they
 * expect: deleting the project takes its reports, requests, inspections and
 * defects with it, and releases the machine, which is deleted by hand.
 */
let projectId: string;
let equipmentId: string;

test.beforeAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: AUTH_STATE_PATH });
  const api = page.request;

  const project = await (
    await api.post("/api/projects", {
      data: {
        name: `Phone Layout Site ${Date.now()}`,
        client: "JKR Sarawak",
        contractValue: 4200000,
        siteAddress: "Jalan Batu Kawa, Kuching",
      },
    })
  ).json();
  projectId = project.project.id;

  const equipment = await (
    await api.post("/api/equipment", {
      data: {
        name: "Excavator 20T",
        type: "Excavator",
        registrationNo: "QAB 1234",
        owned: true,
        projectId,
        // In the past on purpose: "service overdue" is the warning this
        // layout exists to keep on the screen.
        nextServiceDate: "2020-01-01",
        inspectionExpiry: "2020-06-30",
      },
    })
  ).json();
  equipmentId = equipment.equipment.id;

  await api.post("/api/defects", {
    data: {
      projectId,
      title: "Cracked slab at grid B4",
      severity: "HIGH",
      location: "Block A, Level 2",
      dueDate: "2020-01-01",
    },
  });
  await api.post("/api/reports", {
    data: { projectId, date: "2026-07-30", weather: "Fine", workCompleted: "Rebar fixing to pile cap 4" },
  });
  await api.post("/api/materials", {
    data: { projectId, material: "OPC cement", qty: 40, unit: "bags", neededBy: "2026-08-05", status: "SUBMITTED" },
  });
  // Attendance has one row per worker, so without this its table does not
  // exist and the card test would pass by finding nothing.
  await api.post(`/api/projects/${projectId}/workers`, {
    data: { name: "Azlan bin Osman", trade: "Concretor", dailyRate: 120, cidbNumber: "CIDB-0091" },
  });
  await api.post("/api/safety", {
    data: {
      projectId,
      date: "2026-07-30",
      items: [{ category: "Access", item: "Scaffold handrails in place", result: "FAIL", note: "North elevation" }],
    },
  });

  await page.close();
});

test.afterAll(async ({ browser }) => {
  const page = await browser.newPage({ storageState: AUTH_STATE_PATH });
  if (equipmentId) await page.request.delete(`/api/equipment/${equipmentId}`);
  if (projectId) await page.request.delete(`/api/projects/${projectId}`);
  await page.close();
});

/** Every element whose hit area is smaller than the WCAG 2.2 minimum. */
async function undersizedTargets(page: Page, min: number) {
  return page.evaluate((minPx) => {
    const selector = "a, button, [role='button'], input[type='checkbox']";
    const bad: string[] = [];
    document.querySelectorAll(selector).forEach((el) => {
      const box = el.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) return; // not rendered
      if (getComputedStyle(el).visibility === "hidden") return;
      if (box.height >= minPx && box.width >= minPx) return;
      const name = el.getAttribute("aria-label") || el.textContent?.trim().slice(0, 24) || "";
      bad.push(
        `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).join(".")}` : ""}` +
          ` [${name}] ${Math.round(box.width)}×${Math.round(box.height)}`,
      );
    });
    return bad;
  }, min);
}

test.describe("the bottom navigation", () => {
  test("is styled — the rules apply to what AppShell actually renders", async ({ page }) => {
    await page.goto("/dashboard");
    const nav = page.locator(".mobile-nav");
    await expect(nav).toBeVisible();

    const first = nav.locator("a").first();
    const styles = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return { display: s.display, direction: s.flexDirection, transform: s.textTransform, decoration: s.textDecorationLine };
    });

    // If the selector ever drifts away from the rendered element again, the
    // link falls back to the document defaults — inline, no column, and the
    // global `a` underline/colour. Each of these is what "unstyled" looked
    // like on a phone for twenty-one milestones.
    expect(styles.display, "the nav item is not being laid out as a stack").toBe("flex");
    expect(styles.direction).toBe("column");
    expect(styles.transform).toBe("uppercase");
    expect(styles.decoration).toBe("none");
  });

  test("marks where you are", async ({ page }) => {
    await page.goto("/projects");
    const active = page.locator(".mobile-nav a.active");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveAttribute("href", "/projects");

    // The amber bar over the active item is a ::before, so this is the only
    // way to see it from a test.
    const bar = await active.evaluate((el) => getComputedStyle(el, "::before").content);
    expect(bar, "the active indicator never rendered").not.toBe("none");
  });

  test("every item is a thumb-sized target", async ({ page }) => {
    await page.goto("/dashboard");
    const links = page.locator(".mobile-nav a");
    const count = await links.count();
    expect(count).toBeGreaterThan(4);

    for (let i = 0; i < count; i++) {
      const box = (await links.nth(i).boundingBox())!;
      expect(box.height, `nav item ${i} is ${box.height}px tall`).toBeGreaterThanOrEqual(44);
      expect(box.width, `nav item ${i} is ${box.width}px wide`).toBeGreaterThanOrEqual(44);
    }
  });

  test("it navigates, which an unstyled overlap can silently prevent", async ({ page }) => {
    await page.goto("/dashboard");
    // Playwright refuses to click an element another element covers, so this
    // also proves the items are not sitting on top of each other.
    await page.locator(".mobile-nav a[href='/equipment']").click();
    await expect(page).toHaveURL(/\/equipment$/);
  });
});

test.describe("list pages on a phone", () => {
  for (const path of [...OTHER_PAGES, ...WIDE_LABEL_PAGES, ...LIST_PAGES]) {
    test(`${path} does not scroll sideways`, async ({ page }) => {
      await page.goto(path);
      await page.locator("h2, h3").first().waitFor();

      const overflow = await page.evaluate(() => ({
        body: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        widest: [...document.querySelectorAll<HTMLElement>("main *")]
          .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
          .slice(0, 3)
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`),
      }));

      expect(overflow.body, `overflowing: ${overflow.widest.join(", ")}`).toBeLessThanOrEqual(0);
    });

    if (!LIST_PAGES.includes(path)) continue; // no table to turn into cards
    test(`${path} shows its rows as cards, not as a table to scroll`, async ({ page }) => {
      await page.goto(path);
      await page.locator("h2, h3").first().waitFor();

      // beforeAll put a row on every one of these pages, so an absent table
      // is a failure and not a reason to skip.
      const table = page.locator("table.cards").first();
      await expect(table, "no card table on this page — did the row not save?").toBeVisible();

      // The header row is what a table needs to be readable and what a card
      // does not have; if it is still on screen the card layout is not on.
      await expect(table.locator("thead").first()).toBeHidden();

      const row = table.locator("tbody tr").first();
      await expect(row).toBeVisible();

      // The point of the whole exercise: no cell sits off the right edge, so
      // nothing has to be scrolled to sideways to be read.
      const cut = await row.evaluate(
        (tr) =>
          [...tr.querySelectorAll("td")]
            .filter((td) => td.getBoundingClientRect().right > window.innerWidth + 1)
            .map((td) => td.getAttribute("data-label") ?? td.textContent?.trim().slice(0, 20) ?? "?"),
      );
      expect(cut, "cells past the right edge of the screen").toEqual([]);

      // And every cell says what it is, since the column heading is no
      // longer above it. The exceptions are the two that are self-evident:
      // the card's title and its row of buttons.
      const cells = await row.evaluate((tr) => {
        const tds = [...tr.querySelectorAll("td")];
        return {
          labelled: tds.filter((td) => td.hasAttribute("data-label")).length,
          unlabelled: tds
            .filter(
              (td) =>
                !td.hasAttribute("data-label") &&
                !td.classList.contains("card-t") &&
                !td.classList.contains("card-a") &&
                (td.textContent ?? "").trim() !== "",
            )
            .map((td) => td.textContent?.trim().slice(0, 24) ?? "?"),
        };
      });
      expect(cells.unlabelled, "cells with a value and no label — unreadable without the header row").toEqual([]);
      expect(cells.labelled, "no cell carries its own label, so the card is unreadable").toBeGreaterThan(1);
    });
  }
});

test.describe("the project tab strip", () => {
  /**
   * The same bug as the bottom navigation, in a second place.
   *
   * globals.css styles `.tabbar button`; the project page has always rendered
   * links. So the padding, the uppercase, the active underline, the nowrap
   * and the 46px touch target applied to nothing at all, and the strip came
   * out as a run-on line of words — "Overview Workers Documents Client Daily
   * Reports Attendance Material Requests Safety" — that wrapped mid-label on
   * a phone. It took a screenshot to see it, which is exactly what this file
   * exists to stop.
   *
   * Every assertion below is a property of the rules rather than of the
   * viewport, so this also covers the desktop symptom: zero padding is what
   * made the tabs run together at 1440px too.
   */
  test("is styled — the rules apply to what the project page actually renders", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    const strip = page.locator(".tabbar");
    await expect(strip).toBeVisible();

    const first = strip.locator("a").first();
    const styles = await first.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        transform: s.textTransform,
        wrap: s.whiteSpace,
        padLeft: parseFloat(s.paddingLeft),
        padRight: parseFloat(s.paddingRight),
        decoration: s.textDecorationLine,
      };
    });

    // Without the rules the link falls back to document defaults: no padding,
    // sentence case, and free to break wherever the line runs out.
    expect(styles.transform, "the tab is not being rendered as a tab").toBe("uppercase");
    expect(styles.wrap, "a tab label is free to break across lines").toBe("nowrap");
    expect(styles.padLeft, "no padding, so the tabs run into each other").toBeGreaterThanOrEqual(10);
    expect(styles.padRight).toBeGreaterThanOrEqual(10);
    expect(styles.decoration).toBe("none");
  });

  test("marks which tab you are on", async ({ page }) => {
    await page.goto(`/projects/${projectId}?tab=workers`);
    const active = page.locator(".tabbar a.on");
    await expect(active).toHaveCount(1);
    await expect(active).toHaveText(/workers/i);

    // The amber underline is the only thing telling you where you are. A
    // colour alone proves nothing: an unstyled link has no border at all, and
    // its border-bottom-color still computes to the text colour.
    const border = await active.evaluate((el) => {
      const s = getComputedStyle(el);
      return { width: parseFloat(s.borderBottomWidth), color: s.borderBottomColor };
    });
    expect(border.width, "the active tab has no underline").toBeGreaterThanOrEqual(2);
    expect(border.color).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("no label breaks across two lines", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    // Geometry is only meaningful once the strip has been laid out. Without
    // this the measurement can race the paint and read every tab as 0px —
    // which this test would then pass, every tab being equally nothing.
    await expect(page.locator(".tabbar a").first()).toBeVisible();

    // The flex row itself never wraps — what wrapped was the text inside a
    // tab. "Daily Reports" was squeezed until it came out as "Daily" with
    // "Reports" hanging underneath, which made that one tab twice as tall as
    // its neighbours and the whole strip two lines deep. So: every tab the
    // same height, and the strip no deeper than one of them.
    const strip = await page.locator(".tabbar").evaluate((el) => ({
      height: el.getBoundingClientRect().height,
      tabs: [...el.querySelectorAll("a")].map((a) => ({
        label: a.textContent?.trim() ?? "",
        height: Math.round(a.getBoundingClientRect().height),
      })),
    }));

    const tallest = Math.max(...strip.tabs.map((t) => t.height));
    const uneven = strip.tabs.filter((t) => t.height < tallest).map((t) => `${t.label} ${t.height}px`);

    expect(strip.tabs.length).toBeGreaterThan(4);
    expect(tallest, "the strip has no height — nothing was measured").toBeGreaterThan(0);
    expect(uneven, `tabs of differing heights (tallest ${tallest}px) — a label has wrapped`).toEqual([]);
    // +2 for the strip's own bottom border.
    expect(strip.height, "the strip is deeper than a single row of tabs").toBeLessThanOrEqual(tallest + 2);
  });

  test("every tab is a thumb-sized target", async ({ page }) => {
    await page.goto(`/projects/${projectId}`);
    // Same reason as above: without waiting for layout this reads 0px for
    // every tab and reports the fix as broken when it is not.
    await expect(page.locator(".tabbar a").first()).toBeVisible();

    // Measured in the page rather than through boundingBox(): the strip
    // scrolls sideways, and a tab past the right edge has no box to report.
    const short = await page.locator(".tabbar").evaluate((strip) =>
      [...strip.querySelectorAll("a")]
        .map((a) => ({ label: a.textContent?.trim() ?? "", height: a.getBoundingClientRect().height }))
        .filter((t) => t.height < 44)
        .map((t) => `${t.label} is ${Math.round(t.height)}px tall`),
    );

    expect(short, "tabs too small for a thumb").toEqual([]);
  });
});

test.describe("tap targets", () => {
  // WCAG 2.2 AA (2.5.8) asks for 24×24 CSS pixels. This holds the app to it
  // on the pages a site supervisor actually uses standing up.
  const MIN = 24;

  for (const path of [...OTHER_PAGES, ...LIST_PAGES]) {
    test(`${path} has nothing smaller than ${MIN}px`, async ({ page }) => {
      await page.goto(path);
      await page.locator("h2, h3").first().waitFor();

      const bad = await undersizedTargets(page, MIN);
      expect(bad, `targets under ${MIN}px:\n  ${bad.join("\n  ")}`).toEqual([]);
    });
  }
});
