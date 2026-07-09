// GauntletGate walkthrough: first-run audit of the INSTALLED TinkerQuarry app.
// Launches the installed exe with a verified-isolated profile + CDP, captures the
// welcome/model-status state, optionally submits a prompt, and writes screenshots,
// DOM text, and a JSON result into the gate artifacts dir.
//
// Usage: node walkthrough-firstrun.mjs --exe=<installed exe> --profile=<fresh dir>
//          --out=<artifacts dir> --phase=<absent|present> [--submit] [--settle=15000]
import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync, existsSync } from "node:fs";
import { resolve, join } from "node:path";

const arg = (name, dflt) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : dflt;
};
const exe = resolve(arg("exe"));
const profile = resolve(arg("profile"));
const outDir = resolve(arg("out"));
const phase = arg("phase", "absent");
const doSubmit = process.argv.includes("--submit");
const settleMs = Number(arg("settle", "15000"));
const port = Number(arg("port", "9341"));

mkdirSync(outDir, { recursive: true });
for (const name of ["LocalAppData", "AppData"]) {
  mkdirSync(resolve(profile, name), { recursive: true });
}

async function probeOllama() {
  try {
    const res = await fetch("http://127.0.0.1:11434/api/version", { signal: AbortSignal.timeout(4000) });
    return { present: res.ok, detail: await res.text() };
  } catch (err) {
    return { present: false, detail: String(err?.cause || err) };
  }
}

function findFiles(root, names, cap = 20) {
  const hits = [];
  const stack = [root];
  while (stack.length && hits.length < cap) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const full = join(cur, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (names.includes(e.name)) hits.push(full);
    }
  }
  return hits;
}

const ollamaBefore = await probeOllama();

const child = spawn(exe, [], {
  detached: false,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
    LOCALAPPDATA: resolve(profile, "LocalAppData"),
    APPDATA: resolve(profile, "AppData"),
    TINKERQUARRY_APPDATA_DIR: resolve(profile, "TinkerQuarryAppData"),
  },
});

async function waitForDebugPort() {
  const deadline = Date.now() + 60_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (res.ok) return;
    } catch (err) { lastError = err; }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`debug port never opened: ${lastError}`);
}

async function evalRetry(page, fn, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      await page.waitForLoadState("domcontentloaded", { timeout: 5000 }).catch(() => {});
      return await page.evaluate(fn);
    } catch (err) {
      lastError = err;
      if (!/Execution context was destroyed|Cannot find context|Target page/.test(String(err))) throw err;
      await page.waitForTimeout(500).catch(() => {});
    }
  }
  throw lastError;
}

const result = { phase, exe, profile, ollamaBefore, consoleErrors: [] };

