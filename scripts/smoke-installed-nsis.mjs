import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

if (process.platform !== "win32") {
  console.error("The NSIS installed-copy smoke is Windows-only.");
  process.exit(1);
}

const installer = resolve(
  "apps/ui/src-tauri/target/release/bundle/nsis/TinkerQuarry_1.3.1_x64-setup.exe",
);
if (!existsSync(installer)) {
  console.error(`NSIS installer not found: ${installer}`);
  console.error("Run `pnpm tauri:build` first.");
  process.exit(1);
}

const installDir = join(tmpdir(), "TQSmokeInstallRelease");
const profileDir = join(tmpdir(), "TQSmokeWorkflowProfileRelease");
for (const path of [installDir, profileDir]) {
  rmSync(path, { recursive: true, force: true });
}

const install = spawnSync(installer, ["/S", `/D=${installDir}`], {
  stdio: "inherit",
});
if (install.status !== 0) {
  process.exit(install.status ?? 1);
}

const exe = join(installDir, "tinkerquarry.exe");
if (!existsSync(exe)) {
  console.error(`Installed executable not found: ${exe}`);
  process.exit(1);
}

const smoke = spawnSync(
  process.execPath,
  [
    "scripts/smoke-tauri-runtime.mjs",
    `--exe=${exe}`,
    `--isolated-profile=${profileDir}`,
    "--workflow",
  ],
  { stdio: "inherit" },
);
process.exit(smoke.status ?? 1);
