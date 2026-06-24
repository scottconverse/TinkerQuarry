# TinkerQuarry Status Matrix

**As of:** 2026-06-24
**Product release:** v1.3.1
**Current clean-gate marker:** `gauntletgate-2026-06-24-rerun-clean-2`

This is the current source of truth for the canonical `tinkerquarry` product repo. It supersedes prior
"done", "clear to advance", and manual-only verification claims.

## One-Line Truth

TinkerQuarry's beta core flow is real and verified:

Describe a part in plain English -> local KimCad engine designs it -> Studio viewer renders it -> Make
it real slices it to printable G-code -> mock Send records a simulated outcome.

The native Windows app now also builds and smoke-tests from both the release executable and the
installed NSIS copy. The packaged executable is `tinkerquarry.exe`.

The published v1.3.1 release remains the shipped beta artifact. The current `main` branch has an
additional post-release GauntletGate clean pass that closes follow-up audit findings. The gate uses
the built-in simulated connector for repeatable send/outcome proof.

## Verification Honesty

The engine has genuine automated coverage: in-process HTTP, real OpenSCAD, render-on-tune,
slice-to-G-code, save/reopen/source round-trip, live marker coverage, and real-tool marker coverage.

The previous browser blind spot is closed for the release-critical path. `pnpm test:e2e:web` is committed Playwright
coverage that boots the current app against the demo engine, prompts/builds, reaches the
design-ready state, opens Make it real, handles first-real caution, slices, reaches Ready to print,
sends through the mock connector, records a simulated outcome, walks the desktop workspace controls,
checks key menu/dialog accessibility wiring, verifies stale manual-code edits are refused before
slicing, and smoke-tests a mobile/narrow viewport.

`pnpm test:e2e:tauri` is a committed native-runtime smoke that launches the built Tauri app, invokes
`ensure_engine`, checks engine health, and verifies the UI surface. `pnpm test:e2e:tauri:installed`
installs the current NSIS artifact into a temp directory, launches it with an isolated profile, and
drives the native build/slice/send workflow through the mock connector.

Additional exploratory UI testing is useful after release, but the automated browser suite now covers
the product promises that gate this beta.

## P0 Beta Status

| Area                                     | Status              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Canonical repo                           | verified            | `tinkerquarry` is the product repo. `KimCadClaude` remains separate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Prompt -> engine design -> Studio viewer | verified            | The app is wired to the local engine and renders generated SCAD in Studio.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Make it real                             | verified            | Fresh designs can slice to printable output. "Ready to print" is only shown after a successful slice.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| Send/outcome                             | verified happy path | UI sends through the selected connector after a fresh slice. Simulated send provenance is stored and shown honestly. Mock Send -> outcome is covered by Playwright. Hardware connector browser coverage remains separate.                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Native Windows packaging                 | verified            | Rust/MSVC toolchain installed, `pnpm --dir apps\ui tauri build` passes, MSI/NSIS artifacts are produced, the packaged executable is `tinkerquarry.exe`, and release + installed NSIS smoke tests pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| OpenSCAD Studio absorption               | working             | Studio is forked into `apps/ui`, branded, telemetry off, and wired to the TinkerQuarry engine flow.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Design-spec workflow                     | verified            | The app has the AI/design surface, viewer, right-side Customize / Make it real rail, orientation controls, Explain panel, Make it real, Send, and outcome path. The live Playwright flow asserts the rail, explanation, and iteration log are visible.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Code view/editor                         | working             | Engine-generated SCAD is visible/editable in Monaco. Manual edits are blocked from stale slicing until re-gated.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| Viewer                                   | working             | Studio viewer provides practical CAD inspection surfaces and offscreen capture support.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| Visual Correction Loop                   | implemented         | Advisory local probe-mode v1 exists. The default local critic is `qwen2.5vl:7b` in decomposed probe mode; optional agreement mode uses `qwen2.5vl:7b` + `minicpm-v:8b`, and `qwen3-vl:8b` remains the best-quality selectable local critic from the audit. Beta probe accuracy bar is 90%. The UI runs a bounded autonomous review/correction pass after generated designs, keeps/restores the best candidate on regression, records provenance in the iteration log, supports manual Fix visual issue, and shows before/after visual diff evidence when a correction changes the preview. Empty/unparseable model answers become `needs review`, not pass. |
| Bundled OpenSCAD                         | implemented         | Windows tool fetching now pins OpenSCAD `2026.03.16` by SHA-256 and defaults renders to the Manifold backend, with a documented CGAL fallback switch. The staged install tree reports `OpenSCAD version 2026.03.16` and passes install verification.                                                                                                                                                                                                                                                                                                                                                                                                        |
| Bundled SCAD libraries                   | implemented         | BOSL2, Round-Anything, YAPP_Box, and gridfinity-rebuilt are vendored with attribution. First-party `library/threads.scad` wraps BOSL2 threading for printable rods, holes, metric bolts, and nuts. Catch'n'Hole, vendored MCAD, and vendored tq-threads were removed from the bundled set to keep the beta payload smaller. Dan Kirshner `threads.scad` is intentionally excluded because the available source is GPL-3.0-or-later. The kept library smoke proofs render under OpenSCAD `2026.03.16` Manifold.                                                                                                                                              |
| External-library admission               | implemented         | Settings now admits user-installed SCAD libraries through consent -> sandbox copy -> manifest -> `external/<slug>/` include prefix. The OpenSCAD sanitizer allows only `library/` and admitted sandbox `external/<slug>/` includes. Public API responses redact local source/sandbox paths, admission is serialized/atomic in-process, docs-only folders are rejected, and a real OpenSCAD render test proves admitted includes resolve.                                                                                                                                                                                                                    |
| Licensing/about                          | implemented         | GPL/source availability and third-party notices are present in-app.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