async function main() {
  await waitForDebugPort();
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  try {
    let page;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const pages = browser.contexts().flatMap((c) => c.pages());
      page = pages.find((p) => /tauri|localhost|127\.0\.0\.1/.test(p.url())) || pages[0];
      if (page) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    if (!page) throw new Error("no inspectable page");
    page.on("console", (m) => { if (m.type() === "error") result.consoleErrors.push(m.text()); });
    page.on("pageerror", (e) => result.consoleErrors.push(e.message));

    await page.waitForLoadState("domcontentloaded", { timeout: 20_000 });
    await page.setViewportSize({ width: 1600, height: 1000 }).catch(() => {});
    // Let the model-status probe settle (it starts as "Checking local AI...").
    {
      const settleDeadline = Date.now() + Math.max(settleMs, 90_000);
      while (Date.now() < settleDeadline) {
        const txt = await page
          .getByTestId("welcome-model-status")
          .innerText({ timeout: 5000 })
          .catch(() => "");
        if (txt && !/Checking local AI/i.test(txt)) break;
        await page.waitForTimeout(2000);
      }
    }

    result.title = await evalRetry(page, () => document.title);
    result.modelStatusText = await page
      .getByTestId("welcome-model-status")
      .innerText({ timeout: 10_000 })
      .catch(() => "(welcome-model-status not found)");
    const submitBtn = page.getByTestId("welcome-ai-entry").getByTestId("ai-submit-button");
    result.buildButton = {
      visible: await submitBtn.isVisible().catch(() => false),
      enabled: await submitBtn.isEnabled().catch(() => false),
    };
    result.rootTextStart = (await page.locator("#root").innerText().catch(() => "")).slice(0, 1500);
    await page.screenshot({ path: join(outDir, `first-run-${phase}.png`), fullPage: false });

    if (process.argv.includes("--click-setup")) {
      const setupBtn = page.getByRole("button", { name: /Set up local AI/i }).first();
      const visible = await setupBtn.isVisible().catch(() => false);
      result.clickSetup = { visible };
      if (visible) {
        await setupBtn.click();
        const waitMs = Number(arg("setupwait", "90000"));
        const dl = Date.now() + waitMs;
        const timeline = [];
        while (Date.now() < dl) {
          const statusText = await page
            .getByTestId("welcome-model-status")
            .innerText({ timeout: 5000 })
            .catch(() => "(status read failed)");
          const t = Math.round((Date.now() - (dl - waitMs)) / 1000);
          let managedBytes = 0;
          try {
            const dir = resolve(profile, "LocalAppData", "KimCad", "ollama");
            for (const f of readdirSync(dir)) {
              managedBytes += (await import("node:fs")).statSync(join(dir, f)).size;
            }
          } catch {}
          const last = timeline[timeline.length - 1];
          if (!last || last.text !== statusText || t - last.atSec >= 30) {
            timeline.push({ atSec: t, text: statusText.slice(0, 300), managedBytes });
          }
          await page.waitForTimeout(5000);
        }
        result.clickSetup.timeline = timeline;
        result.clickSetup.finalStatusText = timeline.length ? timeline[timeline.length - 1].text : "";
        await page.screenshot({ path: join(outDir, `after-setup-click-${phase}.png`) });
      }
    }

    if (doSubmit) {
      const box = page
        .getByTestId("welcome-ai-entry")
        .locator('textarea[placeholder="Describe what you want to build..."]')
        .first();
      await box.fill("a 30 mm cube with a 6 mm center hole");
      const enabledNow = await submitBtn.isEnabled().catch(() => false);
      result.submit = { attempted: enabledNow };
      if (enabledNow) {
        await submitBtn.click();
        // Bounded wait: either we leave the welcome screen (design started) or an
        // error/toast appears. Capture whatever the state is after the wait.
        const submitDeadline = Date.now() + Number(arg("submitwait", "240000"));
        let outcome = "no visible change";
        while (Date.now() < submitDeadline) {
          const welcomeGone = !(await page.getByTestId("welcome-screen").isVisible().catch(() => true));
          const rootText = await page.locator("#root").innerText().catch(() => "");
          if (welcomeGone && /Make it real|Customize|Explain/i.test(rootText)) { outcome = "reached workspace"; break; }
          if (/could not|failed|error|unavailable/i.test(rootText) && !/Checking/i.test(rootText)) {
            outcome = "visible error state"; break;
          }
          await page.waitForTimeout(2000);
        }
        result.submit.outcome = outcome;
        result.submit.rootTextAfter = (await page.locator("#root").innerText().catch(() => "")).slice(0, 2000);
        await page.screenshot({ path: join(outDir, `after-submit-${phase}.png`), fullPage: false });
      }
    }

    // Isolation proof: the app must have written its state under the isolated profile.
    result.isolation = {
      profile,
      engineLogs: findFiles(profile, ["engine.log"]),
      appDataDirExists: existsSync(resolve(profile, "TinkerQuarryAppData")),
    };
    result.ollamaAfter = await probeOllama();
  } finally {
    await browser.close().catch(() => {});
  }
}

main()
  .catch((err) => {
    result.error = String(err);
    process.exitCode = 1;
  })
  .finally(() => {
    writeFileSync(join(outDir, `walkthrough-${phase}.json`), JSON.stringify(result, null, 2));
    spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  });
