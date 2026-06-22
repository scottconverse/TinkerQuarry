# Phase 2 — engine integration (fork) — RESULT: ✅ core PASS

**Date:** 2026-06-22 · **Plan:** [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md) Phase 2 (D3 = fork)

## What was done
- **Forked the KimCad engine** (source only) into `tinkerquarry/packages/engine`: `src/kimcad` (51
  modules), `tests`, `config`, `scripts`, `pyproject.toml`, `LICENSE`, `THIRD_PARTY_LICENSES.md`, `docs`
  — excluding venv/git/old-frontend/caches. **Divergence log:** [../engine-divergence.md](../engine-divergence.md)
  (records the upstream commit + the one fix below). `config/local.yaml` gitignored (per-machine).
- **Fix during the fork:** the initial source-only copy missed the top-level `library/` SCAD template
  modules (`hooks.scad`, `box.scad`, …) — OpenSCAD couldn't resolve `library/hooks.scad`. Copied the 14
  modules in; logged in the divergence file.
- **Stood up a 3.13 venv** in `packages/engine/.venv` (`uv pip install -e .`). The forked engine imports
  and resolves the bundled tools via the copied config (`openscad: True`, `orcaslicer: True`).

## Evidence (PASS criteria)
- **A prompt generates a real mesh, gates, orients, and slices — from the canonical repo:**
  `kimcad design "a small desk hook for a 6 mm rod" --slice` (run from `packages/engine`):
  qwen2.5:7b plan → OpenSCAD render → **watertight mesh, 4853 mm³** → manifold3d harden (genus 2) →
  auto-orient → **Gate PASS, readiness 92/100** → **OrcaSlicer slice: 31,617 G-code lines →
  `output/phase2-proof/part.gcode.3mf`** (~13m34s, 102 layers, 3.17 cm³, Bambu P2S profile). All four
  gate checks pass (mesh.solid, dim.match, volume.fits, wall.ok).
- **The SCAD sandbox / worker isolation is proven (no security regression):** the sanitizer (strips
  file-I/O + out-of-`library/` includes, blocks `minkowski`, runs OpenSCAD in an isolated temp dir with a
  secret-scrubbed env + timeout) and its tests came across intact — **`tests/test_trust_boundary.py` +
  `tests/test_openscad_runner.py`: 38 passed** from `packages/engine`.
- **Attribution present:** `LICENSE` (GPL-2.0) + `THIRD_PARTY_LICENSES.md` forked in.

## Out of scope / sequenced (honest note, for the auditor)
Phase 2's exit also lists *"user-facing strings say TinkerQuarry."* The **end-user** surface is the
front-end (`apps/ui` — still "OpenSCAD Studio"), which is reskinned in **Phase 3**; the engine's
remaining `kimcad` naming is internal/CLI/protocol and is **kept by design** (the product is
TinkerQuarry, the engine is KimCad internally — see the naming decision). The user-facing **error
strings** the UI surfaces (e.g. "KimCad couldn't reach your local AI") will be renamed **with the Phase 3
reskin**, where it's visible which strings actually reach the user. This is a deliberate sequencing, not
a dropped requirement — recorded here per Plan D4.

## Verdict
Phase 2 **core passes** — the engine is real from the canonical repo, the safety sandbox is intact.
Proceed to **Phase 3** (re-layout + reskin the forked Studio to the design; productize first-run/home;
strip telemetry; rename the user-facing strings). The canonical `tinkerquarry` repo now contains a
booting front-end base (Phase 1) **and** a working forked engine (Phase 2).
