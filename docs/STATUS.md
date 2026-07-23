# TinkerQuarry Status Matrix

**As of:** 2026-07-23
**Product release:** **v1.5.1 is the current release**, superseding v1.4.0. v1.5.0 was published,
failed its gate, and remains withdrawn to pre-release. v1.5.1 ships as an unsigned beta (like v1.4.0);
code signing returns once the release-gate runner is stood up.
**Engine:** KimCad 0.9.4
**Current gate:** the v1.5.0 figures below are the historical record of THAT release's gate run.
They are not a claim about this branch.

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
| Full repo gate | Passed 2026-07-16 (v1.5.0 release gate) | `pnpm test:gate` exit 0 on the release tree |
| GauntletGate v1.5.0 | **DO NOT ADVANCE** — 51 findings | 2 Blocker / 10 Critical / 18 Major / 19 Minor / 2 Nit. v1.5.0 was moved back to pre-release and v1.4.0 restored as the then-current release; the fixes shipped in v1.5.1, which is now the current release. The full punch list is a local review artifact and is deliberately not published here. |
| UI unit coverage | Passed | full Jest suite green on the v1.5.1 release commit (see PR #33 CI — count not pinned here to avoid drift) |
| Web unit coverage | Passed | full Jest suite green on the v1.5.1 release commit (see PR #33 CI) |
| Engine coverage | Passed | 1796 pytest tests, 0 skipped, in the gate run |
| Browser e2e | Passed | 7 Playwright tests (accessibility, manufacturing flow, workspace, mobile/tablet) |
| Rust/Tauri tests | Passed | `pnpm test:rust` in gate |
| Rust dependency audit | Passed with scoped upstream exception | `pnpm test:rust:audit` ignores only `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195`, both from the currently latest `plist -> quick-xml` dependency path |
| Native release build | Passed | `scripts\native-release.cmd` (VsDevCmd; unattended-safe) built the NSIS installer in-repo |
| Tauri runtime smoke | Passed | `pnpm test:e2e:tauri` against a fresh isolated profile: engine health `0.9.4`, OpenSCAD + OrcaSlicer present |
| Installed NSIS smoke | Passed | `pnpm test:e2e:tauri:installed`: installs the built setup.exe into a temp dir and drives the native build/slice/send workflow; engine health `0.9.4` |

Each release's installer, its SHA-256 (`SHA256SUMS.txt`), and its release manifest live on that
release's own page; the manifest pins the exact commit the artifacts were built from. Start from
the [releases page](https://github.com/scottconverse/TinkerQuarry/releases).

**Do not install v1.5.0.** It is published but was moved back to pre-release after failing its
gate; **v1.5.1 is the current release**. This document previously linked v1.5.0 as the place to
get the installer, which was a live instruction to download a build we had already withdrawn.

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
- The beta installer is signed (Azure Trusted Signing) as of v1.5.0; SmartScreen may still warn
  while the certificate builds reputation.
- Real hardware connector certification remains field-validation work beyond the mock connector.
- Visual inspection is advisory and does not replace deterministic geometry checks.
- STEP reverse-to-parametric import is not implemented yet; STEP is currently an export lane.
- Reverse import intentionally accepts only known trusted mesh-family matches.

## Version Matrix

| Surface | Version |
| --- | ---: |
| Product / desktop release | v1.5.1 (current release, supersedes v1.4.0) |
| `package.json` | 1.5.1 |
| `apps/ui/package.json` | 1.5.1 |
| `apps/ui/src-tauri/tauri.conf.json` | 1.5.1 |
| `apps/ui/src-tauri/Cargo.toml` | 1.5.1 |
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
