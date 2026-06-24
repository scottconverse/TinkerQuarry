# Test Engineering Deep Dive

**Role:** Test Engineer
**Final counts after fixes:** Blocker 0 / Critical 0 / Major 0 / Minor 0 / Nit 0

## Findings Closed

### TEST-B001 - Release tag could not honestly point at a dirty tree

**Original severity:** Blocker
**Evidence:** The working tree contained uncommitted release-gate fixes, so HEAD could not yet be tagged as the tested product.
**Fix:** The final workflow commits the gate changes before release proof and tags only after the clean-tree release command passes.

### TEST-M001 - Hosted CI did not contain the release gate

**Original severity:** Major
**Evidence:** No durable workflow ran the full local release proof.
**Fix:** Added `.github/workflows/release-gate.yml`, a manual self-hosted Windows workflow that runs `pnpm.cmd test:release` and uploads installer/browser artifacts.

### TEST-M002 - Browser coverage was too narrow for the release claim

**Original severity:** Major
**Evidence:** The prior committed browser e2e focused on one manufacturing happy path.
**Fix:** Added `apps/ui/e2e/workspace-walkthrough.spec.ts` for desktop workspace controls, menu/dialog keyboard wiring, export/settings surfaces, and a mobile/narrow no-horizontal-overflow smoke.

### TEST-m001 - Native release script assumed one Visual Studio install path

**Original severity:** Minor
**Evidence:** `scripts/native-release.cmd` hardcoded the BuildTools `LaunchDevCmd.bat` path.
**Fix:** The script now resolves Visual Studio via `vswhere` and keeps the old path as a fallback with a clear error.

## What Is Working

Unit, web, engine, and browser suites now provide a much stronger release tripwire. The exact committed tree still must pass `pnpm.cmd test:release` before local tag creation.
