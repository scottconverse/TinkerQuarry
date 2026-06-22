# Test Engineer deep dive - GauntletGate Full

**Role:** Test Engineer  
**Commit audited:** `0b13cb2d8725a5453496bca37a277c0e30d8df55`  
**Lane mode:** Full role pass, degraded/sequential context. Product source was not modified.  
**Severity counts:** Blocker 0 / Critical 0 / Major 4 / Minor 2 / Nit 0

## Commands run

- `node ... jest --runTestsByPath src\services\__tests__\engineLive.integration.test.ts --runInBand --no-cache` -> **1 suite skipped, 2 tests skipped** because the live engine/saved design precondition was not met.
- `.\.venv\Scripts\python.exe -m pytest tests\e2e -q -ra` -> **21 skipped**; `needs_browser: Playwright Chromium not installed`.
- `.\.venv\Scripts\python.exe -m pytest tests\test_integration_send_flow.py -q -ra` -> **1 passed, 1 skipped**; the live render -> gate -> slice -> send path ran, watchdog respawn remains manual-only.
- `.\.venv\Scripts\python.exe -m pytest tests\test_webapp.py::test_live_web_design_then_slice_then_download -q -ra` -> **1 passed**.
- `node ... jest --runInBand --no-cache` for the full `apps/ui` suite -> **timed out after ~184s**; no pass/fail claim made from that run.

## Findings

### TST-001 - Browser E2E coverage exists but was entirely skipped in this audit

**Severity:** Major  
**Category:** Browser/integration coverage reality

**Evidence:** The repo has 7 Python E2E files under `packages/engine/tests/e2e`, and `test_export_gate.py:1-17` explicitly covers the real demo SPA export path with real OpenSCAD/OrcaSlicer. However, the actual audit run of `pytest tests\e2e -q -ra` produced `21 skipped`; the skip reason was `packages/engine/tests/conftest.py:127-128` (`needs_browser: Playwright Chromium not installed`). The README's default engine test command also says to run `pytest tests\ --ignore=tests\e2e -q` (`README.md:73-75`), so the documented local path excludes this high-value browser lane.

**Impact / blast radius:** A green local run can still leave the browser journey unproven: describe -> render -> export, gate-fail refusal, settings/design routes, and mobile/version flows. This is not a theoretical unit gap; the skipped files are exactly the tests meant to catch SPA wiring breaks.

**Fix:** Make the advancement gate install/probe Playwright Chromium before pytest, run `tests/e2e`, and publish the skip summary as an artifact. If local docs keep an inner-loop command that ignores E2E, label it as non-release.

**Test:** Re-run `.\.venv\Scripts\python.exe -m playwright install chromium`, then `.\.venv\Scripts\python.exe -m pytest tests\e2e -q -ra` and require **0 skipped** on the provisioned gate box.

### TST-002 - `apps/ui/src/App.tsx` orchestration is still not mounted by any Jest test

**Severity:** Major  
**Category:** Regression risk / front-end product flow coverage

**Evidence:** `apps/ui/src/App.test.tsx` and `apps/ui/src/__tests__/App.test.tsx` are absent. `jest --listTests --no-cache` found 93 app test files, but the grep for `render(<App` / `@/App` did not find an App mount. The unmounted code owns high-risk product behavior: reopen-to-workspace (`App.tsx:840-849` calling `reopenIntoStudio`, implemented at `engineDocument.ts:132-149`), persisted printer/material choice (`App.tsx:970-979`, `2824-2861`), and the first-real-print/make-it-real gate (`App.tsx:2894-2907`, `3035-3037`).

**Impact / blast radius:** Component and service tests can be green while the actual application shell fails to connect them. This is the same class of bug as "service stub passes, real reopen/source path fails": state transitions, disabled buttons, localStorage, toasts, and callbacks live in `App.tsx`.

**Fix:** Add at least one mounted `App` test with mocked engine/service boundaries for the core happy path and critical state transitions, or drive the shipped `apps/ui` Vite shell with Playwright.

**Test:** Mount `App`, complete a mocked describe result, assert viewer/source state is populated, printer/material selection persists, first-real-print dialog gates the first slice, and reopen pushes source into the active document.

### TST-003 - Coverage gates are whitelist-based, so broad product coverage can regress silently

**Severity:** Major  
**Category:** Coverage gate shortcut

**Evidence:** Root scripts run UI coverage only for five named files (`package.json:15`) and web coverage for three named tests (`package.json:18`). The Jest config collects all source files (`apps/ui/jest.config.cjs:45-51`) but enforces thresholds only for a few modules (`apps/ui/jest.config.cjs:53-74` and continuing), excluding `App.tsx`, export orchestration, engine document orchestration, and most components from any minimum.

