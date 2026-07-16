import { defineConfig, devices } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const uiPort = Number(process.env.TQ_E2E_UI_PORT || 1422);
const enginePort = Number(process.env.TQ_E2E_ENGINE_PORT || 8765);
const runId = process.env.TQ_E2E_RUN_ID || `${Date.now()}-${process.pid}`;
const profileRoot =
  process.env.TQ_E2E_PROFILE_ROOT ||
  path.join(os.tmpdir(), "tinkerquarry-e2e-profile", runId);
const engineOut = path.join(profileRoot, "engine-output");

export default defineConfig({
  testDir: "./apps/ui/e2e",
  timeout: 180_000,
  workers: 1,
  expect: {
    timeout: 30_000,
  },
  fullyParallel: false,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${uiPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    viewport: { width: 1440, height: 1000 },
  },
  projects: [
    {
      name: "system-chrome",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 1000 },
      },
    },
  ],
  webServer: [
    {
      command: `node .\\scripts\\start-engine-web.mjs --port ${enginePort} --out "${engineOut}"`,
      cwd: ".",
      env: {
        TINKERQUARRY_DEV_TOKEN: "tq-dev-token",
        LOCALAPPDATA: path.join(profileRoot, "LocalAppData"),
        APPDATA: path.join(profileRoot, "AppData"),
        USERPROFILE: path.join(profileRoot, "UserProfile"),
        HOME: path.join(profileRoot, "Home"),
        TQ_E2E_PROFILE_ROOT: profileRoot,
      },
      url: `http://127.0.0.1:${enginePort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      // Release fidelity: e2e runs against BUILT assets on `vite preview`, not the dev
      // server. The dev client's ws-reconnect forces a full page reload (the only reload
      // path in the stack — product code has none), which reset the app to the welcome
      // screen mid-test in a release-gate run; built assets carry no HMR client at all.
      command: `pnpm.cmd exec vite build && pnpm.cmd exec vite preview --host 127.0.0.1 --port ${uiPort}`,
      cwd: "./apps/ui",
      env: {
        TINKERQUARRY_DEV_TOKEN: "tq-dev-token",
        LOCALAPPDATA: path.join(profileRoot, "LocalAppData"),
        APPDATA: path.join(profileRoot, "AppData"),
        USERPROFILE: path.join(profileRoot, "UserProfile"),
        HOME: path.join(profileRoot, "Home"),
        TQ_E2E_PROFILE_ROOT: profileRoot,
      },
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer: false,
      // The vite build runs inside this budget before the preview server answers.
      timeout: 240_000,
    },
  ],
});