## P1 / V1 Gaps

| Area                  | Status  | Notes                                                                                                                                                                                                     |
| --------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Explain panel         | working | The right rail explains the generated design, readiness gate, VCL state, slice proof, and why Send is enabled or disabled. A richer/full Explain workflow remains future work.                            |
| Agent loop            | partial | Refine-in-context exists; a true multi-tool agent loop remains unfinished.                                                                                                                                |
| Iteration log/history | working | Save/reopen, rename, duplicate, delete, Undo, and a persistent session iteration transcript exist. Snapshot entries can restore prior candidates. Server-side branching/version tree remains future work. |
| Visual diff           | working | Lightweight pixel-change percentage and before/after preview evidence are shown after visual correction. Deeper/full visual diff workflows remain future work.                                            |
| Export coverage       | working | `.scad`, STL, OBJ, AMF, 3MF, SVG, DXF, PNG preview, STEP when the engine offers it, and portable `.kimcad` import/export are available.                                                                   |
| Accessibility         | partial | Several surfaces have automated a11y checks and fixes. Full workspace keyboard/focus/contrast/SR pass remains unfinished.                                                                                 |
| Browser test breadth  | working | Desktop core-flow e2e, Explain panel checks, stale-edit refusal, workspace-control traversal, menu/dialog keyboard checks, export dialog coverage, and mobile boot/no-horizontal-overflow smoke exist.    |

## Latest Verification

Run from `C:\Users\Scott\Desktop\CODE\tinkerquarry` unless noted.

| Command                                                                                                            | Result                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| `pnpm -r lint`                                                                                                     | passed                                                                                                         |
| `pnpm -r type-check`                                                                                               | passed                                                                                                         |
| `node --experimental-vm-modules --no-warnings node_modules/jest/bin/jest.js --runInBand` from `apps\ui`            | 94 suites passed, 1 skipped; 662 tests passed, 2 skipped; existing React `act(...)` warnings                   |
| `pnpm test:web:unit`                                                                                               | 4 suites passed; 16 tests passed                                                                               |
| `.\.venv\Scripts\python.exe -m pytest tests\test_external_libraries.py -q` from `packages\engine`                  | 6 passed; includes real OpenSCAD render through an admitted external library                                   |
| `pnpm test:e2e:web`                                                                                                | covers core manufacturing flow, workspace walkthrough, stale edit refusal, and mobile/narrow smoke             |
| `cmd /c "call ...\LaunchDevCmd.bat -arch=x64 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && pnpm.cmd tauri:build"` | passed; MSI and NSIS artifacts produced                                                                        |
| `node scripts/smoke-tauri-runtime.mjs`                                                                             | passed against release executable                                                                              |
| `pnpm test:e2e:tauri:installed`                                                                                    | passed against installed NSIS copy with isolated profile and native build/slice/send workflow                  |
| `cargo test --manifest-path apps\ui\src-tauri\Cargo.toml`                                                          | 10 passed                                                                                                      |
| `.\.venv\Scripts\python.exe -m pytest tests -q` from `packages\engine`                                             | 1627 passed, 111 skipped                                                                                       |
| OpenSCAD 2026 Manifold render smoke                                                                                | 5/5 passed: 3MF cube, threaded rod, threaded hole, Gridfinity base, VCL fixture                                |
| Boolean-heavy threaded part render comparison                                                                      | OpenSCAD 2021.01: 4.08s; OpenSCAD 2026.03.16 Manifold: 0.41s                                                   |
| `.\.venv\Scripts\python.exe scripts\build_installer.py --stage-only --skip-pip` from `packages\engine`             | passed; staged checksum-pinned OpenSCAD, OrcaSlicer, and PrintProof3D                                          |
| `dist\staging\tools\openscad\openscad.exe --version` from `packages\engine`                                        | `OpenSCAD version 2026.03.16`                                                                                  |
| `.\.venv\Scripts\python.exe scripts\verify_install.py dist\staging --port 8743` from `packages\engine`             | `VERIFY-INSTALL: ALL GREEN`                                                                                    |
| First-party BOSL2-backed thread wrapper + kept Gridfinity render proof                                             | 4/4 passed                                                                                                     |
| `pnpm test:release` from repo root                                                                                 | passed before v1.3.1 publication; includes gate, browser e2e, native build, release smoke, installed-app smoke |

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
- [USER-MANUAL.md](USER-MANUAL.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [HANDOFF-TO-CODEX.md](HANDOFF-TO-CODEX.md) - historical 2026-06-22 handoff, superseded for current status
- [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md)
- [audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md)
