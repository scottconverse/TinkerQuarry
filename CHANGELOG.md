# Changelog

All notable user-facing changes to TinkerQuarry are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses separate version numbers for the product, engine, share web app, and shared helper package.

## [Unreleased]

### Changed

- Default local chat/planner model: `qwen2.5:7b` -> **Qwen3.5-9B** (`qwen3.5:9b`), per a
  published-record research verdict (2026-07-15) — NOT the v1.5-6 bake-off's own pick, Mellum2.
  The bake-off itself measured Mellum2 winning every harness axis (10/10 completed vs 9/10,
  graded 6/10 vs 3/10, 39.9s vs 61.2s mean), but an independent review then proved that grader
  feature-blind (a plan with 8 holes where 4 were asked, and 60mm legs declared inside a 40mm
  bounding box, both still scored "completed"); a fidelity re-grade tied Mellum2 to the
  incumbent, and JetBrains' own technical report corroborated the miss (BS-Bench false-premise
  detection 14–24 vs Qwen3.5's 56–70). Deep research across the published record then ranked
  Qwen3.5-9B first for this task profile (IFEval 83.9, BFCL v3 70.5, StructEval 90.96 vs the
  incumbent's 84.40, peer-reviewed) and the owner chose to switch on that record. `qwen2.5:7b`
  remains selectable (`local_qwen2_5`) as the fallback for boxes too small for Qwen3.5-9B's RAM
  footprint (~7–8 GB working set — smaller than Mellum2's ~9–10 GB). Full history:
  `packages/engine/docs/benchmarks/stage-v156-model-bakeoff.md`.

## [1.4.0] - 2026-07-09

Product v1.4.0 ships with KimCad engine 0.9.4. This is the first release whose binaries contain no
telemetry code, matching the README's "no telemetry" claim.

### Added

- Intent panel showing parsed design plan, assumptions, dimensions, and feature list.
- Properties panel with volume, material estimate, mass, center of mass, surface area, bed contact,
  and bounding box.
- Labeled multi-view visual inspection cards for correction and evidence review.
- Plain-English agent toolbox and provenance disclosure.
- Conservative STL/3MF/OBJ reverse import for known trusted part families.
- SmartScreen guidance for the unsigned beta installer in the README, User Manual, and landing page.

(The five product features above — everything except the SmartScreen guidance — were previously
listed under 1.3.1 in error: they landed on `main` after the v1.3.1 tag and ship for the first time
in v1.4.0.)

### Removed

- All product telemetry. The PostHog analytics and Sentry crash-reporting integrations are deleted
  outright, including the privacy settings panel that gated them. The v1.3.1 binaries still
  contained these settings-gated code paths.

### Changed

- KimCad engine version is 0.9.4 (reverse import, webapp intent/properties/evidence endpoints, and
  validation additions since 0.9.3).
- Native packaging targets NSIS explicitly and the release script invokes the Tauri build from the
  app workspace.
- Installer staging strips Python bytecode/cache directories from the bundled engine payload.
- Tauri runtime smoke uses an isolated temp profile by default.
- Rust dependency set was refreshed to clear the release audit; the audit explicitly ignores only
  `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195`, the upstream-unfixed `plist -> quick-xml` advisories,
  while continuing to fail on other vulnerabilities.
- Engine requires Python `>=3.13,<3.14`; 3.14 is excluded until the renderer/CadQuery path is
  validated there.
- The installed-NSIS smoke derives the installer filename from `tauri.conf.json` instead of a
  hardcoded version string.
- The code signing policy documents the honest current state: release artifacts are not yet signed;
  SignPath Foundation onboarding is in progress.

### Fixed

- Engine test collection no longer aborts on machines without the bundled OrcaSlicer (a bare
  `skipif` raised `UnknownConfigKey` at import time, failing CI on every push since 2026-06-24).
- The CI lanes now pass on tool-less GitHub runners: twelve tool-tree-dependent engine tests are
  presence-guarded, the printer-catalog proof-of-record is compared by content hash instead of
  file mtime, and the frontend job installs a node-gyp that can discover Visual Studio 2026.

### Documentation

- Rewrote the public README as the main landing document.
- Rewrote the full user manual with three sections: Non-Technical User, Technical User, and
  Architecture.
- Rewrote the architecture reference with system, sequence, state, reverse-import, STEP/CadQuery, and
  trust-boundary diagrams.
- Refreshed the GitHub Pages landing page and GitHub Discussions seed documents.
- Added explicit version-surface documentation for the product, engine, share web app, and shared
  helper package.

## [1.3.1] - 2026-06-24

### Added

- Public TinkerQuarry v1.3.1 release with Windows installer assets, manifest, and SHA256 sums.
- Local-first prompt-to-CAD workflow with OpenSCAD source, Studio viewer, readiness gate, slicing,
  mock send, and print outcome recording.
- Clearer editable CAD/STEP precision lane through trusted CadQuery twins where available.
- Installed NSIS smoke coverage for the Windows installer workflow.

### Verified

- `pnpm test:release` passed on the tagged tree before publication: gate, browser e2e, native build,
  release-executable smoke, and installed NSIS smoke.
- Windows beta documentation, status matrix, and release evidence.
