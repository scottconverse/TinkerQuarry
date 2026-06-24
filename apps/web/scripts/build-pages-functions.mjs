import { rmSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appDir = resolve(scriptDir, "..");
const outDir = resolve(appDir, ".wrangler-functions-build");
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const result = spawnSync(
  [
    "npx",
    "-y",
    "wrangler@3",
    "pages",
    "functions",
    "build",
    "functions",
    "--outdir",
    ".wrangler-functions-build",
    "--output-config-path",
    ".wrangler-functions-build/config.json",
    "--compatibility-date",
    "2026-03-24",
  ].join(" "),
  {
    cwd: appDir,
    stdio: "inherit",
    shell: true,
  },
);

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
