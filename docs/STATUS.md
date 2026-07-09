# TinkerQuarry Status Matrix

**As of:** 2026-07-02
**Product release:** v1.4.0
**Engine:** KimCad 0.9.4
**Current gate:** clean current-tree gate plus native Windows installer rerun

## Plain-English Truth

TinkerQuarry is a working Windows beta for local-first prompt-to-CAD 3D printing.

Verified core path:

```text
plain-English prompt
-> local KimCad design pipeline
-> OpenSCAD source and Studio preview
-> intent/properties/evidence review
-> printer/material readiness gate
-> OrcaSlicer output
-> download or connector send
-> outcome record
```

The malformed reverse-import mesh test is green because the app rejects the bad mesh. That is the
intended behavior.

## Current Verification

| Area | Status | Evidence |
| --- | --- | --- |
| Full repo gate | Passed | `pnpm test:gate` completed cleanly |
| UI unit coverage | Passed | 94 Jest suites / 660 tests in final gate run |
| Web unit coverage | Passed | 4 Jest suites / 20 tests in final gate run |
| Engine coverage | Passed | 1746 pytest tests in final gate run |
| Browser e2e | Passed | 7 Playwright tests in final gate run |
| Rust/Tauri tests | Passed | `pnpm test:rust` in gate |
| Rust dependency audit | Passed with scoped upstream exception | `pnpm test:rust:audit` ignores only `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195`, both from the currently latest `plist -> quick-xml` dependency path |
| Native release build | Passed | `scripts\native-release.cmd` from `C:\tqbuild\TinkerQuarry` |
| Tauri runtime smoke | Passed | `pnpm test:e2e:tauri` |
| Installed NSIS smoke | Passed | `pnpm test:e2e:tauri:installed` |

Fresh current-tree NSIS artifact:

```text
Name: TinkerQuarry_1.4.0_x64-setup.exe
SHA-256: 7C0E1E9B5CC2840FA44F568040D132B3CD8E34F4C214C86EBA34D7373708F05F
Build path: C:\tqbuild\TinkerQuarry
Smoke: direct Tauri runtime and installed NSIS workflow both passed
```

The public v1.4.0 release is at
[github.com/scottconverse/TinkerQuarry/releases/tag/v1.4.0](https://github.com/scottconverse/TinkerQuarry/releases/tag/v1.4.0).

## Product Surfaces

| Surface | Status | Notes |
| --- | --- | --- |
| Windows installer | Verified | Double-click NSIS installer path is built and smoke-tested |
| Prompt-to-design | Verified | Local KimCad engine creates source, preview, and report |
| Studio viewer/editor | Verified | OpenSCAD source is visible and editable; stale edits force re-gating |
| Customizer | Verified | Template parameters re-render deterministically |
| Intent panel | Implemented | Parsed plan, assumptions, dimensions, and feature list |
| Properties panel | Implemented | Volume, material, mass, center of mass, surface area, bed contact, bounding box |
| Visual evidence cards | Implemented | Labeled multi-view inspection and correction evidence |
| Provenance/toolbox disclosure | Implemented | Plain-English tool/model/agent contribution surface |
| Visual Correction Loop | Implemented | Advisory local probe loop, not metrology-grade inspection |
| Make it real | Verified | Readiness, orientation, slice, send, and outcome flow |
| Reverse import | Implemented | Conservative STL/3MF/OBJ known-family matching |
| STEP/CadQuery lane | Implemented where available | Trusted twins provide editable CAD/STEP precision lane |
| Save/reopen/history | Implemented | Save, restore, branch, duplicate, rename, delete, export/import |
| Export | Implemented | `.kimcad`, `.scad`, STL, OBJ, AMF, 3MF, SVG, DXF, PNG, STEP when available |
| Accessibility | Verified | Browser scans and keyboard/dialog checks are part of the gate |
| Share web app | Verified packaging | Separate Cloudflare Pages path with dry-run deploy check |

## Beta Boundaries

Known limits:

- Windows is the supported beta package target.
- The beta installer is unsigned.
- Real hardware connector certification remains field-validation work beyond the mock connector.
- Visual inspection is advisory and does not replace deterministic geometry checks.
- STEP reverse-to-parametric import is not implemented yet; STEP is currently an export lane.
- Reverse import intentionally accepts only known trusted mesh-family matches.

## Version Matrix

| Surface | Version |
| --- | ---: |
| Product / desktop release | v1.4.0 |
| `package.json` | 1.4.0 |
| `apps/ui/package.json` | 1.4.0 |
| `apps/ui/src-tauri/tauri.conf.json` | 1.4.0 |
| `apps/ui/src-tauri/Cargo.toml` | 1.4.0 |
| KimCad engine | 0.9.4 |
| `apps/web` | 0.6.0 |
| `packages/shared` | 0.4.0 |

## Run Locally

```powershell
cd path\to\TinkerQuarry
corepack enable
pnpm install
cd packages\engine
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
```

```powershell
# Terminal 1
cd path\to\TinkerQuarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765
```

```powershell
# Terminal 2
cd path\to\TinkerQuarry\apps\ui
pnpm dev
```

## Related Documents

- [User Manual](USER-MANUAL.md)
- [Architecture](ARCHITECTURE.md)
- [Changelog](../CHANGELOG.md)
- [CAD Agent Roadmap](roadmap-zookeeper-inspired-cad-agent.md)
- [Discussion Seeds](discussions/README.md)
