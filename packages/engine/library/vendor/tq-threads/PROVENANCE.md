<!-- SPDX-License-Identifier: MIT -->
# PROVENANCE — clean-room source ledger

This file records, per data source, exactly **what** tq-threads uses, **where**
it comes from, and **how faithful** it is. It complements the fidelity table in
[REFERENCES.md §0](REFERENCES.md) and the clean-room statement there.

**Clean-room rule (unchanged):** no third-party OpenSCAD thread library
(Dan Kirshner `threads.scad`, rcolyer `thread_profile`/`threadlib`, BOSL2,
MCAD, …) was opened, read, line-diffed, translated, or used as a template for
code, comments, lookup tables, tests, or API text. Only public standards and
first-principles math were used. License: **MIT** (GPL-2.0 compatible).

Fidelity classes: **EXACT** (nominal standard value used verbatim) ·
**DERIVED** (exact formula from the standard's definition) ·
**FDM** (printability default chosen here) · **APPROX** (approximation/fallback).

| Source / spec | Used for | Class | Faithfulness & notes |
|---|---|---|---|
| **ISO 68-1** (metric basic profile) | 60° form, `H=(√3/2)P`, crest `P/8`, root `P/4`, engaged `0.5413P` | EXACT/DERIVED | Geometry transcribed/derived from the basic-profile definition. |
| **ISO 261** (general plan) | metric coarse + fine major Ø & pitch (presets) | EXACT | Nominal diameter/pitch series. Verified by `tq_presets_selfcheck()` + cross-checked online. |
| **ISO 262** (selected sizes) | preferred metric subset | EXACT | Informs which presets are "common". |
| **ISO 965-1 §13.1** (tolerances) | `fit=` fundamental deviation (allowance) | DERIVED (exact formula) | external e/f/g/h, internal G/H. **Position only**, not the grade/band. Formula value (unrounded); ISO tables round to whole µm. NOT metrology-grade. |
| **ASME B1.1** (Unified) | UNC/UNF numbered+fractional major & TPI (presets) | EXACT | `major=0.060+0.013·N` in (numbered); `pitch=25.4/TPI`. Cross-checked online. |
| **ISO 273** (clearance holes) | `tq_clearance_dia` (close/medium/free) | EXACT (listed) / APPROX (fallback) | Listed sizes nominal; unlisted sizes use a documented ratio fallback. |
| **ISO 7089** (plain washer A) | `tq_washer_dims` | EXACT (listed) / APPROX (fallback) | |
| **ISO 4032** (hex nuts) | `tq_nut_thickness`, `tq_nut_across_flats` | EXACT (listed) / APPROX (fallback) | Also reused for hex bolt heads. |
| **ISO 4762** (socket head cap screws) | `tq_shcs_head` (dk,k), `tq_hex_key_af` | EXACT (listed) / APPROX (fallback) | |
| **ISO 10642** (csk socket head) | `tq_csk_head_dia` (90°) | EXACT (listed) / APPROX (fallback) | |
| **ISO 4757** (cross recesses) | Phillips recess *concept* | APPROX | Printable cruciform approximation; NOT gauge-accurate. |
| **ASME B1.20.1** (NPT) | taper *context* only | — | Linear `taper` is generic; NPT's truncated profile is NOT implemented. |
| *(none — generic)* | `tq_auger`, `tq_bottle_thread`, `tq_wood_screw` | APPROX/GENERIC | Printable generic forms; **no** standard claimed (explicitly documented). |
| *(this library)* | `clearance` default 0.4 mm (½/½ split), `TQ_MIN_SEG`, lead-in chamfers, rounded fillets `H/6`,`H/12` | FDM/DERIVED | Printability choices / derived geometry, not standards. |

## What could only be validated with physical prints + calipers
- Real-world **fit** of a printed bolt/nut pair at a given `clearance`/`fit`.
- Whether a printed thread meets an actual **ISO/ASME tolerance class** (tq-threads
  models a single nominal surface, so it cannot certify a class).
- **SPI/GPI** closure interchange with a real cap/bottle.
- Pull-out / torque strength of `tq_wood_screw` / heat-set alternatives.

Validation path: print the calibration set in [README → FDM fit guide](README.md),
measure major/minor/pitch diameters with calipers/thread gauges, and adjust
`clearance` (and optionally `fit`) per material/printer. For certified parts, use
machined hardware or a metrology-grade CAM toolchain — not an FDM print.

Practical note: ISO 965 position allowance is tiny at FDM scale. M8 `6g` is about
0.029 mm diametral shift, below typical tuned clearance and layer-line effects,
so `fit=` records nominal intent; `clearance` is the real print-fit control.
