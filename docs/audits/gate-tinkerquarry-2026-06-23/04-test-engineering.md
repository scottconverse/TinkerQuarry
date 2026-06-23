# GauntletGate Full - Test Engineering Deep Dive

Role: Test Engineer  
Scope: TinkerQuarry canonical repo after the current recovery implementation pass.  
Primary evidence: `docs/audits/gate-tinkerquarry-2026-06-23/walkthrough-summary.md`, root/app test scripts, Playwright harness, native smoke script, engine/UI tests.

## Verdict

**Do not call the test posture complete yet.** The repo has a strong engine test base and a real browser happy path, but the current gate still has collection gaps around the new differentiating product surface: autonomous VCL behavior, external SCAD library renderability, first-run/native isolation, and full-command repeatability.

This is not a "fake green" codebase. It is a codebase with a mature backend suite and a young product-level acceptance suite.

## Severity Counts

| Severity | Count |
|---|---:|
| Blocker | 0 |
| Critical | 0 |
| Major | 5 |
| Minor | 4 |
| Nit | 1 |

## Findings

### TEST-001 - Major - Root validation still does not run the product acceptance gate

**Evidence:** `package.json:27-30` defines `test:e2e:web`, `test:e2e:tauri`, and `validate:changes`, but `validate:changes` only runs lint, type-check, and `test:scripts`. `test:scripts` is a no-op message at `package.json:29`.

**Why it matters:** A developer can run the named validation command and miss the engine suite, UI Jest suite, web unit suite, Playwright product journey, and native Tauri smoke. That means future changes can regress the shipped workflow while the apparent project-level validation remains green.

**Blast radius:** Any product workflow: build, customize, slice, send, import/export, libraries, native startup.

**Concrete fix path:** Add a committed aggregate command such as `test:gate` or upgrade `validate:changes` to run at least:

- `pnpm -r lint`
- `pnpm -r type-check`
- full UI Jest
- `pnpm test:web:unit`
- engine pytest
- `pnpm test:e2e:web`
- native smoke when a built exe is present, with a clear skip/fail distinction

Keep the faster inner-loop command if needed, but do not name a partial command as validation without saying it is partial.

### TEST-002 - Major - Playwright browser journey uses real product paths, but not isolated user state

**Evidence:** `playwright.config.ts:34-54` starts the engine with `--demo --out "%TEMP%\\tinkerquarry-e2e-engine"` and sets only `TINKERQUARRY_DEV_TOKEN`. It does not isolate `USERPROFILE`, `HOME`, `APPDATA`, or `LOCALAPPDATA`. By contrast, the older pytest-browser harness explicitly redirects home and output into a throwaway temp directory at `packages/engine/tests/e2e/conftest.py:98-123`.

**Why it matters:** The new live browser proof can read or write machine-local app state. It is less reproducible across machines and can hide first-run bugs if the user's app data already contains setup markers, model settings, saved designs, or admitted libraries.

**Blast radius:** First-run wizard behavior, settings, library admission state, saved designs, model chooser state, printer connector state.

**Concrete fix path:** Make the root Playwright webServer environment match the mature pytest harness: create a unique temp home/output per run and pass `USERPROFILE`, `HOME`, and Windows app-data variables where applicable. Add an assertion that the test-created design/settings/library files land under the isolated directory.

### TEST-003 - Major - Native Tauri smoke proves startup and sidecar health, not a native user workflow

**Evidence:** `scripts/smoke-tauri-runtime.mjs:61-131` checks title, visible start surface, invokes `ensure_engine`, then verifies `/health` reports OpenSCAD and OrcaSlicer. It does not click build, wait for render, slice, send, import/export, or exercise CSP-sensitive UI paths inside WebView2. The walkthrough explicitly notes partial first-run/dependency proof in `walkthrough-summary.md`.

