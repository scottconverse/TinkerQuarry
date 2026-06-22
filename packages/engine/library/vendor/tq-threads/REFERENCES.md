<!-- SPDX-License-Identifier: MIT -->
# References & clean-room statement

`tq-threads` is a **clean-room** implementation. It was written from public
engineering standards and first-principles trigonometry only. **No third-party
OpenSCAD thread library was opened, read, line-diffed, translated, or used as a
template** for module names, parameter names, algorithms, comments, examples, or
tests. The dimensions below are public engineering facts (measurements and
formulae); the *code* expressing them is original to this project.

---

## 1. Thread form — the 60° metric/Unified V

Both ISO metric and the Unified Thread Standard share the same **60° symmetric V**
basic form. Every dimension derives from the pitch `P` and the sharp-triangle
height `H`:

```
H = (sqrt(3)/2) · P = 0.8660254 · P
```

| Quantity | Formula (basic profile) | Value |
|---|---|---|
| Sharp-V height | `H = (√3/2)·P` | 0.866025·P |
| Crest truncation (external) | `H/8` | 0.108253·P |
| Root truncation (external, flat) | `H/4` | 0.216506·P |
| Engaged height (flat crest + root) | `5H/8` | 0.541266·P |
| Crest flat width (axial) | `P/8` | 0.125·P |
| Root flat width (axial) | `P/4` | 0.250·P |
| Pitch-Ø offset from major | `2·(3H/8) = 0.75·H` | 0.649519·P |
| Minor-Ø offset from major (basic) | `2·(5H/8) = 1.25·H` | 1.082532·P |
| Rounded root radius (UNR/ISO) | `≈ 0.144·P` | 0.144·P |
| Rounded crest radius (this lib) | `≈ 0.072·P` | 0.072·P |

**Derivation of the rounded fillet radii** (used by `profile="rounded"`,
`_tq_table_round`). The root fillet uses the standard UNR/ISO-class rounded-root
value `rr ≈ H/6 = 0.866·P/6 = 0.1443·P`. The crest fillet is taken at **half**
that, `rc = rr/2 = H/12 ≈ 0.0722·P`, mirroring the crest truncation (`H/8`) being
half the root truncation (`H/4`). Both are expressed directly in terms of the
60° triangle height `H`; neither is copied from any library.

Standards:

- **ISO 68-1** — *ISO general purpose screw threads — Basic profile — Metric.*
  Defines the 60° basic profile, `H`, and the H/8 and H/4 truncations.
- **ISO 261** — *ISO general purpose metric screw threads — General plan.*
  Standard diameter/pitch combinations; source of the coarse-pitch presets
  **M2–M64**.
- **ISO 262** — *Selected sizes for screws, bolts and nuts.* Source of the
  selected fine-pitch presets (`M8x1`, `M10x1.25`, …).
- **ISO 965-1** — *Tolerances — Principles and basic data.* The tolerance/
  allowance framework that motivates the printable `clearance` model.
- **ASME B1.1** — *Unified Inch Screw Threads (UN/UNR).* The Unified 60° form,
  the UNC/UNF series, and `P = 25.4 / TPI`. Source of the inch presets.

### Preset pitch values (tabulated facts)

Metric coarse, `[major mm, pitch mm]`:
```
M2 0.40  M2.5 0.45  M3 0.50  M3.5 0.60  M4 0.70  M5 0.80  M6 1.00  M7 1.00
M8 1.25  M10 1.50  M12 1.75  M14 2.00  M16 2.00  M18 2.50  M20 2.50  M22 2.50
M24 3.00  M27 3.00  M30 3.50  M33 3.50  M36 4.00  M39 4.00  M42 4.50  M45 4.50
M48 5.00  M52 5.00  M56 5.50  M60 5.50  M64 6.00
```
Metric fine: `M8x1 M10x1.25 M10x1 M12x1.5 M12x1.25 M16x1.5 M20x1.5 M24x2`.
Unified (`major = inch·25.4`, `pitch = 25.4/TPI`):
`1/4-20 1/4-28 3/8-16 3/8-24 1/2-13 1/2-20`.

---

## 2. Hardware-dimension standards (v0.2 helper tables)

The hardware helpers return standard **nominal dimensions** — public measurement
tables, not creative expression. Each function also has a derived-ratio fallback
for sizes outside its table.

- **ISO 4032** — *Hexagon regular nuts.* Width across flats `s` and nut thickness
  `m` → `tq_nut_across_flats`, `tq_nut_thickness` (also used for hex bolt heads).
- **ISO 4762 / DIN 912** — *Hexagon socket head cap screws.* Head diameter `dk`,
  head height `k`, and hex-key (drive) width across flats →
  `tq_shcs_head`, `tq_hex_key_af`.
- **ISO 273** — *Clearance holes for bolts and screws* (fine / medium / coarse
  series) → `tq_clearance_dia(size, fit)`.
- **ISO 7089** — *Plain washers, form A* (inner Ø, outer Ø, thickness) →
  `tq_washer_dims`, `tq_washer`.
