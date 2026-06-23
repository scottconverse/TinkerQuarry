import { expect, test } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("demo engine flow reaches ready-to-print and records mock printer outcome", async ({
  page,
}) => {
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
    if (status >= 400) {
      const url = response.url();
      if (/\/api\//.test(url) || url.startsWith(page.url())) {
        responseErrors.push(`${status} ${url}`);
      }
    }
  });

  await page.goto("/");

  const skipSetup = page.getByRole("button", { name: /skip setup/i });
  if (await skipSetup.isVisible().catch(() => false)) {
    await skipSetup.click();
  }

  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill("a small test gear");
  await page.getByRole("button", { name: /^Build$/i }).click();

  await expect(page.getByTestId("make-it-real-button")).toBeVisible({
    timeout: 120_000,
  });
  await expect(page.getByTestId("make-it-real-panel")).toBeVisible();
  await expect(page.getByTestId("customize-section")).toContainText(
    /Customize/i,
  );
  await expect(page.getByTestId("make-it-real-section")).toContainText(
    /Make it real/i,
  );
  await expect(page.getByTestId("visual-loop-mode")).toContainText(/VCL:/i);
  await expect(page.getByTestId("iteration-log")).toContainText(
    /Design|Visual/i,
  );
  await expect(page.getByTestId("manufacturing-workflow-rail")).toBeVisible();
  await expect(page.getByTestId("visual-evidence-rail")).toBeVisible();
  await expect(page.getByTestId("workflow-slice")).toContainText(
    /Ready to slice/i,
    { timeout: 120_000 },
  );
  await expect(page.getByTestId("make-it-real-button")).toBeEnabled({
    timeout: 120_000,
  });

  await page.getByTestId("make-it-real-button").click();
  const firstReal = page.getByTestId("first-real-print-dialog");
  if (await firstReal.isVisible().catch(() => false)) {
    await firstReal.getByTestId("first-real-print-confirm").click();
  }

  await expect(page.getByTestId("workflow-slice")).toContainText(/Sliced/i, {
    timeout: 180_000,
  });
  await expect(page.getByTestId("workflow-send")).toContainText(
    /Choose printer|Ready for/i,
    { timeout: 30_000 },
  );
  await expect(
    page.getByLabel("Notifications alt+T").getByText(/Ready to print/i),
  ).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("iteration-log")).toContainText(
    /Ready to print/i,
  );

  await page.getByTestId("connector-select").selectOption("mock");
  await expect(page.getByTestId("send-to-printer-button")).toBeEnabled({
    timeout: 30_000,
  });
  await page.getByTestId("send-to-printer-button").click();

  await expect(page.getByTestId("print-outcome-dialog")).toBeVisible({
    timeout: 60_000,
  });
  await page
    .getByTestId("print-outcome-dialog")
    .getByRole("button", {
      name: /^Clean$/i,
    })
    .click();
  await expect(page.getByTestId("print-outcome-dialog")).toBeHidden({
    timeout: 30_000,
  });

  expect(consoleErrors).toEqual([]);
  expect(responseErrors).toEqual([]);

  const profileRoot = process.env.TQ_E2E_PROFILE_ROOT;
  if (profileRoot) {
    expect(existsSync(path.join(profileRoot, "engine-output"))).toBe(true);
  }
});
