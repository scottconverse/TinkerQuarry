import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const axePath = path.resolve(
  require.resolve("jest-axe/package.json"),
  "../../axe-core/axe.min.js",
);

async function scanA11y(page: Page, label: string) {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    document
      .querySelectorAll('[data-radix-popper-content-wrapper=""]')
      .forEach((node) => {
        (node as HTMLElement).setAttribute("aria-hidden", "true");
      });
    const axe = (
      window as unknown as {
        axe: { run: () => Promise<{ violations: unknown[] }> };
      }
    ).axe;
    const result = await axe.run();
    return result.violations;
  });
  expect(violations, `${label} accessibility violations`).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("release surfaces pass browser accessibility scans and keyboard traversal", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible();
  await scanA11y(page, "welcome");

  await page.keyboard.press("Tab");
  await expect(page.locator(":focus")).toBeVisible();

  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill("a keyboard-accessible cable clip");
  await page.getByRole("button", { name: /^Build$/i }).click();
  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("explain-agent-loop")).toContainText(/Plan:/i);
  await scanA11y(page, "workspace");

  await page.getByTestId("settings-button").click();
  await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
  await page.mouse.move(5, 5);
  await scanA11y(page, "settings");
  await page.keyboard.press("Escape");

  await page.getByTestId("export-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("export-dialog")).toBeVisible();
  await scanA11y(page, "export dialog");
  await page.keyboard.press("Escape");

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(2);
});

/**
 * UIUX-2 (Critical, GauntletGate 2026-07-19) — no modal in the app trapped keyboard focus, so Tab
 * cycled straight out of the dialog into the page hidden behind the backdrop (the live gate landed
 * on a background <textarea> after 25 Tab presses while Settings was still open). The scan above
 * cannot see it: axe-core reads the static DOM, and the test above presses Tab exactly once, at
 * page load, never inside an open dialog.
 */
async function expectFocusTrapped(
  page: Page,
  dialog: ReturnType<Page["getByTestId"]>,
  label: string,
  presses = 30,
) {
  for (let i = 1; i <= presses; i += 1) {
    await page.keyboard.press("Tab");
    const inside = await dialog.evaluate((node) =>
      node.contains(document.activeElement),
    );
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return el ? `${el.tagName.toLowerCase()}#${el.id}.${el.className}` : "none";
    });
    expect(inside, `${label}: focus escaped to ${focused} after ${i} Tab presses`).toBe(
      true,
    );
  }
  // ...and the same going backwards.
  for (let i = 1; i <= 5; i += 1) {
    await page.keyboard.press("Shift+Tab");
    const inside = await dialog.evaluate((node) =>
      node.contains(document.activeElement),
    );
    expect(inside, `${label}: focus escaped backwards after ${i} Shift+Tab`).toBe(true);
  }
}

test("open dialogs keep keyboard focus inside them", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("welcome-screen")).toBeVisible();

  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill("a 60 mm coaster, 4 mm tall");
  await page.getByRole("button", { name: /^Build$/i }).click();
  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });

  await page.getByTestId("settings-button").click();
  const settings = page.getByRole("dialog", { name: /settings/i });
  await expect(settings).toBeVisible();
  await expectFocusTrapped(page, settings, "Settings");
  await page.keyboard.press("Escape");
  await expect(settings).toBeHidden();

  await page.getByTestId("export-button").click();
  const exportDialog = page.getByTestId("export-dialog");
  await expect(exportDialog).toBeVisible();
  await expectFocusTrapped(page, exportDialog, "Export");
  await page.keyboard.press("Escape");
  await expect(exportDialog).toBeHidden();
});