- **ISO 10642 / DIN 7991** — *Hexagon socket countersunk (flat) head cap screws,*
  90° included head angle → `tq_csk_head_dia`, `tq_countersunk_bolt`, and the
  countersunk clearance recess.

> These standards are referenced for their **public nominal dimension tables and
> formulae** only. Values were transcribed/derived from the published series;
> no third-party library's data tables, code, or parameter choices were used.

### v0.3 additions — profile controls, drives, auger, taper

- **Custom flank angle** (`angle`, default 60°). The sharp-V height for a
  symmetric included angle α follows from the right triangle of half-angle α/2
  over an axial half-pitch: `H = (P/2)/tan(α/2)`, and the flank radial height is
  `h = (P − crest_flat − root_flat)/(2·tan(α/2))`. For α=60° this reduces to the
  ISO/UN `h = (P−cf−rf)·(√3/2)` used in v0.2 (bit-for-bit compatible). This is
  pure trigonometry, not taken from any library. Non-60° angles are useful for
  Whitworth-style (55°) or shallow printable threads.
- **Explicit tooth height** (`tooth_height`). A direct override of the radial
  flight depth `h`; geometry then interpolates the flanks between the flats and
  the given depth. No external source — it is just exposing `h` as an input.
- **Tapered threads** (`taper`). The whole profile is shifted radially inward by
  `(taper/2)·(z/L)` along the length — a linear cone applied to the height-field.
  For reference, real tapered pipe threads (e.g. **ANSI/ASME B1.20.1 NPT**) use a
  1:16 taper (≈1.79° per side); `taper` lets you reproduce any linear taper, but
  this library does not implement NPT's specific truncated profile.
- **Phillips (cross) recess** (`tq_phillips_drive`, `drive="phillips"`). The
  cruciform recess concept (a central point plus two crossed full-width wings —
  each spanning both arms of one axis — forming the four-armed cross, tapering
  toward the tip) is described by **ISO 4757** (cross recesses for screws) and
  the ANSI Type I Phillips standard. tq-threads builds an **approximate, clean-room**
  cruciform from OpenSCAD primitives (a tapered core + two crossed hulled wings)
  sized by PH number; it is a printable approximation, not a gauge-accurate
  Phillips form, and no third-party recess code was used.
- **Auger / deep coarse flight** (`tq_auger`). A generic deep, large-pitch single
  /multi-start helical flight (screw-conveyor / drill / feed-screw style). No
  specific standard; it is the core `tq_thread` driven with a large pitch and an
  explicit `tooth_height`, optionally tapered.
- **Child-difference wrappers** (`tq_tap`, `tq_drill`, `tq_counterbore`,
  `tq_countersink`) and `tq_relief_groove` are pure OpenSCAD `difference()`
  conveniences over the existing primitives — original code, `tq_*` named.

The coarse "bottle/jar" thread (`tq_bottle_thread`) is a **generic** printable
rounded coarse thread, **not** a specific consumer-packaging finish. If you need
a real finish, public references include the **SPI/GPI "400-series"** finish
dimensions and **ISO 8317 / ASTM** closure standards (not reproduced here — the
helper exposes raw diameter/pitch/depth so you can dial in a drawing you hold).

---

## 3. Geometry / CAD technique

- **Helical surface as a height-field on a cylinder.** The thread radius is
  `r(z,θ) = profile(frac((z − dir·(θ/360)·lead)/P))`. This is a standard
  parametric description of a helical surface; expressing it as one OpenSCAD
  `polyhedron` (a wrapped side surface + two centre-fan caps) yields a closed
  2-manifold with no boolean unions.
- **OpenSCAD language reference** — `polyhedron`, `lookup`, list comprehensions
  with `each`, and `$fn/$fa/$fs`: <https://openscad.org/documentation.html>.

---

## 4. Licensing references

- **MIT License**: <https://opensource.org/license/mit>
- **GPL compatibility of MIT/Expat** (FSF license list):
  <https://www.gnu.org/licenses/license-list.html#Expat> — the FSF classifies
  MIT/Expat as a GPL-compatible permissive license, which is why this library
  can be included in a GPL-2.0-only project.

---

## 5. What was deliberately NOT used

- No third-party OpenSCAD thread library (of any license) was opened, read,
  diffed, or used as a reference for naming, algorithms, comments, examples, or
  tests. In particular, **Dan Kirshner's `threads.scad`, rcolyer's
  `thread_profile` / `threadlib`, and BOSL2's `threading.scad` were not opened,
  read, line-diffed, or used as a template.** tq-threads' construction is
  structurally different from each (it builds one height-field `polyhedron`
  rather than unioning per-tooth solids, sweeping a 2D profile along a helix, or
  using a VNF/spiral-sweep framework).
- All module/parameter names (`tq_thread`, `clearance`, `lead_in`, `starts`,
  `profile`, …) and the height-field construction were chosen independently from
  any existing library and from the standards' vocabulary.