**Why it matters:** Native packaging is where WebView2, CSP/capabilities, sidecar paths, installer layout, and runtime permissions can differ from the browser. The smoke is valuable, but it does not prove the app can complete the TinkerQuarry workflow after installation.

**Blast radius:** Installed beta users. Failures here would be release-level, even if browser Playwright and unit tests pass.

**Concrete fix path:** Add a native Playwright/CDP smoke that runs against the installed exe and performs a bounded workflow: skip/setup as needed, build deterministic demo part, verify render state, Make it real, first-real dialog, slice, select mock connector, send, record outcome. Run it with isolated app-data variables and preserve trace/screenshot on failure.

### TEST-004 - Major - Autonomous VCL behavior is not pinned by a user-flow or component-level regression test

**Evidence:** The production loop lives in `apps/ui/src/App.tsx:967`, `apps/ui/src/App.tsx:1056`, `apps/ui/src/App.tsx:1202`, and `apps/ui/src/App.tsx:1616`. Existing tests cover engine client visual-review posting (`apps/ui/src/services/__tests__/engineClient.test.ts:167`) and preview capture helpers (`apps/ui/src/utils/__tests__/capturePreview.test.ts:99`). The Playwright journey only asserts that a VCL label is visible at `apps/ui/e2e/manufacturing-flow.spec.ts:54`.

**Why it matters:** The Visual Correction Loop is a differentiating feature. A regression could stop calling visual review, double-run correction, fail to restore best score, skip logging, or run the loop on the wrong path while all current tests still pass.

**Blast radius:** Prompt-to-print quality, truthful VCL status, iteration provenance, beta credibility.

**Concrete fix path:** Add a focused App-level integration test with mocked engine/capture service that asserts:

- fresh build starts the bounded loop once when eligible
- deterministic templates log "skipped - math-gated"
- visual fail triggers exactly one refinement prompt
- worse refinement restores the best candidate
- manual correction does not recursively launch a second autonomous loop

Then add one browser assertion that the log records an actual VCL result in a non-template mocked scenario.

### TEST-005 - Major - External library admission lacks an end-to-end render proof

**Evidence:** `packages/engine/tests/test_external_libraries.py:7-43` verifies sandbox copying/removal and sanitizer allowlist behavior. UI settings tests stub `/api/libraries/admit` at `apps/ui/src/components/__tests__/SettingsDialog.test.tsx:103-118`. The current tests do not prove that an admitted library can be included by OpenSCAD through the sandboxed `external/<slug>/...` path and render successfully with the real runner.

**Why it matters:** The admission feature is only useful if sandboxed libraries actually render. The highest-risk integration point is not the manifest; it is the combination of copy layout, `OPENSCADPATH`, sanitizer, and OpenSCAD include resolution.

**Blast radius:** All third-party library support, including tq-threads and any future user-approved SCAD libraries.

**Concrete fix path:** Add an engine test that creates a tiny external library, admits it, renders SCAD like `use <external/my-lib/helper.scad>; helper();` through the real OpenSCAD runner when the binary is present, and verifies the mesh exists. Add a web route test for `POST /api/libraries/admit` followed by design/render consumption if the app is expected to help the AI use admitted modules.

### TEST-006 - Minor - Live frontend integration test is useful but silently skips outside a prestarted engine

**Evidence:** `apps/ui/src/services/__tests__/engineLive.integration.test.ts:13-16` documents that the tests skip when the engine is not reachable. The selector `const live = engineUp && savedId ? it : it.skip` is at `apps/ui/src/services/__tests__/engineLive.integration.test.ts:71`.

**Why it matters:** This is honest, not deceptive, but it makes the live API proof easy to miss unless the gate deliberately starts the engine first.

**Concrete fix path:** Move this into a named live lane with a wrapper script that starts the engine, waits for health, runs just this file, and fails if the cases are skipped on the release/provisioned box.

### TEST-007 - Minor - Browser coverage is desktop-only

