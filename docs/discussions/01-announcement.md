<!-- Category: Announcements · Pin this -->

# Welcome to TinkerQuarry v1.3.0

TinkerQuarry is a local-first AI CAD application for making real 3D-printable parts. Describe a
part in plain language, inspect the generated OpenSCAD, validate it against your printer/material,
slice it, then download or send the proven output.

The v1.3.0 Windows beta is now public and release-gated.

## What is working in v1.3.0

- Prompt -> local KimCad engine -> OpenSCAD source -> Studio viewer.
- Customize / Make it real rail with readiness, manual orientation, slice, send, and iteration log.
- Printability gate that blocks stale or unsafe manufacturing output.
- Mock send and print-outcome recording.
- Native Windows package build, release-executable smoke, and installed-app workflow smoke.
- Full local release proof: `pnpm test:release` passed on commit `0cf99a0`.

## What is still beta

- Hardware connector proof beyond the mock connector is still a validation lane.
- Visual Correction Loop is advisory local probe mode, not metrology-grade inspection.
- Full visual diff and richer Explain surfaces are future work.
- Browser coverage is meaningful but not every error/export/accessibility permutation.

## Start here

- Manual: `docs/USER-MANUAL.md`
- Architecture: `docs/ARCHITECTURE.md`
- Status matrix: `docs/STATUS.md`
- Release gate: `docs/audits/gate-tinkerquarry-2026-06-23-gauntlet-all/GAUNTLETGATE-ALL.md`

If you print something, please post it in Show and Tell. Real parts and failure cases are the best
signal for the next stage.
