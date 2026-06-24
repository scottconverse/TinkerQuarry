# TinkerQuarry

**Local-first AI CAD for real 3D-printable parts.**

TinkerQuarry turns a plain-English prompt into a checked, printable file. Describe a part, inspect
and tune the generated OpenSCAD, validate it against your printer, slice it, then download or send
the job through a configured connector. The product is private by default: no account, no telemetry,
and no cloud model unless you explicitly configure one.

[![Release](https://img.shields.io/badge/release-v1.3.0-2563eb)](https://github.com/scottconverse/TinkerQuarry/releases/tag/v1.3.0)
[![License](https://img.shields.io/badge/license-GPL--2.0--only-1d7a4e)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Windows%20beta-0078D6)](docs/USER-MANUAL.md)
[![Status](https://img.shields.io/badge/gate-0%2F0%2F0%2F0%2F0-1d7a4e)](docs/audits/gate-tinkerquarry-2026-06-23-gauntlet-all/GAUNTLETGATE-ALL.md)

## What It Does

TinkerQuarry is built for functional 3D-printing work:

1. **Describe** the object you need, such as `a wall hook for a 12 mm dowel`.
2. **Review** the generated model in the Studio workspace with viewer controls, source view, and
   parameter surfaces.
3. **Make it real** by selecting a printer/material, applying orientation, and running the
   printability gate.
4. **Slice** only after the model passes readiness checks.
5. **Download or send** the proven output, with mock-send and outcome recording covered by release
   tests.

## Current Release Truth

Version `v1.3.0` is a Windows beta release. The core product path is implemented and release-gated:

- Prompt -> local KimCad engine -> OpenSCAD model -> Studio viewer.
- Customize / Make it real rail with readiness, manual orientation, slice, send, and iteration log.
- Printability gate blocks stale or unsafe manufacturing output.
- Mock send/outcome path is browser-tested.
- Native Tauri Windows package builds and installed-app smoke passes.
- GitHub release gate passed locally with `0 Blocker / 0 Critical / 0 Major / 0 Minor / 0 Nit`.

Known beta boundaries are documented, not hidden:

- Hardware connector proof beyond mock send remains a validation lane.
- Visual Correction Loop is advisory local probe mode, not metrology-grade inspection.
- Full visual diff and richer Explain surfaces remain future work.
- Browser coverage includes the core flow, workspace controls, menu/dialog keyboard checks, and
  mobile smoke; it is not yet every error/export/accessibility permutation.

See [docs/STATUS.md](docs/STATUS.md) for the evidence-backed status matrix.

## Architecture At A Glance

![TinkerQuarry architecture](docs/assets/tinkerquarry-architecture.svg)

TinkerQuarry is a desktop-first product composed of:

- **React/TypeScript Studio app** in `apps/ui`.
- **Tauri WebView2 shell** for the native Windows package.
- **KimCad Python engine** in `packages/engine`.
- **OpenSCAD 2026.03.16 Manifold** for geometry rendering.
- **OrcaSlicer** for G-code generation.
- **PrintProof3D 0.6.2** for printability analysis.
- **Optional local/cloud model providers** selected by the user.

The product name is **TinkerQuarry**. The internal engine and CLI are **KimCad**. That naming split is
intentional because KimCad remains the reusable engine layer inside this product.

## Install And Use

The supported beta target is Windows.

1. Download the release installer when published, or build from source with the commands below.
2. Open TinkerQuarry.
3. Choose or confirm printer/material settings.
4. Describe a part and build it.
5. Slice only after the app shows readiness.

Full instructions are in the [User Manual](docs/USER-MANUAL.md).

## Developer Quick Start

Use two PowerShell terminals:

```powershell
# Terminal 1: engine
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765
```

```powershell
# Terminal 2: front end
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev
```

Open `http://localhost:1420`.

## Release Proof

The local release command is:

```powershell
pnpm test:release
```

For `v1.3.0`, this passed on commit `0cf99a0` and covered:

- lint and type-check;
- UI Jest suite;
- web unit suite;
- full engine pytest suite;
- Playwright browser walkthroughs;
- Rust/Tauri tests;
- native Windows build;
- release executable smoke;
- installed NSIS workflow smoke.

The final GauntletGate report is
[docs/audits/gate-tinkerquarry-2026-06-23-gauntlet-all/GAUNTLETGATE-ALL.md](docs/audits/gate-tinkerquarry-2026-06-23-gauntlet-all/GAUNTLETGATE-ALL.md).

## Documentation

- [Professional User Manual](docs/USER-MANUAL.md)
- [Architecture And Technologies](docs/ARCHITECTURE.md)
- [Evaluation Guide](docs/EVALUATE.md)
- [Status Matrix](docs/STATUS.md)
- [Third-Party Licenses](packages/engine/THIRD_PARTY_LICENSES.md)

## Repository Map

```text
apps/ui/          TinkerQuarry Studio UI and Tauri desktop shell
apps/web/         lightweight public/share web surface
packages/engine/  KimCad engine, HTTP API, tools, config, printer profiles
packages/shared/  shared package helpers
docs/             product docs, status, audits, landing page, manual
scripts/          native release and smoke-test helpers
```

## License

TinkerQuarry is GPL-2.0-only. See [LICENSE](LICENSE).

Bundled third-party SCAD libraries are selected for GPL-2.0 compatibility. Dan Kirshner
`threads.scad` is intentionally excluded because the available source is GPL-3.0-or-later; thread
support is provided by a first-party wrapper over vendored BOSL2.
