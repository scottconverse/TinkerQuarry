# TinkerQuarry Status Matrix

**As of:** 2026-06-23

This is the current source of truth for the canonical `tinkerquarry` product repo. It supersedes prior
"done", "clear to advance", and manual-only verification claims.

## One-Line Truth

TinkerQuarry's beta core flow is now real and verified for the happy path:

Describe a part in plain English -> local KimCad engine designs it -> Studio viewer renders it -> Make
it real slices it to printable G-code -> mock Send records a simulated outcome.

The native Windows app now also builds and smoke-tests from both the release executable and the
installed NSIS copy.

This is not final v1. The remaining gaps are concentrated in richer Explain/diff features, mobile
and error-path browser coverage, hardware connector proof, and polish.

## Verification Honesty

The engine has genuine automated coverage: in-process HTTP, real OpenSCAD, render-on-tune,
slice-to-G-code, save/reopen/source round-trip, live marker coverage, and real-tool marker coverage.

The previous browser blind spot is partly closed. `pnpm test:e2e:web` is a committed Playwright
happy-path test that boots the current app against the demo engine, prompts/builds, reaches the
design-ready state, opens Make it real, handles first-real caution, slices, reaches Ready to print,
sends through the mock connector, and records a simulated outcome.

`pnpm test:e2e:tauri` is a committed native-runtime smoke that launches the built Tauri app, invokes
`ensure_engine`, checks engine health, and verifies the UI surface. The smoke script also supports an
isolated profile plus native build/slice/send workflow mode. The NSIS-installed copy has passed the
startup smoke; the isolated workflow lane must be kept green before a beta release claim.

This is still not a full UI matrix. Mobile/narrow layouts, broad keyboard/accessibility traversal,
hardware connector outcomes, and every error path remain outside the automated browser coverage.

## P0 Beta Status

| Area                                     | Status              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical repo                           | verified            | `tinkerquarry` is the product repo. `KimCadClaude` remains separate.                                                                                                                                                                                                                                                                                                                                                                                          |
| Prompt -> engine design -> Studio viewer | verified            | The app is wired to the local engine and renders generated SCAD in Studio.                                                                                                                                                                                                                                                                                                                                                                                    |
| Make it real                             | verified            | Fresh designs can slice to printable output. "Ready to print" is only shown after a successful slice.                                                                                                                                                                                                                                                                                                                                                         |
| Send/outcome                             | verified happy path | UI sends through the selected connector after a fresh slice. Simulated send provenance is stored and shown honestly. Mock Send -> outcome is covered by Playwright. Hardware connector browser coverage remains separate.                                                                                                                                                                                                                                     |
| Native Windows packaging                 | verified            | Rust/MSVC toolchain installed, `pnpm --dir apps\ui tauri build` passes, MSI/NSIS artifacts are produced, and release + installed NSIS smoke tests pass.                                                                                                                                                                                                                                                                                                       |
| OpenSCAD Studio absorption               | working             | Studio is forked into `apps/ui`, branded, telemetry off, and wired to the TinkerQuarry engine flow.                                                                                                                                                                                                                                                                                                                                                           |
| Design-spec workflow                     | verified happy path | The app has the AI/design surface, viewer, right-side Customize / Make it real rail, orientation controls, Make it real, Send, and outcome path. The live Playwright flow asserts the rail and iteration log are visible. More layout polish remains.                                                                                                                                                                                                         |
| Code view/editor                         | working             | Engine-generated SCAD is visible/editable in Monaco. Manual edits are blocked from stale slicing until re-gated.                                                                                                                                                                                                                                                                                                                                              |
| Viewer                                   | working             | Studio viewer provides practical CAD inspection surfaces and offscreen capture support.                                                                                                                                                                                                                                                                                                                                                                       |
| Visual Correction Loop                   | partial, real       | Advisory local probe-mode v1 exists. The default local critic is `qwen2.5vl:7b` in decomposed probe mode; optional agreement mode uses `qwen2.5vl:7b` + `minicpm-v:8b`, and `qwen3-vl:8b` remains the best-quality selectable local critic from the audit. Beta probe accuracy bar is 90%. The UI now runs a bounded autonomous review/correction pass after generated designs, keeps/restores the best candidate on regression, records provenance in the iteration log, and still supports manual Fix visual issue. Empty/unparseable model answers become `needs review`, not pass. A full before/after visual diff viewer and metrology-grade vision are not done. |
| Bundled SCAD libraries                   | implemented         | BOSL2, Round-Anything, YAPP_Box, and gridfinity-rebuilt are vendored with attribution. First-party `library/threads.scad` wraps BOSL2 threading for printable rods, holes, metric bolts, and nuts. Catch'n'Hole, vendored MCAD, and vendored tq-threads were removed from the bundled set to keep the beta payload smaller. Dan Kirshner `threads.scad` is intentionally excluded because the available source is GPL-3.0-or-later.                                                                                                                           |
| External-library admission               | implemented         | Settings now admits user-installed SCAD libraries through consent -> sandbox copy -> manifest -> `external/<slug>/` include prefix. The OpenSCAD sanitizer allows only `library/` and admitted sandbox `external/<slug>/` includes. Public API responses redact local source/sandbox paths, admission is serialized/atomic in-process, docs-only folders are rejected, and a real OpenSCAD render test proves admitted includes resolve.                      |
| Licensing/about                          | implemented         | GPL/source availability and third-party notices are present in-app.                                                                                                                                                                                                                                                                                                                                                                                           |

