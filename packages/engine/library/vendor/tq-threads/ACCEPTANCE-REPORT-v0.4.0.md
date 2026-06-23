<!-- SPDX-License-Identifier: MIT -->
# tq-threads v0.4.0 — Acceptance Report

**Library:** tq-threads (clean-room, MIT, GPL-2.0-compatible OpenSCAD thread library)
**Canonical repo:** https://github.com/scottconverse/tq-threads
**Release tag:** `v0.4.0`
**Implementation commit:** `afda464357b7178866b0a4db318f6513957edd83`
**Date:** 2026-06-22
**OpenSCAD used:** 2021.01 (`_tools/openscad/openscad-2021.01/openscad.exe`)

---

## 1. Summary of what changed (v0.3.0 → v0.4.0)

- **ISO 965-1 fit classes** (`fit=`): exact fundamental-deviation formulae
  (external e/f/g/h, internal G/H), applied as an allowance distinct from the FDM
  `clearance`. Verified: 6g M8 → Ø7.9713 (= 8 − 0.0288), 6h → Ø8.0000.
- **Precision overrides**: `minor_d` (core diameter / thread depth) added to v0.3's
  `angle`, `tooth_height`, `taper`, `crest_flat`, `root_flat`.
- **Presets 43 → 101**: full ISO 261 fine-pitch series + complete Unified numbered
  (#0–#12) and fractional (¼–1″) UNC/UNF, plus `tq_preset_count()` /
  `tq_presets_selfcheck()`.
- **Robust Windows selection**: zero-`-D` `examples/*.scad` wrappers + shell-safe
  numeric `-D PART=n`; fragile `-D SHOW="…"` demoted to a documented fallback.
- **Wood screw** params: `taper`, `core_d`, `thread_depth`, `point`
  (gimlet/cone/flat, old bool still works), `shank` — still generic (no standard).
- **Bottle thread** params: `angle`, `tooth_height`, `profile`, `lead_in`
  (with `starts`/`internal`) — still generic (not SPI/GPI).
- **Provenance/honesty**: `REFERENCES.md §0` fidelity table + `PROVENANCE.md`
  ledger classify every item EXACT / DERIVED / FDM / APPROX.
- **`scripts/render_proof.ps1`**: PASS/FAIL, version + timings, 13 negative tests,
  exits nonzero on failure; PS 5.1 + pwsh 7 compatible. `render-tests.ps1` → alias.

## 2. What is now EXACT vs. DERIVED vs. APPROX

- **EXACT (nominal standards):** metric coarse+fine Ø/pitch (ISO 261); Unified
  Ø/TPI (ASME B1.1); listed ISO 273/4032/4762/7089/10642 hardware dimensions.
- **DERIVED (exact formula):** 60° form & `H`; custom-`angle` geometry; rounded
  fillets (`H/6`, `H/12`); ISO 965-1 §13.1 fit-class fundamental deviation
  (unrounded formula; ISO *tables* round to whole µm). Tolerance **grade/band is
  not modelled**.
- **FDM defaults:** `clearance` 0.4 mm, resolution floors, lead-in chamfers.
- **APPROX / GENERIC (no standard claimed):** Phillips recess (ISO 4757 *concept*),
  `tq_auger`, `tq_bottle_thread`, `tq_wood_screw`, ratio fallbacks for unlisted sizes.

## 3. What remains approximate / future work

- Single nominal surface ⇒ **no certified ISO/ASME tolerance class** (position
  only, not grade). Not metrology-grade.
- Internal threads via external-form cutter (pragmatic for FDM).
- No SPI/GPI named closures, no NPT truncated profile, no ACME/buttress forms.
- Countersunk/Phillips/auger/wood-screw are printable approximations.

## 4. What could only be validated with physical prints + calipers

Real printed **fit** at a given `clearance`/`fit`; actual **tolerance-class**
compliance; **SPI/GPI** cap/neck interchange; **pull-out/torque** strength of
wood-screw vs heat-set. Validation path: print the README calibration set, measure
major/minor/pitch with calipers/thread gauges, tune `clearance` (± `fit`) per
material/printer. (See `PROVENANCE.md`.)

## 5. Render / test results

Command: `powershell -File scripts/render_proof.ps1`  ·  OpenSCAD **2021.01**

```
RESULT: 27/27 passed  (14 render, 13 negative)         PROOF PASSED (exit 0)
```

| Group | Tests | Result |
|---|---|---|
| Standards self-test (`tq_threads_selftest.scad`) | preset table self-check (101), count ≥ 54, nominal spot-checks, ISO 965 formulae | PASS |
| Fast smoke grid (`tq_threads_fast_tests.scad`, 27 cells) | metric coarse/fine, Unified, fit class, multi-start, LH, arc, profiles, taper, auger, Phillips, child wrappers, holes, coupler, wood, bottle, washer | PASS (140712 facets) |
| Example wrappers (zero-`-D`) | bolt, hexbolt, nut, csk_bolt, washer, wood, coupler, standoff, cap, auger, phillips, tap | PASS (12/12) |
| Negative / assert tests | bad d/pitch/length/hand/profile/starts/arc, fit case-mismatch, unknown fit, minor_d≥d, taper-collapse, wood core_d≥d, bolt shank≥length | PASS (13/13 correctly rejected) |

Prior baseline was 14/14; v0.4 proof is **27/27** (14 positive renders + 13
negative). Approx. timings (this run, under load): selftest ~1 s, fast grid
~184 s (N-way union), example wrappers 1–22 s each. No `WARNING` / "not a valid
2-manifold" lines on any positive render. Independent CI renders on clean Ubuntu
via `.github/workflows/ci.yml`.

## 6. Acceptance criteria check

- [x] Clean-room MIT preserved (no third-party thread code/tables/text used).
- [x] All v0.2/v0.3 capabilities still pass (backward compatible; `angle=60` default).
- [x] New render proof passes (27/27, exits nonzero on failure).
- [x] New standard/preset/assert tests pass (selftest + 13 negatives).
- [x] Docs distinguish EXACT / DERIVED / FDM / APPROX (REFERENCES §0, PROVENANCE).
- [x] Wood-screw & bottle-thread kept generic and **documented/named** as such.
- [x] Windows workflow no longer depends on fragile `-D` string quoting.
- [x] Canonical GitHub repo synced and tagged `v0.4.0`.
- [ ] Physical print/caliper validation — **out of scope of code**; path provided.
