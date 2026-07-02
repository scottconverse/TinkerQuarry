import { chromium, expect } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

const port = Number(process.env.TINKERQUARRY_TAURI_DEBUG_PORT || "9337");
const exeArg = process.argv.find((arg) => arg.startsWith("--exe="));
const isolatedProfileArg = process.argv.find((arg) =>
  arg.startsWith("--isolated-profile="),
);
const workflow = process.argv.includes("--workflow");
const defaultExe = resolve("apps/ui/src-tauri/target/release/tinkerquarry.exe");
const legacyDefaultExe = resolve(
  "apps/ui/src-tauri/target/release/openscad-studio.exe",
);
const exe = resolve(
  exeArg?.slice("--exe=".length) ||
    (existsSync(defaultExe) ? defaultExe : legacyDefaultExe),
);
const isolatedProfile = isolatedProfileArg
  ? resolve(isolatedProfileArg.slice("--isolated-profile=".length))
  : process.env.TQ_TAURI_ISOLATED_PROFILE
    ? resolve(process.env.TQ_TAURI_ISOLATED_PROFILE)
    : resolve(tmpdir(), "TQSmokeRuntimeProfileRelease");

if (!existsSync(exe)) {
  console.error(`Tauri executable not found: ${exe}`);
  process.exit(1);
}

if (isolatedProfile) {
  for (const name of ["LocalAppData", "AppData"]) {
    mkdirSync(resolve(isolatedProfile, name), { recursive: true });
  }
}

const child = spawn(exe, [], {
  detached: false,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    ...(workflow ? { TINKERQUARRY_ENGINE_DEMO: "1" } : {}),
    ...(isolatedProfile
      ? {
          LOCALAPPDATA: resolve(isolatedProfile, "LocalAppData"),
          APPDATA: resolve(isolatedProfile, "AppData"),
          TINKERQUARRY_APPDATA_DIR: resolve(
            isolatedProfile,
            "TinkerQuarryAppData",
          ),
        }
      : {}),
  },
});

async function waitForDebugPort() {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (err) {
      lastError = err;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `WebView2 remote debugging port ${port} did not open: ${lastError}`,
  );
}

async function main() {
  await waitForDebugPort();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    const deadline = Date.now() + 60_000;
    let page;
    while (Date.now() < deadline) {
      const pages = browser.contexts().flatMap((context) => context.pages());
      page =
        pages.find((candidate) =>
          /tauri|localhost|127\.0\.0\.1/.test(candidate.url()),
        ) || pages[0];
      if (page) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!page) throw new Error("No inspectable Tauri page appeared.");

    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.message);
    });

    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    const title = await page.title();
    const engine = await evaluateWithNavigationRetry(page, async () => {
      const internals = globalThis.__TAURI_INTERNALS__;
      if (!internals || typeof internals.invoke !== "function") {
        return {
          ok: false,
          error: "window.__TAURI_INTERNALS__.invoke is unavailable",
        };
      }
      const info = await internals.invoke("ensure_engine", {});
      const res = await fetch(`${info.apiBaseUrl}/health`, {
        headers: { "X-KimCad-Session": info.sessionToken },
      });
      const health = await res.json();
      return {
        ok:
          res.ok &&
          Boolean(health.version) &&
          health.openscad === true &&
          health.orcaslicer === true,
        status: res.status,
        info,
        health,
      };
    });

    let promptVisible = false;
    let rootText = "";
    let hasStartSurface = false;
    const surfaceDeadline = Date.now() + 30_000;
    while (Date.now() < surfaceDeadline) {
      promptVisible = await page
        .locator('textarea[placeholder="Describe what you want to build..."]')
        .first()
        .isVisible({ timeout: 1_000 })
        .catch(() => false);
      rootText = await page
        .locator("#root")
        .innerText({ timeout: 1_000 })
        .catch(() => "");
      hasStartSurface =
        promptVisible ||
        /What do you want to create\?|Build|New design|Make it real/.test(
          rootText,
        );
      if (hasStartSurface) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const result = {
      title,
      promptVisible,
      hasStartSurface,
      rootText: rootText.slice(0, 200),
      engine,
      isolatedProfile: isolatedProfile || null,
    };

    if (workflow) {
      await runNativeWorkflow(page, consoleErrors);
    }

    if (consoleErrors.length) {
      throw new Error(
        `Native runtime console/page errors: ${consoleErrors.join(" | ")}`,
      );
    }

    if (isolatedProfile && !profileHasEngineState(isolatedProfile)) {
      throw new Error(
        `Isolated native profile did not receive engine/app state under ${isolatedProfile}`,
      );
    }

    const resultText = JSON.stringify(result, null, 2);
    console.log(resultText);
    if (!title.includes("TinkerQuarry")) {
      throw new Error(`Unexpected Tauri title: ${title}`);
    }
    if (!hasStartSurface) {
      throw new Error(
        "Tauri app did not render the describe/workspace surface.",
      );
    }
    if (!engine.ok) {
      throw new Error(
        engine.error || `Bundled engine health failed with ${engine.status}`,
      );
    }
  } finally {
    await browser.close().catch(() => {});
  }
}

