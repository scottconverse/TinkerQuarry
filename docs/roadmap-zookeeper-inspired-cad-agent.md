# Zookeeper-Inspired CAD Agent Backlog

This note captures the next product slices inspired by Zoo's Zookeeper write-up, adapted to
TinkerQuarry's local-first, print-first architecture.

## Shipped in this slice

- Intent panel: exposes the parsed Design Plan, including summary, envelope, named dimensions,
  features, assumptions, and open questions.
- Properties panel: exposes gate-measured bounding box, volume, watertight state, orientation, and
  honest estimates for material mass and bed contact area.
- Visual Review panel: exposes labeled view captures, review status, findings, before/after evidence,
  and the bounded correction log.
- Provenance panel: exposes the agent toolbox in plain English: part family vs generator path,
  geometry engine, readiness gate, slicer profile, connector, model state, and STEP availability.

## Reverse-to-parametric import

Goal: import a mesh and recover editable TinkerQuarry intent when the file clearly belongs to a
known part family, rather than treating every imported file as a dead mesh.

Shipped first slice:

1. Accept STL, 3MF, and OBJ mesh files from the Studio Import CAD control.
2. Measure geometry facts: bounding box, volume, surface area, watertight state, and center of mass.
3. Match against known part families using family envelopes, then verify the rebuilt trusted twin
   with volume and surface-area deltas before registration.
4. If a family match is strong, create a Design Plan with recovered dimensions and assumptions, then
   emit the normal template-backed design.
5. If the match is weak or the geometry signature disagrees, reject it as non-parametric for now
   without registering a misleading editable design.

Acceptance fixture:

- A known `wall_hook` STL exported from TinkerQuarry is re-imported and reconstructed as the
  `wall_hook` family with dimensions within the same tolerance used by the printability gate.

Non-goal for the first slice:

- General arbitrary mesh-to-CAD reconstruction. That belongs after known-family matching is reliable.
- STEP/STP reverse import. STEP is currently a precision export from trusted CadQuery twins.

## Editable CAD / STEP precision lane

Goal: make CadQuery trusted twins feel like a first-class precision output path, not only an optional
download.

First useful slice:

1. In Properties/Provenance, label STEP as "trusted CadQuery twin" when available.
2. Add a Settings health row for the CadQuery worker with install/enable guidance.
3. Add a precision badge to template-backed designs that have a STEP twin.
4. Add an export detail card explaining: SCAD is the editable TinkerQuarry source, STL/3MF are print
   meshes, STEP is the editable CAD handoff for Fusion/FreeCAD/SolidWorks.
5. Keep AI-written CadQuery out of scope; generated Python remains removed.

Acceptance fixture:

- A template-backed bracket exports STEP from its trusted twin, reports the same envelope as the
  OpenSCAD/rendered mesh, and remains sliceable through the standard print path.
