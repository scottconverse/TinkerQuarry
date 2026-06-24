# Engineering Deep Dive

**Role:** Principal Engineer
**Final counts after fixes:** Blocker 0 / Critical 0 / Major 0 / Minor 0 / Nit 0

## Findings Closed

### ENG-M001 - Subprocess secret env leakage

**Original severity:** Major
**Evidence:** `packages/engine/src/kimcad/slicer.py` and `packages/engine/src/kimcad/printproof3d.py` launched external tools without the shared environment scrubber used by other subprocess boundaries.
**Fix:** Both OrcaSlicer and PrintProof3D subprocess calls now use `scrubbed_env()`.
**Regression proof:** `packages/engine/tests/test_trust_boundary.py` now asserts planted secret variables are not passed to OrcaSlicer or PrintProof3D child processes.

## What Is Working

The engine already has strong deterministic validation around OpenSCAD, slicing, printer/material profiles, source round-trips, and readiness gates. The security boundary is now more consistent across the remaining external binary calls.