async function evaluateWithNavigationRetry(page, fn, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5_000 }).catch(() => {});
      return await page.evaluate(fn);
    } catch (err) {
      lastError = err;
      if (!/Execution context was destroyed|Cannot find context|Target page/.test(String(err))) {
        throw err;
      }
      await page.waitForTimeout(500).catch(() => {});
    }
  }
  throw lastError;
}

function profileHasEngineState(root) {
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    let entries;
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = resolve(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name === "engine.log") {
        return true;
      }
    }
  }
  return false;
}

async function runNativeWorkflow(page, consoleErrors) {
  const welcomePrompt = page
    .getByTestId("welcome-ai-entry")
    .locator('textarea[placeholder="Describe what you want to build..."]')
    .first();
  await expect(welcomePrompt).toBeVisible({ timeout: 30_000 });
  await welcomePrompt.fill("a small test gear");
  const welcomeSubmit = page
    .getByTestId("welcome-ai-entry")
    .getByTestId("ai-submit-button");
  await expect(welcomeSubmit).toBeEnabled({ timeout: 30_000 });
  await welcomeSubmit.click();
  await expect(page.getByTestId("welcome-screen")).toBeHidden({
    timeout: 30_000,
  });

  await clickFirstEnabled(page, "make-it-real-button", 120_000);

  const firstReal = page.getByTestId("first-real-print-dialog");
  if (await firstReal.isVisible().catch(() => false)) {
    await firstReal.getByTestId("first-real-print-confirm").click();
  }

  await page
    .getByTestId("workflow-slice")
    .getByText(/Sliced/i)
    .waitFor({ timeout: 180_000 });
  const selectedConnector = await selectFirstVisible(
    page,
    "connector-select",
    "mock",
    5_000,
  );
  if (selectedConnector) {
    await clickFirstEnabled(page, "send-to-printer-button", 30_000);
  } else {
    await clickFirstEnabled(page, "rail-send-to-printer-button", 30_000);
  }
  await page
    .getByTestId("print-outcome-dialog")
    .waitFor({ state: "visible", timeout: 60_000 });
  await page
    .getByTestId("print-outcome-dialog")
    .getByRole("button", { name: /^Clean$/i })
    .click();

  if (consoleErrors.length) {
    throw new Error(`Native workflow console/page errors: ${consoleErrors.join(" | ")}`);
  }
}

async function selectFirstVisible(page, testId, value, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = "";
  while (Date.now() < deadline) {
    const controls = page.getByTestId(testId);
    const count = await controls.count();
    const states = [];
    for (let i = 0; i < count; i += 1) {
      const candidate = controls.nth(i);
      const visible = await candidate.isVisible().catch(() => false);
      const enabled =
        visible && (await candidate.isEnabled().catch(() => false));
      states.push(`#${i}: visible=${visible} enabled=${enabled}`);
      if (enabled) {
        await candidate.selectOption(value);
        return true;
      }
    }
    lastState = states.join(" | ");
    await page.waitForTimeout(500);
  }
  return false;
}

async function clickFirstEnabled(page, testId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastState = "";
  while (Date.now() < deadline) {
    const buttons = page.getByTestId(testId);
    const count = await buttons.count();
    const states = [];
    for (let i = 0; i < count; i += 1) {
      const candidate = buttons.nth(i);
      const visible = await candidate.isVisible().catch(() => false);
      const enabled =
        visible && (await candidate.isEnabled().catch(() => false));
      const title = await candidate.getAttribute("title").catch(() => "");
      states.push(
        `#${i}: visible=${visible} enabled=${enabled} title=${title || ""}`,
      );
      if (enabled) {
        await candidate.click();
        return;
      }
    }
    lastState = states.join(" | ");
    await page.waitForTimeout(500);
  }
  const rootText = await page
    .locator("#root")
    .innerText()
    .catch(() => "");
  throw new Error(
    `No enabled [data-testid="${testId}"] after ${timeoutMs}ms. ${lastState}. Root: ${rootText.slice(
      0,
      500,
    )}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    if (process.platform === "win32") {
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
      });
    } else if (!child.killed) {
      child.kill();
    }
  });
