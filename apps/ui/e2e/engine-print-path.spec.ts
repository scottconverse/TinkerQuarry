import { expect, test } from "@playwright/test";
import {
  buildDemoPart,
  chooseSliceableProfile,
  collectPageErrors,
  confirmFirstRealPrint,
  notifications,
  submitPrompt,
} from "./engine-harness";

/**
 * Ported from packages/engine/tests/e2e/test_export_gate.py and the error-recovery journey in
 * test_settings_designs.py (WALK-3 deleted the SPA those journeys drove).
 *
 * DROPPED, with the evidence, rather than faked:
 * - test_an_out_of_template_part_offers_the_experimental_generator: apps/ui never offers the
 *   generator, because it never withholds it. The engine only offers it when the client sends
 *   `experimental: false` (packages/engine/src/kimcad/webapp.py: `allow_experimental =
 *   bool(data.get("experimental", True)) or ...`), and apps/ui never sends the flag —
 *   `grep -rn experimental apps/ui/src` returns only the `needs_experimental` status name in
 *   engineClient.ts, its fallback sentence in engineDesign.ts, and unit tests. There is no
 *   "Try the experimental generator" control anywhere in the tree.
 * - the "still downloadable" half of the gate-fail journey: a gate_failed design never reaches
 *   the workspace in apps/ui (runEngineDesign returns ok only for `status === "completed"`), so
 *   there is no Export surface, no model download and no slice button to refuse. What IS still
 *   true — the refusal, with the engine's own words — is asserted below.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.__PLAYWRIGHT__ = true;
  });
});

test("a gate-passing part slices to a downloadable print file", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoPart(page, "a 40 mm desk cable clip");
  await chooseSliceableProfile(page);

  // Python: "Slice & prepare file" then a "Download print file" link. apps/ui hands the printable
  // file straight to the browser as a download off the same click, so the proof is the download
  // itself, not a link that might point nowhere.
  const download = page.waitForEvent("download", { timeout: 180_000 });
  await page.getByTestId("make-it-real-button").click();
  await confirmFirstRealPrint(page);

  const printFile = await download;
  expect(printFile.suggestedFilename()).toMatch(/\.(gcode|3mf|gcode\.3mf)$/i);
  expect(await printFile.path()).toBeTruthy();

  await expect(page.getByTestId("workflow-slice")).toContainText(/Sliced/i, {
    timeout: 180_000,
  });
  await expect(notifications(page)).toContainText(/Ready to print/i, {
    timeout: 60_000,
  });

  expect(responseErrors).toEqual([]);
});

test("a gate-failing part is refused with the engine's own reason", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  // demo:gatefail routes through a non-template object type and emits a 300 mm cube, which fails
  // the build-volume gate (packages/engine/src/kimcad/webapp.py DemoProvider).
  await submitPrompt(page, "demo:gatefail");

  // The refusal carries the gate's verdict and score, not a raw status enum.
  await expect(notifications(page)).toContainText(
    /Not print-ready \(\d+\/100\)/,
    {
      timeout: 120_000,
    },
  );

  // And it never becomes a design: the landing stays, so there is nothing to slice or send.
  await expect(page.getByTestId("welcome-screen")).toBeVisible();
  await expect(page.getByTestId("make-it-real-button")).toHaveCount(0);

  // gate_failed is a designed 200 outcome, not a server error.
  expect(responseErrors).toEqual([]);
});

test("a slice failure surfaces an error and stays recoverable", async ({
  page,
}) => {
  await buildDemoPart(page, "a 40 mm desk cable clip");
  await chooseSliceableProfile(page);

  // Client-side mock (as in the Python journey): this proves the UI's handling of a 5xx from the
  // slicer, not the engine's own graceful refusal path.
  await page.route("**/api/slice/**", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: JSON.stringify({ error: "Slicer crashed" }),
    }),
  );

  await page.getByTestId("make-it-real-button").click();
  await confirmFirstRealPrint(page);

  await expect(notifications(page)).toContainText(/Slicer crashed/i, {
    timeout: 120_000,
  });

  // Recovery is intact: the control is usable again (not stuck mid-slice) and the workflow rail
  // still offers the slice step rather than claiming a print file exists.
  await expect(page.getByTestId("make-it-real-button")).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.getByTestId("workflow-slice")).toContainText(
    /Ready to slice/i,
  );
  await expect(page.getByTestId("explain-action-state")).toContainText(
    /disabled until this candidate is sliced/i,
  );
});
