import { expect, test, type Page } from "@playwright/test";

/**
 * WALK-1 (Blocker, GauntletGate 2026-07-19) - the non-completed design outcomes, in a real browser.
 *
 * Why this file exists: every other spec in this suite drives the engine through
 * `scripts/start-engine-web.mjs`, which hardcodes `--demo`, and DemoProvider only ever answers
 * `status: "completed"` with a full report. So no browser-level test had ever exercised ANY of the
 * six non-completed DesignStatus values, and a Blocker - the user being shown the literal text
 * "model_unavailable" instead of the sentence the engine sent - survived a fully green suite.
 *
 * The gap is closed at the network boundary rather than in the engine: `/api/design` is stubbed
 * with a real engine-shaped payload, so the whole front-end path the engine's answer travels
 * (engineDesign.engineGateSummary -> engineDocument.gate -> useEngineLifecycle.displayMessage ->
 * the toast) runs for real, in Chrome, against built assets.
 *
 * The load-bearing assertion is the negative one: whatever the app puts on screen is never a raw
 * DesignStatus enum token.
 */

/** Every non-completed DesignStatus (engineClient.ts). None of these is user-facing copy. */
const RAW_STATUS_TOKENS = [
  "gate_failed",
  "render_failed",
  "plan_failed",
  "clarification_needed",
  "model_unavailable",
  "needs_experimental",
];

/** The plain-English line the app must show when the engine sends a bare status and nothing else. */
const FALLBACK_COPY: Record<string, RegExp> = {
  gate_failed: /didn't pass the printability check/i,
  render_failed: /couldn't turn that design into geometry/i,
  plan_failed: /couldn't work out a plan/i,
  clarification_needed: /needs a bit more detail/i,
  model_unavailable: /isn't available right now/i,
  needs_experimental: /experimental feature/i,
};

type DesignPayload = Record<string, unknown>;

interface DesignStub {
  /** Swap the payload the next Build will receive. */
  serve: (payload: DesignPayload) => void;
  /** How many design requests the app actually made - guards against a vacuously green test. */
  calls: () => number;
}

async function installDesignStub(page: Page): Promise<DesignStub> {
  let payload: DesignPayload = {};
  let calls = 0;
  await page.route("**/api/design", async (route) => {
    if (route.request().method() !== "POST") {
      await route.continue();
      return;
    }
    calls += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });
  return {
    serve: (next) => {
      payload = next;
    },
    calls: () => calls,
  };
}

async function describePart(page: Page, prompt: string) {
  await expect(page.getByTestId("welcome-screen")).toBeVisible();
  await page
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .fill(prompt);
  await page.getByRole("button", { name: /^Build$/i }).click();
}

/** The in-flight progress toast the describe surface shows first; not the outcome. */
const PROGRESS_TOAST = /^(Designing|Refining)/;

/**
 * The words the app actually shows the user for a failed design.
 *
 * Two things make this fiddly and both are real product behaviour, not test scaffolding: the
 * describe surface raises a "Designing..." progress toast BEFORE the result arrives and replaces
 * it in place (same toastId), and toasts auto-dismiss. So this polls until the notification region
 * holds something that is not the progress toast, and keeps that text even if it later clears.
 */
async function failureNotificationText(page: Page): Promise<string> {
  const notifications = page.getByLabel("Notifications alt+T");
  let captured = "";
  await expect
    .poll(
      async () => {
        const text = (await notifications.innerText()).trim();
        if (text && !PROGRESS_TOAST.test(text)) captured = text;
        return captured;
      },
      {
        timeout: 60_000,
        message: "waiting for the design outcome notification",
      },
    )
    .not.toBe("");
  return captured;
}

function expectNoRawStatus(text: string, label: string) {
  for (const token of RAW_STATUS_TOKENS) {
    expect(
      text,
      `${label}: the raw DesignStatus "${token}" was shown to the user as "${text}"`,
    ).not.toContain(token);
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.clear();
  });
});

test("model_unavailable renders the engine's own sentence, not the status code", async ({
  page,
}) => {
  const stub = await installDesignStub(page);
  stub.serve({
    rid: 0,
    status: "model_unavailable",
    has_mesh: false,
    error:
      "KimCad couldn't reach your local AI - it isn't running. It starts up with TinkerQuarry, so wait a few seconds and try again; if it keeps failing, close and reopen TinkerQuarry.",
  });

  await page.goto("/");
  await describePart(page, "a 40 mm cable clip, 8 mm wide");

  const shown = await failureNotificationText(page);
  expect(stub.calls()).toBeGreaterThan(0);
  expect(shown).toMatch(/couldn't reach your local AI/i);
  expect(shown).toMatch(/close and reopen TinkerQuarry/i);
  expectNoRawStatus(shown, "model_unavailable");
});

test("clarification_needed renders the engine's question, not the status code", async ({
  page,
}) => {
  const stub = await installDesignStub(page);
  stub.serve({
    rid: 0,
    status: "clarification_needed",
    has_mesh: false,
    clarification: "How tall should the clip be, in millimetres?",
  });

  await page.goto("/");
  await describePart(page, "a cable clip");

  const shown = await failureNotificationText(page);
  expect(stub.calls()).toBeGreaterThan(0);
  expect(shown).toMatch(/How tall should the clip be/i);
  expectNoRawStatus(shown, "clarification_needed");
});

test("every non-completed status with no engine message still reads as English", async ({
  page,
}) => {
  const stub = await installDesignStub(page);

  for (const status of RAW_STATUS_TOKENS) {
    stub.serve({ rid: 0, status, has_mesh: false });
    await page.goto("/");
    await describePart(page, `a test part for ${status.replace(/_/g, " ")}`);

    const shown = await failureNotificationText(page);
    expect(shown, `${status}: expected plain-English fallback copy`).toMatch(
      FALLBACK_COPY[status],
    );
    expectNoRawStatus(shown, status);
  }

  expect(stub.calls()).toBe(RAW_STATUS_TOKENS.length);
});
