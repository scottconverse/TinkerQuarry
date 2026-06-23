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

This is not final v1. The remaining gaps are concentrated in the full autonomous Visual Correction
Loop, external library admission, richer iteration/explain/diff features, broader UI coverage, and
polish.

## Verification Honesty

The engine has genuine automated coverage: in-process HTTP, real OpenSCAD, render-on-tune,
slice-to-G-code, save/reopen/source round-trip, live marker coverage, and real-tool marker coverage.

The previous browser blind spot is partly closed. `pnpm test:e2e:web` is a committed Playwright
happy-path test that boots the current app against the demo engine, prompts/builds, reaches the
design-ready state, opens Make it real, handles first-real caution, slices, reaches Ready to print,
sends through the mock connector, and records a simulated outcome.

`pnpm test:e2e:tauri` is a committed native-runtime smoke that launches the built Tauri app, invokes
`ensure_engine`, checks engine health, and verifies the UI surface. The NSIS-installed copy has also
passed the same smoke.

This is still not a full UI matrix. Mobile/narrow layouts, broad keyboard/accessibility traversal,
hardware connector outcomes, every export path, and every error path remain outside the automated
browser coverage.

## P0 Beta Status

| Area | Status | Notes |
|---|---|---|
| Canonical repo | verified | `tinkerquarry` is the product repo. `KimCadClaude` remains separate. |
| Prompt -> engine design -> Studio viewer | verified | The app is wired to the local engine and renders generated SCAD in Studio. |
| Make it real | verified | Fresh designs can slice to printable output. "Ready to print" is only shown after a successful slice. |
| Send/outcome | verified happy path | UI sends through the selected connector after a fresh slice. Simulated send provenance is stored and shown honestly. Mock Send -> outcome is covered by Playwright. Hardware connector browser coverage remains separate. |
| Native Windows packaging | verified | Rust/MSVC toolchain installed, `pnpm --dir apps\ui tauri build` passes, MSI/NSIS artifacts are produced, and release + installed NSIS smoke tests pass. |
| OpenSCAD Studio absorption | working | Studio is forked into `apps/ui`, branded, telemetry off, and wired to the TinkerQuarry engine flow. |
| Design-spec workflow | working | The app has the AI/design surface, viewer, Customize rail, orientation controls, Make it real, Send, and outcome path. More layout polish remains. |
| Code view/editor | working | Engine-generated SCAD is visible/editable in Monaco. Manual edits are blocked from stale slicing until re-gated. |
| Viewer | working | Studio viewer provides practical CAD inspection surfaces and offscreen capture support. |
| Visual Correction Loop | partial | Advisory local probe-mode v1 exists. Default candidates include `qwen3-vl:8b`, `qwen2.5vl:7b`, and `minicpm-v:8b`; beta probe accuracy bar is 90%. The UI can run visual review, show review state/log, and route agreed issues through bounded user-triggered refinement with Undo and a lightweight visual-change percentage. The full autonomous PRD-level correction policy and full before/after visual diff viewer remain unfinished. |
| Bundled SCAD libraries | implemented | BOSL2, Round-Anything, YAPP_Box, Catch'n'Hole, gridfinity-rebuilt, MCAD, and clean-room MIT `tq-threads` are vendored with attribution. `tq-threads` is pinned to v0.5.0 commit `bf4ac59028997fb111a2ae598fa71137b5e1e58a`. Dan Kirshner `threads.scad` is intentionally excluded because the available source is GPL-3.0-or-later. |
| External-library admission | missing | Consent -> sandbox copy -> include path -> sanitization flow is not wired yet. |
| Licensing/about | implemented | GPL/source availability and third-party notices are present in-app. |

## P1 / V1 Gaps

| Area | Status | Notes |
|---|---|---|
| Full Explain mode | partial | Current explain surface is a concise readiness/design summary, not a full rationale panel. |
| Agent loop | partial | Refine-in-context exists; a true multi-tool agent loop remains unfinished. |
| Iteration log/history | partial | Save/reopen, rename, duplicate, delete, and Undo exist. A persistent per-iteration transcript/log remains unfinished. |
| Visual diff | partial | Lightweight pixel-change percentage exists after visual correction. A full before/after viewer remains unfinished. |
| Export coverage | partial | `.scad`, STL, OBJ, AMF, 3MF, SVG, and DXF are available. PNG export is not currently offered. |
| Accessibility | partial | Several surfaces have automated a11y checks and fixes. Full workspace keyboard/focus/contrast/SR pass remains unfinished. |
| Browser test breadth | partial | Happy-path desktop web e2e exists. Mobile/narrow, hardware, accessibility traversal, broad export, and error paths remain to be expanded. |

## Latest Verification

Run from `C:\Users\Scott\Desktop\CODE\tinkerquarry` unless noted.

| Command | Result |
|---|---|
| `pnpm -r lint` | passed |
| `pnpm -r type-check` | passed |
| `pnpm test:unit` | 93 suites passed, 1 skipped; 657 tests passed, 2 skipped; existing React `act(...)` warnings |
| `pnpm test:web:unit` | 4 suites passed; 16 tests passed |
| `pnpm test:e2e:web` | 1 passed |
| `pnpm --dir apps\ui tauri build` | passed; MSI and NSIS artifacts produced |
| `pnpm test:e2e:tauri` | passed against release executable |
| `pnpm test:e2e:tauri -- --exe="%TEMP%\TinkerQuarryInstallSmoke\openscad-studio.exe"` | passed against installed NSIS copy |
| `cargo test --manifest-path apps\ui\src-tauri\Cargo.toml` | 10 passed |
| `.\.venv\Scripts\python.exe -m pytest tests\e2e -q` from `packages\engine` | 21 passed |
| `.\.venv\Scripts\python.exe -m pytest tests -m "not live" -q` from `packages\engine` | 1592 passed, 11 skipped, 116 deselected |
| `.\.venv\Scripts\python.exe -m pytest tests -m live -q` from `packages\engine` | 16 passed, 100 skipped, 1603 deselected |
| `.\.venv\Scripts\python.exe -m pytest tests -m real_tool -q` from `packages\engine` | 199 passed, 1520 deselected |
| `tq-threads` render proof | 27/27 passed |

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
- [HANDOFF-TO-CODEX.md](HANDOFF-TO-CODEX.md)
- [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md)
- [audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md)
