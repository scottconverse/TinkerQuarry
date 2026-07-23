import { expect, test } from "@playwright/test";
import {
  PROMPT_BOX,
  buildDemoPart,
  chooseSliceableProfile,
  collectPageErrors,
  confirmFirstRealPrint,
  notifications,
  openWorkspaceTab,
} from "./engine-harness";

/**
 * Ported from packages/engine/tests/e2e/test_design_refine.py (WALK-3 deleted the SPA those
 * journeys drove). Same assertions, new harness: the shipping apps/ui workspace over the same
 * real `kimcad web --demo` engine.
 *
 * DROPPED, with the evidence, rather than faked:
 * - test_the_first_run_wizard_walks_through_to_the_landing and
 *   test_skip_setup_dismisses_the_wizard_straight_to_the_landing: apps/ui has no first-run
 *   wizard at all (`grep -rn "Skip setup" apps/ui/src` is empty; the landing is WelcomeScreen.tsx,
 *   which is what a fresh profile boots into — see the "mobile viewport" test in
 *   workspace-walkthrough.spec.ts).
 * - test_landing_serves_the_session_token_meta_for_the_post_guard: the engine deliberately no
 *   longer injects the per-boot token into the page it serves
 *   (packages/engine/src/kimcad/shell.py, "the served page no longer receives this token").
 *   apps/ui gets its token from the desktop bridge / TINKERQUARRY_DEV_TOKEN, not a meta tag.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
    // The __TEST_*__ seams (Editor.tsx, useOpenScad) are gated on DEV mode OR this flag, and the
    // e2e suite runs against BUILT assets where DEV is false — same escape hatch
    // workspace-walkthrough.spec.ts uses.
    window.__PLAYWRIGHT__ = true;
  });
});

test("a typed prompt renders a parametric part", async ({ page }) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoPart(page, "a 40 mm desk cable clip");

  // The Python journey asserted the design route plus the four named parameters (Width, Depth,
  // Height, Wall thickness) and the dimensioned preview. In apps/ui the engine's parametric plan
  // lands in the Intent panel, and the mesh in the 3D preview.
  await openWorkspaceTab(page, "Intent");
  const intent = page.getByText("Dimensions", { exact: true }).locator("..");
  for (const param of ["width", "depth", "height", "wall"]) {
    await expect(intent).toContainText(param);
  }
  await expect(intent).toContainText(/80(\.0)? mm/);
  await expect(intent).toContainText(/60(\.0)? mm/);
  await expect(intent).toContainText(/40(\.0)? mm/);

  await expect(page.getByTestId("explain-design-summary")).toContainText(
    /80(\.0)? × 60(\.0)? × 40(\.0)? mm/,
  );

  expect(responseErrors).toEqual([]);
});

test("the design surface shows the engine's readiness score", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoPart(page, "a 40 mm desk cable clip");

  // Python: the Quality tab's "Readiness score" band. apps/ui publishes the same engine gate
  // summary (verdict + score out of 100) on the Customize section and in the Explain evidence.
  await expect(page.getByTestId("customize-section")).toContainText(
    /\(\d{1,3}\/100\)/,
  );
  await expect(page.getByTestId("explain-evidence-sources")).toContainText(
    /Readiness:.*\(\d{1,3}\/100\)/,
  );

  expect(responseErrors).toEqual([]);
});

test("a wider parameter value re-renders the part through the engine", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoPart(page, "a 40 mm desk cable clip");
  await chooseSliceableProfile(page);
  await page.waitForFunction(() => Boolean(window.__TEST_EDITOR__));

  // The Python journey nudged the Width slider and asserted the preview's dimension label grew.
  // apps/ui does NOT surface the engine's parameters as Customizer sliders for a template part
  // (the engine serves the SCAD with its library inlined, and the Customizer parser stops at the
  // first module declaration, so the panel shows "No custom controls yet") — so the parameter is
  // changed in the document the same way the shipping tune path reads it, and the assertion is
  // that the ENGINE re-rendered at the larger width and the tuned geometry is what gets sliced.
  const renderRequest = page.waitForRequest(
    (request) =>
      request.method() === "POST" && /\/api\/render\/\d+$/.test(request.url()),
    { timeout: 60_000 },
  );
  await page.evaluate(() => {
    const editor = window.__TEST_EDITOR__;
    if (!editor) throw new Error("Editor test hook missing");
    const before = editor.getValue();
    const after = before.replace(/^width\s*=\s*80\s*;/m, "width = 120;");
    if (after === before) {
      throw new Error("engine source did not carry a top-level `width = 80;`");
    }
    editor.setValue(after);
  });

  const request = await renderRequest;
  expect(request.postDataJSON().values.width).toBe(120);
  const response = await request.response();
  const rendered = await response!.json();
  expect(rendered.status).toBe("completed");
  expect(rendered.report.headline).toContain("120.0");

  // And the re-render is real enough that the engine geometry now MATCHES the tuned document:
  // slicing proceeds instead of raising the stale-edit refusal
  // (workspace-walkthrough.spec.ts covers the refusal side for a structural edit).
  await page.getByTestId("make-it-real-button").click();
  await confirmFirstRealPrint(page);
  await expect(notifications(page)).toContainText(/Ready to print/i, {
    timeout: 180_000,
  });
  await expect(page.getByTestId("workflow-slice")).toContainText(/Sliced/i, {
    timeout: 180_000,
  });
  await expect(page.getByTestId("explain-gate-checks")).toContainText(
    /Successful slice proved this candidate/i,
  );

  expect(responseErrors).toEqual([]);
});

test("a refine pushes a new version and the version rail steps back to the previous one", async ({
  page,
}) => {
  const { responseErrors } = collectPageErrors(page);

  await buildDemoPart(page, "a 40 mm desk cable clip");

  // Nothing to step back to yet — the version control only exists once a refine has pushed one.
  await expect(page.getByTestId("undo-design-button")).toHaveCount(0);
  const entriesBefore = await page
    .getByTestId("iteration-branch-summary")
    .innerText();

  await openWorkspaceTab(page, "AI");
  await page.getByLabel("AI assistant prompt").fill("Make it bigger");
  await page.getByTestId("ai-submit-button").click();

  // Python (test_design_refine.py) asserted the refinement was echoed into the conversation AND
  // pushed v2 onto the version rail. The CONVERSATION half is dropped: apps/ui's transcript
  // (`ai-transcript`) is fed by the cloud-AI agent's `messages`, and an engine refine goes
  // straight through handleAiPanelSubmit -> handleEngineDescribe without ever appending a message
  // — with only the engine running, the panel stays on its "Ready to build or refine" empty
  // state, so there is no conversation to record into. The VERSION half is asserted here: the
  // refine lands as a new entry on the iteration log.
  await expect(page.getByTestId("iteration-branch-summary")).not.toHaveText(
    entriesBefore,
    { timeout: 120_000 },
  );
  await expect(page.getByTestId("undo-design-button")).toBeVisible({
    timeout: 120_000,
  });

  // Python: "Undo to previous version" actually moves. Here the control is only rendered while a
  // previous version exists, so stepping back consumes it — the state changed, not just the copy.
  await page.getByTestId("undo-design-button").click();
  await expect(notifications(page)).toContainText(
    /Reverted to the previous design/i,
  );
  await expect(page.getByTestId("undo-design-button")).toHaveCount(0);

  // And the restored version is still a real design the rail will act on: Restore/Branch on the
  // logged entries stay live.
  await expect(
    page.getByTestId("restore-iteration-button").first(),
  ).toBeVisible();

  expect(responseErrors).toEqual([]);
});

test("a new design returns to a fresh landing", async ({ page }) => {
  const { responseErrors } = collectPageErrors(page);

  // The engine's SCAD lands in the document unsaved, so File > New File asks about the edits
  // through the platform's native dialogs (window.confirm on the web target).
  page.on("dialog", (dialog) => {
    void (/discard/i.test(dialog.message())
      ? dialog.accept()
      : dialog.dismiss());
  });

  await buildDemoPart(page, "a 40 mm desk cable clip");

  await page.getByRole("menuitem", { name: "File" }).press("ArrowDown");
  await page.getByRole("menuitem", { name: /New File/i }).click();

  // Back to the empty landing — the primary on-ramp (the prompt box) is ready again.
  await expect(page.getByTestId("welcome-screen")).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.locator(PROMPT_BOX)).toBeVisible();

  expect(responseErrors).toEqual([]);
});
