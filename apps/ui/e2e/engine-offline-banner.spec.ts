import { expect, test, type Page } from "@playwright/test";

/**
 * UIUX-1 (Critical, GauntletGate 2026-07-19) - the §9 engine-offline banner is mounted above
 * <App/> at `position: fixed; top: 0; z-50` with no layout offset, so while it is shown it lies
 * on top of the workspace header: the live gate measured the banner at 0-28px, the header at
 * 0-45px, and the Settings button at 8-36px, with only the bottom ~29% of every toolbar control
 * still able to receive a click. No test covered it because the banner only appears when the
 * engine is unreachable, and the e2e engine is always up.
 *
 * Here the engine stays genuinely up (so a design can be built and the header exists at all) and
 * only `/api/health` is failed at the network boundary, which is exactly the condition the banner
 * watches. Then the toolbar is measured and exercised for real.
 */

async function buildDemoDesign(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible();
  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill("a 70 mm round drink coaster, 4 mm tall");
  await page.getByRole("button", { name: /^Build$/i }).click();
  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });
}

/** Fail /api/health only - everything else still talks to the real demo engine. */
async function takeHealthOffline(page: Page) {
  await page.route("**/api/health", async (route) => {
    await route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "engine offline (test)" }),
    });
  });
}

/**
 * What a real click at this control's visual centre would actually hit.
 *
 * The header scrolls horizontally, so a control can legitimately sit outside the viewport at this
 * width; scroll it into view first, otherwise elementFromPoint answers null for a reason that has
 * nothing to do with the banner.
 */
async function probeCentre(page: Page, testId: string) {
  const control = page.getByTestId(testId);
  await control.scrollIntoViewIfNeeded();
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return { found: false, hitsTarget: false, hit: "no such element" };
    const rect = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      rect.left + rect.width / 2,
      rect.top + rect.height / 2,
    );
    const describe = (node: Element | null) =>
      node
        ? `${node.tagName.toLowerCase()}[${node.getAttribute("data-testid") ?? node.className}]`
        : "nothing (outside the viewport)";
    return {
      found: true,
      hitsTarget: Boolean(
        hit && (hit === el || el.contains(hit) || hit.contains(el)),
      ),
      hit: describe(hit),
    };
  }, testId);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("the engine-offline banner makes room for itself instead of covering the header", async ({
  page,
}) => {
  await buildDemoDesign(page);
  await takeHealthOffline(page);

  // Two consecutive failed checks flip the banner on; the poll interval is 10 s.
  await expect(page.getByTestId("engine-offline-banner")).toBeVisible({
    timeout: 60_000,
  });

  // The measurement the punch list made by hand: the header must start at or below the banner's
  // bottom edge. Before the fix these both started at y=0 and the banner won on z-index.
  const geometry = await page.evaluate(() => {
    const banner = document
      .querySelector('[data-testid="engine-offline-banner"]')!
      .getBoundingClientRect();
    const header = document.querySelector("header")!.getBoundingClientRect();
    return {
      bannerTop: banner.top,
      bannerBottom: banner.bottom,
      headerTop: header.top,
      headerBottom: header.bottom,
    };
  });
  expect(geometry.bannerBottom).toBeGreaterThan(0);
  expect(
    geometry.headerTop,
    `header starts at ${geometry.headerTop}px, under a banner that ends at ${geometry.bannerBottom}px`,
  ).toBeGreaterThanOrEqual(geometry.bannerBottom - 1);

  // ...and the consequence, control by control: a click at the centre reaches the control.
  for (const testId of [
    "settings-button",
    "export-button",
    "save-design-button",
  ]) {
    const probe = await probeCentre(page, testId);
    expect(probe.found, `${testId} should exist in the toolbar`).toBe(true);
    expect(
      probe.hitsTarget,
      `${testId}: a click at its centre lands on ${probe.hit}, not the control`,
    ).toBe(true);
  }

  // Finally the real thing. Playwright refuses to click through an intercepting overlay, so this
  // fails outright if the banner is still in the way. Settings is the control the punch list
  // called out: the one place a confused user goes when the app says the engine is down.
  await page.getByTestId("settings-button").click();
  await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
  await page.keyboard.press("Escape");
});

test("the offline banner is readable and does not push the page sideways or down", async ({
  page,
}) => {
  await buildDemoDesign(page);
  await takeHealthOffline(page);

  const banner = page.getByTestId("engine-offline-banner");
  await expect(banner).toBeVisible({ timeout: 60_000 });
  await expect(banner).toContainText(/local manufacturing engine/i);

  // Guards the fix rather than the defect: making room must not be done by letting the app
  // overflow the viewport (the naive "render it in flow above an h-screen app" version does).
  const overflow = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - window.innerWidth,
    vertical: document.documentElement.scrollHeight - window.innerHeight,
  }));
  expect(overflow.horizontal).toBeLessThanOrEqual(2);
  expect(overflow.vertical).toBeLessThanOrEqual(2);
});
