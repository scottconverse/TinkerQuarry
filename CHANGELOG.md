# Changelog

All notable user-facing changes to TinkerQuarry are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
uses separate version numbers for the product, engine, share web app, and shared helper package.

## [Unreleased]

### Documentation

- Rewrote the public README as the main landing document.
- Rewrote the full user manual with three sections: Non-Technical User, Technical User, and
  Architecture.
- Rewrote the architecture reference with system, sequence, state, reverse-import, STEP/CadQuery, and
  trust-boundary diagrams.
- Refreshed the GitHub Pages landing page and GitHub Discussions seed documents.
- Added explicit version-surface documentation for product v1.3.1 and KimCad engine 0.9.3.

## [1.3.1] - 2026-06-24

### Added

- Public TinkerQuarry v1.3.1 release with Windows installer assets, manifest, and SHA256 sums.
- Local-first prompt-to-CAD workflow with OpenSCAD source, Studio viewer, readiness gate, slicing,
  mock send, and print outcome recording.
- Intent panel showing parsed design plan, assumptions, dimensions, and feature list.
- Properties panel with volume, material estimate, mass, center of mass, surface area, bed contact,
  and bounding box.
- Labeled multi-view visual inspection cards for correction and evidence review.
- Plain-English agent toolbox and provenance disclosure.
- Conservative STL/3MF/OBJ reverse import for known trusted part families.
- Clearer editable CAD/STEP precision lane through trusted CadQuery twins where available.
- Installed NSIS smoke coverage for the Windows installer workflow.

### Changed

- Native packaging now targets NSIS explicitly.
- Native release script invokes the Tauri build from the app workspace.
- Installer staging strips Python bytecode/cache directories from the bundled engine payload.
- Tauri runtime smoke uses an isolated temp profile by default.
- Rust dependency set was refreshed to clear the release audit.
- Rust audit script now explicitly ignores only `RUSTSEC-2026-0194` and `RUSTSEC-2026-0195`, the
  upstream-unfixed `plist -> quick-xml` advisories, while continuing to fail on other vulnerabilities.

### Verified

- `pnpm test:gate` passed on the current tree.
- Native release build passed from `C:\tqbuild\TinkerQuarry`.
- Direct Tauri runtime smoke passed.
- Installed NSIS smoke passed.
- The intentionally malformed reverse-import mesh test passes by rejecting the bad mesh, which is
  the intended behavior.
- Windows beta documentation, status matrix, and release evidence.
