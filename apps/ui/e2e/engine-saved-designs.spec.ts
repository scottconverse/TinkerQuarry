import { expect, test } from "@playwright/test";
import {
  buildDemoPart,
  collectPageErrors,
  notifications,
} from "./engine-harness";

/**
 * Ported from packages/engine/tests/e2e/test_settings_designs.py (WALK-3 deleted the SPA those
 * journeys drove).
 *
 * DROPPED, with the evidence, rather than faked:
 * - test_settings_toggles_the_experimental_generator_both_ways: apps/ui's Settings dialog has no
 *   experimental-generator switch. `grep -rn -i experimental apps/ui/src/components/` matches
 *   exactly one line, and it is prose, not a control: settings/CadExportCard.tsx's
 *   "Experimental parts stay mesh-only by design." The engine setting still exists server-side
 *   (`saved_settings().get("experimental_enabled")` in webapp.py); nothing in the shipping UI
 *   writes it.
 * - the photo and sketch on-ramps (test_onramps.py, all three journeys): apps/ui has no
 *   vision-seed on-ramp. There is no describe_photo/describe_sketch call in
 *   apps/ui/src/services/engineClient.ts (its endpoints are /design, /render, /slice, /orient,
 *   /send, /print-outcome, /connectors, /source, /visual-review, /designs*, /health,
 *   /model-status, /model-pull*, /options, /templates, /settings, /libraries), and
 *   `grep -rn "starting point\|read from your" apps/ui/src` is empty. Images are attachments on
 *   the AI composer (AiComposer.tsx, `aria-label="Attach reference photos or sketches"`), which
 *   go into the prompt — there is no editable seed card to confirm before designing.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    window.__PLAYWRIGHT__ = true;
  });
});

test("a designed part is saved and appears in My Designs", async ({ page }) => {
  const { responseErrors } = collectPageErrors(page);

  // A per-run unique prompt, so the assertion can only be satisfied by THIS run's save and never
  // by a leftover entry in the engine's designs store.
  const prompt = `a calibration ring ${Math.random().toString(16).slice(2, 10)}`;

  page.on("dialog", (dialog) => {
    void (/discard/i.test(dialog.message())
      ? dialog.accept()
      : dialog.dismiss());
  });

  await buildDemoPart(page, prompt);

  await page.getByTestId("save-design-button").click();
  await expect(notifications(page)).toContainText(/Saved to My Designs/i, {
    timeout: 60_000,
  });

  // Back to the landing, where My Designs is the "recent surface on entry" — the saved part is
  // listed there by the prompt it was designed from.
  await page.getByRole("menuitem", { name: "File" }).press("ArrowDown");
  await page.getByRole("menuitem", { name: /New File/i }).click();

  await expect(page.getByTestId("welcome-screen")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByTestId("welcome-my-designs")).toContainText(prompt, {
    timeout: 60_000,
  });

  expect(responseErrors).toEqual([]);
});
