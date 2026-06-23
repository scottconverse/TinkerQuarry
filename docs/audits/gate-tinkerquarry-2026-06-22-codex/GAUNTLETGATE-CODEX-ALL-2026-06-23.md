# GauntletGate Codex All Follow-Up

Date: 2026-06-23
Repo: `C:\Users\Scott\Desktop\CODE\tinkerquarry`

## Verdict

Beta recovery gate: **PASS for the verified lanes in this report.**

The previous blockers for native packaging and durable browser proof are closed:

- Native Windows Tauri build completed.
- MSI and NSIS artifacts were produced.
- The release executable passed native runtime smoke.
- The installed NSIS copy passed native runtime smoke.
- A committed Playwright test now covers the core browser flow through mock Send and simulated outcome.

This does not claim final v1 completeness. Remaining work is tracked as product scope, not as a hidden
proof gap: full autonomous VCL policy, external-library admission, richer explain/iteration/diff,
broader UI coverage, and polish.

## Fixed In This Pass

- First-run welcome now shows local AI status/setup and does not leave the user in a dead Build path
  when the engine/model is unavailable.
- Workspace describe/refine is no longer blocked by a cloud API-key wall; cloud keys remain optional
  chooser inputs.
- Make-it-real fails closed when slice profiles are not loaded and no longer silently defaults
  printer/material.
- Manual code edits are blocked before slicing instead of being sliced from stale engine geometry.
- The first-real-print flag is written only after a successful slice.
- VCL model selection is allowlisted/capped and defaults to the best local probe candidates.
- Public share reads enforce stored size metadata, bounded decompression, and validated project
  payload shape.
- Python runtime lock restored with Bambu + serial connector extras and tested `numpy`/`scipy`
  constraints.
- Minimal GitHub Actions CI added for UI lint/type/focused tests, web build/share tests, and the
  engine non-live lane.
- Missing engine repo fixtures/contracts restored or made explicit: Appendix-B `bench/prompts.yaml`,
  installer `kimcad.iss`, fresh printer-catalog proof, and legacy SPA skips.
- Library manifest mapping now uses first-wins semantics so local TinkerQuarry helpers are not
  shadowed by later vendor modules.
- Trust-boundary static test now resolves the CadQuery worker path from the test file instead of the
  shell working directory.
- `tq-threads` vendored at upstream `v0.5.0` commit `bf4ac59028997fb111a2ae598fa71137b5e1e58a`.
- Tauri config now has an explicit CSP instead of `null`, and the default capability no longer grants
  blanket `fs:default`.
- Release desktop builds now require a staged/bundled engine resource unless
  `TINKERQUARRY_ENGINE_BIN` is explicitly set; debug builds keep local fallback behavior.
- Desktop engine stdout/stderr are routed to an app-data log file instead of being discarded.
- Native startup no longer hangs indefinitely on MCP bridge initialization; it times out and continues
  to the usable app surface.
- VCL evidence is visible in the workspace as a first-class rail: visual review state,
  visual-diff state, bounded correction count, and recent review log.
- The workspace has an explicit manufacturing workflow rail for Customize -> Orient -> Slice -> Send,
  backed by tested state logic.
- Send/outcome provenance is explicit: simulated sends are recorded and labeled as simulated; hardware
  sends remain distinguishable.
- Durable Playwright web e2e was added for Build -> Make it real -> Slice -> mock Send -> outcome.
- Durable native Tauri smoke was added for release/runtime validation.

## Verification

| Command | Result |
|---|---|
| `pnpm.cmd -r lint` | passed |
| `pnpm.cmd -r type-check` | passed |
| `pnpm.cmd test:unit` | 93 suites passed, 1 skipped; 657 passed, 2 skipped; existing React `act(...)` warnings |
| `pnpm.cmd test:web:unit` | 4 suites passed; 16 passed |
| `pnpm.cmd test:e2e:web` | 1 passed |
| `cargo test --manifest-path apps\ui\src-tauri\Cargo.toml` | 10 passed |
| `pnpm.cmd --dir apps\ui tauri build` | passed; produced release exe, MSI, and NSIS installer |
| `pnpm.cmd test:e2e:tauri` | passed against release executable |
| `pnpm.cmd test:e2e:tauri -- --exe="%TEMP%\TinkerQuarryInstallSmoke\openscad-studio.exe"` | passed against installed NSIS copy |
| `packages\engine\.venv\Scripts\python.exe -m pytest packages\engine\tests\e2e -q` | 21 passed |
| `packages\engine\.venv\Scripts\python.exe -m pytest packages\engine\tests -m "not live" -q` | 1592 passed, 11 skipped, 116 deselected |
| `packages\engine\.venv\Scripts\python.exe -m pytest packages\engine\tests -m live -q` | 16 passed, 100 skipped, 1603 deselected |
| `packages\engine\.venv\Scripts\python.exe -m pytest packages\engine\tests -m real_tool -q` | 199 passed, 1520 deselected |
| `tq-threads` render proof | 27/27 passed |

## Remaining Product Scope

- Full autonomous Visual Correction Loop policy and a richer before/after visual diff viewer.
- External SCAD-library admission flow.
- Persistent per-iteration transcript/history and a full Explain panel.
- Broader browser coverage: mobile/narrow layouts, keyboard/focus traversal, hardware connector
  outcomes, export formats, and error paths.
- Tauri capability minimization beyond the current removal of blanket `fs:default`, if the product
  later narrows file-system expectations.
- Bundle pruning, if installer size becomes a release criterion.

## Notes

- Playwright is intentionally configured to use the installed system Chrome channel. The bundled
  Chromium install path previously hung on this machine; using system Chrome makes the e2e lane
  reliable here and is documented in the checked-in Playwright config.
- Live marker skips are environment/model gated and are reported honestly. Real-tool marker coverage
  was run separately and passed.