**Impact / blast radius:** `pnpm test:unit:coverage` can pass while the most important product-flow code has zero coverage. This undermines any claim that coverage numbers represent the application rather than selected hotspots.

**Fix:** Replace the whitelist coverage script with a normal full-suite coverage run and add global floors plus targeted floors for `App.tsx`, engine document orchestration, export/make-real, and first-run/onboarding code.

**Test:** `pnpm.cmd test:unit:coverage` should execute the full app/web test corpus and fail if `App.tsx` or the engine-facing orchestration drops below agreed thresholds.

### TST-004 - The live API Jest test is non-hermetic and skipped by default without seeded state

**Severity:** Major  
**Category:** Integration test reliability

**Evidence:** `engineLive.integration.test.ts` is commendably explicit that it "does NOT mount `App.tsx`, click the UI, render React, or POST a fresh `/api/design`" (`apps/ui/src/services/__tests__/engineLive.integration.test.ts:5-8`). It also selects `it.skip` unless both the engine is reachable and `/api/designs` has at least one saved design (`:29-41`). The audit run skipped both tests.

**Impact / blast radius:** The only live API seam test in the app suite can disappear from the signal on a clean machine, and it depends on prior saved data rather than constructing its own fixture. That means `/api/design` creation, first-use source availability, and UI consumption remain under-proven.

**Fix:** Convert it into a hermetic live test: start or require a known engine fixture, create a design in the test setup, then reopen/source/slice that design. If it cannot start the engine, fail in release mode rather than silently skipping.

**Test:** Run on a clean profile with no saved designs; the test should create its own design and pass, not skip.

### TST-005 - Managed-engine self-heal remains a manual-only skip

**Severity:** Minor  
**Category:** Dependency-absent / first-run regression risk

**Evidence:** `test_integration_send_flow.py:155-178` intentionally skips the real watchdog respawn test and documents a manual procedure. The same targeted run showed **1 skipped** for this reason. There is hermetic unit coverage for watchdog decisions, but not the real kill -> respawn -> subsequent design success path.

**Impact / blast radius:** If the actual managed Ollama process supervision breaks, first-run/dependency recovery could regress while unit tests remain green. The skip is honest, so this is a coverage debt rather than a hidden failure.

**Fix:** Add a quarantined/live Windows test that launches the managed engine against an isolated port/process name, kills it, waits for watchdog recovery, and proves a follow-up model/status call succeeds.

**Test:** A `live`/`windows_only` watchdog E2E that is required for release lanes and explicitly skipped only for non-release local runs.

### TST-006 - One catalogued printer profile is permanently skipped in live slice coverage

**Severity:** Minor  
**Category:** Printer matrix coverage

**Evidence:** `test_slicer.py:561-581` live-slices representative printer profiles, but `elegoo_neptune_4_max` is marked skipped because the upstream OrcaSlicer profile is invalid (`test_slicer.py:572-577`). The lower-level live slice command I attempted with the wrong old test name did not run a sample-profile case, but the source-level skip is explicit.

**Impact / blast radius:** The profile is blocked honestly, but any product/docs claim that this exact printer is live-proven would be false until the skip is removed or the profile is excluded from supported sliceable choices.

**Fix:** Keep it disabled in UI/catalog metadata with the profile note, or patch/vendor a fixed profile and unskip the live slice case.

**Test:** Re-enable `elegoo_neptune_4_max` in `test_live_slice_box_produces_proven_gcode` and require a real motion-bearing G-code proof.

## What's working

- The engine has substantial real integration coverage: `test_webapp.py::test_live_web_design_then_slice_then_download` passed in this audit, and `test_integration_send_flow.py` proved render -> gate -> real OrcaSlicer slice -> mock send plus fail-closed behavior.
- The browser E2E suite is not imaginary. It drives a real `kimcad web --demo` server with real browser automation; it was skipped here because Chromium was missing, not because the tests are only stubs.
- The test code is unusually honest about scope. `engineLive.integration.test.ts` states exactly what it does not cover, and the skipped watchdog test documents the manual procedure rather than pretending it passed.
- Skip taxonomy is explicit and centralized (`real_tool`, `needs_browser`, `needs_cadquery`, etc. in `packages/engine/tests/conftest.py:118-128`), and `packages/engine/scripts/ci.sh:61-63` has a strict mode that can fail on skips when enabled.
- README truthfulness is better than the old audit baseline: it says front-end product flows are mostly manually verified and browser-level coverage is still missing from the documented local path (`README.md:19`, `README.md:30`).
