import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const axePath = path.resolve(
  require.resolve("jest-axe/package.json"),
  "../../axe-core/axe.min.js",
);

async function skipSetupIfPresent(page: Page) {
  const skipSetup = page.getByRole("button", { name: /skip setup/i });
  if (await skipSetup.isVisible().catch(() => false)) {
    await skipSetup.click();
  }
}

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
  await skipSetupIfPresent(page);
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