**Evidence:** `playwright.config.ts:22-31` defines one `system-chrome` project with a 1440x1000 viewport. The product has mobile/responsive promises in docs, but the root browser journey does not run mobile, tablet, or narrow-width coverage.

**Why it matters:** The newest design-spec rail is desktop-heavy, and the product has dense controls. Narrow layouts can regress without unit tests noticing.

**Concrete fix path:** Add at least one mobile Chromium project for core flows: start/build, view workflow status, open Make it real controls, and verify no horizontal overflow/overlap.

### TEST-008 - Minor - Skip count is large and needs explicit target-box accounting

**Evidence:** The walkthrough reports `1611 passed, 111 skipped` for engine pytest. The marker system is well documented in `packages/engine/tests/conftest.py:119-133`, but the final gate report does not enumerate whether each skipped class was expected on the target machine.

**Why it matters:** Many skips are legitimate environment gates. But at release time, "111 skipped" is only acceptable if the report says which skips are expected, which are upstream/tool-dependent, and which must be zero on the provisioned release box.

**Concrete fix path:** Capture `pytest -ra` output in the final proof folder and summarize skip reasons by marker/reason. For target-box gates, fail if release-required markers skip.

### TEST-009 - Minor - Installed native smoke does not prove clean first-run app-data

**Evidence:** `scripts/smoke-tauri-runtime.mjs:18-25` inherits the ambient `process.env`; the walkthrough says installed-app smoke used real local app data. No code in the smoke overrides app-data/home paths.

**Why it matters:** A successful installed smoke on a developer machine can be helped by already-initialized state. Beta users get a cold profile.

**Concrete fix path:** Add a `--profile-dir` or env-driven isolation mode to the smoke script, override app-data/home variables for the child, and assert first-run-created files appear under that temp profile.

### TEST-010 - Nit - `test:scripts` looks like a suite but is explicitly empty

**Evidence:** `package.json:29` prints "No script unit tests are currently defined."

**Why it matters:** This is not a product risk by itself, but it is confusing inside a gate command because it gives the appearance of a covered scripts lane.

**Concrete fix path:** Rename it to `test:scripts:placeholder`, remove it from validation, or add real tests for smoke/build helper scripts.

## What's Working

- The backend suite is substantial and not decorative: the current walkthrough records `1611 passed, 111 skipped`, with strong coverage around geometry, slicer, printer connectors, templates, settings, security, export, and webapp contracts.
- The UI Jest suite is broad: `93 suites passed, 1 skipped; 660 tests passed, 2 skipped`, and it covers many platform/service/component seams.
- The root Playwright test is now a real browser journey, not a mock-only test: `apps/ui/e2e/manufacturing-flow.spec.ts:32-107` builds, checks the design-spec rail, slices, sends through mock, records print outcome, and fails on console/API errors.
- The native smoke is a meaningful baseline: `scripts/smoke-tauri-runtime.mjs:63-85` invokes the real Tauri `ensure_engine` bridge and verifies sidecar health.
- The older pytest e2e harness has excellent isolation discipline and can be used as the model for the newer root Playwright lane (`packages/engine/tests/e2e/conftest.py:98-123`).
- New library tests correctly pin the sandbox-copy and sanitizer basics (`packages/engine/tests/test_external_libraries.py:7-43`).

## Required Next Test Work Before Calling This Done

1. Make the authoritative gate command actually run the full product-relevant suite.
2. Isolate app/user state for root Playwright and native smoke.
3. Add native installed workflow smoke beyond health/start-surface.
4. Add App-level autonomous VCL regression tests.
5. Add external library real-render proof.
6. Capture and classify skip reasons in the final proof folder.

## Summary

The test base is much stronger than it was, and the newest browser proof catches the core build/slice/send path. The remaining risk is concentrated in acceptance wiring: root validation is partial, root Playwright is not isolated, native smoke is shallow, VCL is not behavior-pinned, and external libraries are not render-proven end to end. Fix those and the test posture becomes release-grade rather than "strong engine, partial product proof."
