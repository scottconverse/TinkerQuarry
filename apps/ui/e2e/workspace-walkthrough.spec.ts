import { expect, test, type Page } from "@playwright/test";

function collectPageErrors(page: Page) {
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

async function skipSetupIfPresent(page: Page) {
  const skipSetup = page.getByRole("button", { name: /skip setup/i });
  if (await skipSetup.isVisible().catch(() => false)) {
    await skipSetup.click();
  }
}

async function buildDemoDesign(page: Page) {
  await page.goto("/");
  await skipSetupIfPresent(page);
  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill("a 70 mm round drink coaster, 4 mm tall");
  await page.getByRole("button", { name: /^Build$/i }).click();
  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("preview-3d-root")).toBeVisible({
    timeout: 60_000,
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("workspace walkthrough covers settings, menus, viewer, orient, export, and rail controls", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoDesign(page);

  const menubar = page.getByRole("menubar", { name: /application menu/i });
  await expect(menubar).toBeVisible();
  await page.getByRole("menuitem", { name: "File" }).press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menuitem", { name: /New File/i })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();

  await page.getByTestId("settings-button").click();
  await expect(page.getByRole("dialog", { name: /settings/i })).toBeVisible();
  const settingsTabs = ["appearance", "viewer", "editor", "project", "privacy", "ai", "about"];
  for (const tab of settingsTabs) {
    await page.getByTestId(`settings-nav-${tab}`).click();
    await expect(page.getByTestId(`settings-nav-${tab}`)).toHaveAttribute(
      "aria-current",
      "page",
    );
  }
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: /settings/i })).toBeHidden();

  await page
    .getByRole("group", { name: /workspace layout/i })
    .getByRole("button", { name: /customize/i })
    .click();
  await expect(page.getByTestId("preview-3d-root")).toBeVisible();

  await page.getByTestId("preview-fit-view").click();
  await page.getByTestId("preview-toggle-orthographic").click();
  await page.getByTestId("preview-toggle-annotate").click();

  for (const control of [
    "orient-x-90",
    "orient-y-90",
    "orient-z-90",
    "orient-x--90",
    "orient-y--90",
    "orient-z--90",
  ]) {
    await expect(page.getByTestId(control)).toBeEnabled({ timeout: 30_000 });
    await page.getByTestId(control).click();
  }
  await expect(page.getByTestId("workflow-orient")).toContainText(/Manual|Auto|ready/i);

  await page.getByTestId("export-button").click();
  await expect(page.getByTestId("export-dialog")).toBeVisible();
  await expect(page.getByRole("dialog", { name: /export model/i })).toBeVisible();
  await page.getByTestId("export-format-select").click();
  await expect(page.getByTestId("format-option-scad")).toBeVisible();
  await expect(page.getByTestId("format-option-stl")).toBeVisible();
  await expect(page.getByTestId("format-option-3mf")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("export-dialog")).toBeHidden();

  await expect(page.getByTestId("make-it-real-panel")).toBeVisible();
  await expect(page.getByTestId("customize-section")).toContainText(/Customize/i);
  await expect(page.getByTestId("make-it-real-section")).toContainText(/Make it real/i);
  await page.getByLabel("Rail printer").selectOption("bambu_a1");
  await page.getByLabel("Rail material").selectOption("pla");
  await expect(page.getByTestId("rail-make-it-real-button")).toBeEnabled({
    timeout: 30_000,
  });
  await expect(page.getByTestId("iteration-log")).toBeVisible();

  expect(responseErrors).toEqual([]);
});

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("boots the first screen without horizontal overflow", async ({ page }) => {
    const { responseErrors } = collectPageErrors(page);

    await page.goto("/");
    await skipSetupIfPresent(page);
    await expect(page.getByTestId("welcome-screen")).toBeVisible();
    await expect(
      page.locator('textarea[placeholder="Describe what you want to build..."]'),
    ).toBeVisible();

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(2);

    expect(responseErrors).toEqual([]);
  });
});
