import { expect, type Page } from "@playwright/test";

/**
 * Shared harness for the specs ported out of `packages/engine/tests/e2e/` (WALK-3).
 *
 * Those 21 Playwright-via-Python journeys drove a committed SPA bundle that WALK-3 deleted, so
 * they could no longer pass at all. The behaviours they asserted were re-expressed here against
 * the shipping UI (apps/ui) driven by the same real `kimcad web --demo` engine that
 * scripts/start-engine-web.mjs boots for the root playwright.config.ts.
 *
 * Not a file-for-file translation: where the surface the Python test drove no longer exists in
 * apps/ui, the port was dropped rather than faked, and the drop is recorded in the spec that
 * would have carried it.
 */

/** The welcome screen's prompt box — the product's primary on-ramp. */
export const PROMPT_BOX =
  'textarea[placeholder="Describe what you want to build..."]';

export function collectPageErrors(page: Page) {
  const consoleErrors: string[] = [];
  const responseErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.message);
  });
  page.on("response", (response) => {
    const status = response.status();
    if (status >= 400 && /\/api\//.test(response.url())) {
      responseErrors.push(`${status} ${response.url()}`);
    }
  });

  return { consoleErrors, responseErrors };
}

/** Type a prompt on the landing and press Build. Does NOT wait for a design — for the journeys
 *  (gate_failed) that deliberately never reach the workspace. */
export async function submitPrompt(page: Page, prompt: string) {
  await page.goto("/");
  await page.locator(PROMPT_BOX).fill(prompt);
  await page.getByRole("button", { name: /^Build$/i }).click();
}

/** Type a prompt and wait for the engine's design to land in the workspace. */
export async function buildDemoPart(page: Page, prompt: string) {
  await submitPrompt(page, prompt);
  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("preview-3d-root")).toBeVisible({
    timeout: 60_000,
  });
}

/** The Python suite's `_choose_sliceable_profile`: pick a printer + material that can slice, and
 *  wait for the make-it-real control to become enabled. */
export async function chooseSliceableProfile(page: Page) {
  await page.getByLabel("Rail printer").selectOption("bambu_p2s");
  await page.getByLabel("Rail material").selectOption("pla");
  await expect(page.getByTestId("make-it-real-button")).toBeEnabled({
    timeout: 120_000,
  });
}

/** "Make it real" can raise a one-time first-real-print confirmation; clear it when it shows. */
export async function confirmFirstRealPrint(page: Page) {
  const firstReal = page.getByTestId("first-real-print-dialog");
  if (await firstReal.isVisible().catch(() => false)) {
    await firstReal.getByTestId("first-real-print-confirm").click();
  }
}

/** Bring a dockview panel to the front by its tab title. */
export async function openWorkspaceTab(page: Page, title: string) {
  const tab = page.locator(".dv-tab", { hasText: new RegExp(`^${title}$`) });
  await expect(tab).toHaveCount(1);
  await tab.click();
}

/** The sonner toast region. */
export function notifications(page: Page) {
  return page.getByLabel("Notifications alt+T");
}
