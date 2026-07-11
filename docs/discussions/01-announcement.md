<!-- Category: Announcements. Pin this. -->

# TinkerQuarry v1.4.0: local-first AI CAD for printable parts

TinkerQuarry is a Windows beta for making practical 3D-printable parts from plain language. You
describe a part, inspect the generated OpenSCAD, review intent and properties, validate it against
your printer/material, slice it, and prepare real print output.

## What is working

- Prompt-to-CAD through the local KimCad engine.
- OpenSCAD source view, editor, viewer, customizer parameters, save/reopen, and export.
- Intent panel with parsed plan, assumptions, dimensions, and feature list.
- Properties panel with estimated volume, material, mass, center of mass, surface area, bed contact,
  and bounding box.
- Labeled multi-view visual inspection cards.
- Plain-English agent/toolbox provenance disclosure.
- Readiness gate, manual orientation, slicing, download, connector send, and outcome recording.
- Conservative STL/3MF/OBJ reverse import for known trusted part families.
- STEP export through trusted CadQuery twins where available.
- Windows NSIS installer and installed-app smoke coverage.

## Verification

The current tree has a clean full gate, native release build, direct Tauri runtime smoke, and
installed NSIS smoke. The intentionally malformed reverse-import test is green because TinkerQuarry
rejects the malformed mesh, which is the intended behavior.

## Still beta

- Windows is the supported package target.
- Hardware connector certification beyond the mock connector remains field-validation work.
- Visual inspection is advisory and does not replace deterministic geometry checks.
- STEP reverse-to-parametric import is a roadmap item.

## Start here

- Manual: `docs/USER-MANUAL.md`
- Architecture: `docs/ARCHITECTURE.md`
- Status matrix: `docs/STATUS.md`
- Release: https://github.com/scottconverse/TinkerQuarry/releases/tag/v1.4.0

If you make a real part, please post it in Show and Tell. Real prints and real failure cases are the
best signal for the next stage.
