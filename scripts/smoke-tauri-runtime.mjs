import { chromium } from "@playwright/test";
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const port = Number(process.env.TINKERQUARRY_TAURI_DEBUG_PORT || "9337");
const exeArg = process.argv.find((arg) => arg.startsWith("--exe="));
const exe = resolve(
  exeArg?.slice("--exe=".length) ||
    "apps/ui/src-tauri/target/release/openscad-studio.exe",
);

if (!existsSync(exe)) {
  console.error(`Tauri executable not found: ${exe}`);
  process.exit(1);
}

const child = spawn(exe, [], {
  detached: false,
  stdio: "ignore",
  env: {
    ...process.env,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${port}`,
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

    await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
    const title = await page.title();
    const engine = await page.evaluate(async () => {
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
    };
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
