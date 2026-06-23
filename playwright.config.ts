import { defineConfig, devices } from "@playwright/test";

const uiPort = Number(process.env.TQ_E2E_UI_PORT || 1422);
const enginePort = Number(process.env.TQ_E2E_ENGINE_PORT || 8765);

export default defineConfig({
  testDir: "./apps/ui/e2e",
  timeout: 180_000,
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
      command: `.venv\\Scripts\\kimcad.exe web --port ${enginePort} --demo --out "%TEMP%\\tinkerquarry-e2e-engine"`,
      cwd: "./packages/engine",
      env: {
        TINKERQUARRY_DEV_TOKEN: "tq-dev-token",
      },
      url: `http://127.0.0.1:${enginePort}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `pnpm.cmd exec vite --host 127.0.0.1 --port ${uiPort}`,
      cwd: "./apps/ui",
      env: {
        TINKERQUARRY_DEV_TOKEN: "tq-dev-token",
      },
      url: `http://127.0.0.1:${uiPort}`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
});