## P1 / V1 Gaps

| Area                  | Status  | Notes                                                                                                                                                                                                     |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Full Explain mode     | partial | Current explain surface is a concise readiness/design summary, not a full rationale panel.                                                                                                                |
| Agent loop            | partial | Refine-in-context exists; a true multi-tool agent loop remains unfinished.                                                                                                                                |
| Iteration log/history | working | Save/reopen, rename, duplicate, delete, Undo, and a persistent session iteration transcript exist. Snapshot entries can restore prior candidates. Server-side branching/version tree remains future work. |
| Visual diff           | partial | Lightweight pixel-change percentage exists after visual correction. A full before/after viewer remains unfinished.                                                                                        |
| Export coverage       | working | `.scad`, STL, OBJ, AMF, 3MF, SVG, DXF, PNG preview, STEP when the engine offers it, and portable `.kimcad` import/export are available.                                                                   |
| Accessibility         | partial | Several surfaces have automated a11y checks and fixes. Full workspace keyboard/focus/contrast/SR pass remains unfinished.                                                                                 |
| Browser test breadth  | partial | Happy-path desktop web e2e exists. Mobile/narrow, hardware, accessibility traversal, broad export, and error paths remain to be expanded.                                                                 |

## Latest Verification

Run from `C:\Users\Scott\Desktop\CODE\tinkerquarry` unless noted.

| Command                                                                                                                                        | Result                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm -r lint`                                                                                                                                 | passed                                                                                       |
| `pnpm -r type-check`                                                                                                                           | passed                                                                                       |
| `node --experimental-vm-modules --no-warnings node_modules/jest/bin/jest.js --runInBand` from `apps\ui`                                        | 93 suites passed, 1 skipped; 660 tests passed, 2 skipped; existing React `act(...)` warnings |
| `pnpm test:web:unit`                                                                                                                           | 4 suites passed; 16 tests passed                                                             |
| `.\.venv\Scripts\python.exe -m pytest tests\test_external_libraries.py -q` from `packages\engine`                                              | 6 passed; includes real OpenSCAD render through an admitted external library                 |
| `pnpm test:e2e:web apps/ui/e2e/manufacturing-flow.spec.ts --project=system-chrome`                                                             | 1 passed; now runs with isolated temp app-data/home variables                                |
| `cmd /c "call ...\LaunchDevCmd.bat -arch=x64 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && pnpm.cmd tauri:build"`                             | passed; MSI and NSIS artifacts produced                                                      |
| `node scripts/smoke-tauri-runtime.mjs`                                                                                                         | passed against release executable                                                            |
| `node scripts/smoke-tauri-runtime.mjs --exe="%TEMP%\TQSmokeInstall\openscad-studio.exe"`                                                       | passed against installed NSIS copy                                                           |
| `node scripts/smoke-tauri-runtime.mjs --exe="%TEMP%\TQSmokeInstall\openscad-studio.exe" --isolated-profile="%TEMP%\TQSmokeProfile" --workflow` | script lane implemented; must pass in final release gate                                     |
| `cargo test --manifest-path apps\ui\src-tauri\Cargo.toml`                                                                                      | 10 passed                                                                                    |
| `.\.venv\Scripts\python.exe -m pytest -q` from `packages\engine`                                                                               | 1611 passed, 111 skipped                                                                     |
| First-party BOSL2-backed thread wrapper + kept Gridfinity render proof                                                                         | 4/4 passed                                                                                   |

## Run

Two-terminal dev mode:

```powershell
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765
```

```powershell
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev
```

Then open `http://localhost:1420`.

## Related Documents

- [EVALUATE.md](EVALUATE.md)
- [HANDOFF-TO-CODEX.md](HANDOFF-TO-CODEX.md) - historical 2026-06-22 handoff, superseded for current status
- [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md)
- [audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md)
