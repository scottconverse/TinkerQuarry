<!-- SPDX-License-Identifier: MIT -->
# Changelog

All notable changes to tq-threads. Format loosely follows
[Keep a Changelog](https://keepachangelog.com); versions are git tags.

## [0.3.0] — 2026-06-22

Stronger-than-baseline release: adds the remaining helper categories users
expect from a general thread library, plus more profile control — all clean-room.

### Added
- **Custom flank angle** `angle=60` on `tq_thread` (e.g. 55° Whitworth-ish, 45°);
  thread height is derived from the angle (or set explicitly, below).
- **Explicit `tooth_height`** override on `tq_thread` (sets the radial flight
  depth directly instead of deriving it from the flats/angle).
- **Tapered threads** `taper=` on `tq_thread` (total diameter reduction over the
  length — NPT-ish tapers, auger tips, etc.).
- **`tq_auger` / `tq_auger_hole`** — deep coarse helical flight + matching
  negative (screw conveyor / drill / feed-screw style; generic, not a standard).
- **Phillips (cross) drive**: `tq_phillips_drive` (cruciform cutter/tip),
  `tq_phillips_tip` (driver bit), and `drive="phillips"` on `tq_bolt` /
  `tq_countersunk_bolt`; helpers `tq_ph_dims`, `tq_ph_size_for`.
- **Child-difference convenience wrappers** (ScrewHole/ClearanceHole in spirit,
  `tq_*` naming): `tq_tap`, `tq_drill`, `tq_counterbore`, `tq_countersink`.
- **`tq_relief_groove`** — thread-relief / runout groove cutter.

### Changed
- `tq_bolt` / `tq_countersunk_bolt` `drive` now selects `hex` | `phillips` |
  `none` via a shared `_tq_drive_recess` selector (was hex-only).
- The minor-radius safety assert now also accounts for `taper` (top of a tapered
  thread) in addition to the rounded-root depth.
- `_TQ_H` is no longer used for the flank-height calc (generalized to `angle`);
  default `angle=60` is bit-for-bit backward compatible with v0.2.
- Examples, fast/heavy test grids, README, MANUAL, and REFERENCES updated for
  every new helper.

## [0.2.0] — 2026-06-22

Feature-parity release: brings tq-threads to practical parity with common
OpenSCAD thread libraries while preserving clean-room provenance and MIT.

### Added
- **Presets M2–M64** metric coarse (ISO 261/262), common metric fine
  (`M8x1`, `M10x1.25`, `M12x1.5`, …), data-driven via `TQ_PRESETS` + `tq_preset`.
- **Hardware helpers**: `tq_countersunk_bolt`, `tq_wood_screw`, `tq_washer`,
  `tq_clearance_hole`, `tq_recessed_clearance_hole`,
  `tq_countersunk_clearance_hole`, `tq_rod_start`, `tq_rod_end`,
  `tq_rod_coupler`, `tq_hex`, `tq_hex_drive`.
- **Dimension-table functions**: `tq_clearance_dia` (ISO 273),
  `tq_washer_dims` (ISO 7089), `tq_nut_thickness` / `tq_nut_across_flats`
  (ISO 4032), `tq_shcs_head` / `tq_hex_key_af` (ISO 4762),
  `tq_csk_head_dia` (ISO 10642), `tq_hex_across_flats/corners`.
- **Real `$fs` support** in segment calculation (full `$fn`/`$fa`/`$fs` rule,
  with a `TQ_MIN_SEG` flank-quality floor).
- **Comprehensive input validation** (`assert`) across `tq_thread` and helpers:
  positive d/pitch/length/steps, valid arc/hand/profile/starts, sane
  clearance/chamfer, shank `< length`.
- Split test suites: `tq_threads_fast_tests.scad` (CI/headless, with preset
  assertions) and `tq_threads_heavy_tests.scad` (visual demo);
  `tq_threads_tests.scad` is now a compatibility wrapper → fast suite.
- `scripts/render-tests.ps1` headless render-proof; GitHub Actions CI.
- Full docs: landing-page `README.md`, `MANUAL.md`, architecture diagram,
  discussion seeds.

### Changed
- **Bolt solidity**: head/shank/thread now overlap by `TQ_EPS` and the thread's
  head-end is square, so bolts export as one coherent printable solid.
- `tq_bolt` socket drive recess is now in the bearing face; head/AF defaults come
  from the ISO tables.
- Examples are selectable without editing the file (`-D SHOW="bolt"` or a wrapper
  assignment); default is `"all"` only when `SHOW` is undefined.
- `tq_nut` defaults to ISO 4032 thickness/across-flats.

## [0.1.0] — 2026-06-22

Initial clean-room release.

### Added
- Core `tq_thread` (height-field polyhedron), `flat`/`sharp`/`rounded` profiles,
  multi-start, left/right hand, partial arc, lead-in/out chamfers, clearance.
- `tq_thread_preset` (M2–M12 + UNC/UNF), `tq_thread_tpi`, `tq_in`.
- `tq_threaded_rod`, `tq_thread_cutter`, `tq_threaded_hole`, `tq_nut`,
  `tq_standoff`, `tq_bolt`, `tq_bottle_thread`, `tq_thread_debug`.
- README, LICENSE (MIT), REFERENCES, examples, tests.
