<!-- SPDX-License-Identifier: MIT -->
# tq-threads — User Manual

Complete reference for the tq-threads OpenSCAD library. For a quick overview see
[README.md](README.md); for provenance see [REFERENCES.md](REFERENCES.md).

**Contents**

1. [Installation](#installation)
2. [Concepts](#concepts)
3. [The core module: `tq_thread`](#api) ← full parameter reference
4. [Presets & specs](#presets--specs)
5. [Threaded primitives](#threaded-primitives)
6. [Bolts & screws](#bolts--screws)
7. [Holes, washers, rods & couplers](#holes-washers-rods--couplers)
8. [Hardware dimension tables](#hardware-dimension-tables)
9. [Hex & drive helpers](#hex--drive-helpers)
10. [Resolution: `$fn` / `$fa` / `$fs`](#resolution)
11. [FDM tolerance deep-dive](#fdm-deep-dive)
12. [Heat-set inserts](#heat-set-inserts)
13. [Integration with other OSS](#integration)
14. [Migration from Dan Kirshner / rcolyer `threads.scad`](#migration)
15. [Testing & CI](#testing--ci)
16. [Troubleshooting](#troubleshooting)
17. [Limitations & roadmap](#limitations--roadmap)

---

## Installation

See [README → Install](README.md#install--use-as-a-library). In short: git
submodule, copy onto the OpenSCAD library path, or vendor `tq_threads.scad`
next to your model. Only `tq_threads.scad` is needed at runtime.

```openscad
include <tq_threads.scad>;   // brings in all modules + functions
```

`include` (not `use`) is recommended so the preset/dimension **functions** and
constants (`tq_preset`, `tq_in`, `TQ_PRESETS`, `TQ_THREADS_VERSION`) are visible.

---

## Concepts

A 60° thread is defined by its **major diameter** `d` and **pitch** `P`
(crest-to-crest distance). tq-threads builds the thread as a single watertight
`polyhedron`: the surface radius is a height-field over a cylinder,

```
r(z, θ) = profile( frac( (z − dir·(θ/360)·lead) / P ) )
```

so multi-start (`lead = starts·P`), hand (`dir = ±1`), and crest/root shape (the
`profile` lookup table) all fall out of one construction with no boolean unions.

- **External** thread = a bolt/rod (use the solid directly).
- **Internal** thread = a nut/tapped hole (subtract a `tq_thread_cutter`).
- **Clearance** is the printable fit allowance (see [FDM deep-dive](#fdm-deep-dive)).

---

## API

### `tq_thread(d, pitch, length, …)`

The one module everything else is built on. Produces an **external** thread by
default (or an oversize internal **cutter** with `internal=true`).

| Parameter | Default | Meaning |
|---|---|---|
| `d` | — | Nominal **major** diameter (mm). Crests reach `d/2` (minus tolerance). |
| `pitch` | — | Thread pitch (mm), crest-to-crest. |
| `length` | — | Threaded length along Z (mm). |
| `internal` | `false` | `true` → oversize negative cutter for nuts/holes. |
| `starts` | `1` | Number of thread starts (integer ≥ 1). `lead = starts·pitch`. |
| `hand` | `"right"` | `"right"` or `"left"`. |
| `clearance` | `0.4` | **Total diametral** fit gap (mm); external shrinks `clearance/2`, internal grows `clearance/2`. |
| `profile` | `"flat"` | `"flat"` (ISO/UN basic), `"sharp"` (full V), `"rounded"` (filleted root/crest). |
| `crest_flat` | `pitch/8` | Axial crest-flat width (mm) for `flat`. |
| `root_flat` | `pitch/4` | Axial root-flat width (mm) for `flat`. |
| `round` | `1` | Fillet scale for `profile="rounded"` (1 = standard ISO radii). |
| `lead_in` | `true` | Taper the **start** (Z=0) end so the thread begins cleanly. |
| `lead_out` | `true` | Taper the **far** (Z=length) end. |
| `chamfer` | `=thread height` | Axial length of the lead taper(s). |
| `arc` | `360` | Angular sweep in degrees; `<360` makes a partial arc. |
| `fn` | `undef` | Per-call angular segment override (else `$fn`/`$fa`/`$fs`). |
| `steps_per_pitch` | `16` | Axial sampling density (higher = crisper, heavier). |
| `center` | `false` | Center the length on Z (`true`) vs. base at Z=0. |

**Validation.** Bad inputs `assert` with a clear message instead of rendering
malformed geometry: non-positive `d`/`pitch`/`length`/`steps_per_pitch`, `arc`
outside `(0,360]`, `hand` not in `{right,left}`, `profile` not in
`{flat,sharp,rounded}`, non-integer/`<1` `starts`, negative `clearance`/`chamfer`,
flats exceeding the pitch, or a thread so deep the minor radius ≤ 0.

**Geometry produced (flat profile).** Crest at `d/2`, engaged height
`0.5413·P`, minor diameter `d − 1.0825·P` (ISO/UN basic). With `clearance`, the
whole profile shifts radially by `±clearance/2`.

```openscad
tq_thread(8, 1.25, 20);                              // M8 rod
tq_thread(8, 1.25, 20, hand="left", starts=2);       // 2-start left-hand
tq_thread(8, 1.25, 20, profile="rounded", round=1);  // rounded roots
tq_thread(8, 1.25, 20, arc=270);                     // 3/4 arc (split fittings)
tq_thread(8, 1.25, 20, internal=true);               // raw cutter solid
```

---

## Presets & specs

```openscad
tq_preset("M12")            // function -> [12, 1.75]  (or undef if unknown)
tq_thread_preset("M12", 24) // module -> renders the M12 thread, 24 mm
tq_thread_tpi(d=tq_in(1/4), tpi=20, length=12)        // by threads-per-inch
tq_in(3/8)                  // 9.525  (inch -> mm)
```

`tq_thread_preset` and `tq_thread_tpi` forward `internal`, `starts`, `hand`,
`clearance`, `profile`, `lead_in`, `lead_out`, `fn`, `center` to `tq_thread`.

Preset list: see [README → Presets](README.md#presets). Add your own by editing
the `TQ_PRESETS` table (`[name, major_mm, pitch_mm]`).

---

## Threaded primitives

```openscad
tq_threaded_rod(d, pitch, length, starts, hand, clearance, profile, fn, center);
tq_thread_cutter(d, pitch, length, …, through=true, center=false);  // negative
tq_threaded_hole(d, pitch, depth, …, through=true);                 // negative
tq_nut(d, pitch, height=ISO4032, across_flats=ISO4032, chamfer=true, …);
tq_standoff(d, pitch, length, od=d+4, …);                           // tapped boss
```

- **`tq_thread_cutter` / `tq_threaded_hole`** are the same oversize negative.
  Put inside a `difference()`. `through=true` adds a 0.5 mm overshoot at both
  ends for clean cuts; use `through=false` for blind holes.
- **`tq_nut`** subtracts a cutter from a chamfered hex prism. Defaults to ISO
  4032 thickness and across-flats for known sizes; both overridable.

```openscad
difference() { my_part(); tq_threaded_hole(6, 1.0, 12); }    // tapped through-hole
difference() { my_part(); tq_threaded_hole(6, 1.0, 8, through=false); }  // blind
```

---

## Bolts & screws

All bolt/screw modules fuse head + (optional shank) + thread with a small
`TQ_EPS` overlap so the export is **one coherent solid** (not merely-touching
volumes). The thread's head-end is square (no taper) so it runs cleanly into the
shank/head; the free end keeps its lead-in.

```openscad
tq_bolt(d, pitch, length, head="socket"|"hex"|"plain"|"none",
        head_d, head_h, shank=0, drive="hex", hand, clearance, profile, fn);

tq_countersunk_bolt(d, pitch, length, head_d=ISO10642, head_angle=90,
                    shank=0, drive="hex", …);

tq_wood_screw(d, length, pitch=0.6·d, head="countersunk"|"pan",
              head_d=2·d, point=true, clearance=0, …);
```

- **`tq_bolt`** — socket head has a hex drive recess in the bearing face; head
  defaults to ISO 4762 `dk`/`k` (socket) or ISO 4032 across-flats (hex). `shank`
  is an unthreaded shoulder length (`< length`), diameter flush with the crests.
- **`tq_countersunk_bolt`** — 90° flat head (ISO 10642 head diameter by default),
  wide at the bearing face, narrowing into the thread.
- **`tq_wood_screw`** — coarse, sharp-profile, single-start screw with a gimlet
  point carved by an envelope cone. Generic self-tapping/wood-style screw, **not**
  a specific wood-screw standard. `clearance=0` (it forms its own mating thread).

```openscad
tq_bolt(8, 1.25, 20, head="socket", shank=5);
tq_bolt(6, 1.0, 16, head="hex");
tq_countersunk_bolt(5, 0.8, 16);
tq_wood_screw(4, 18);
```

---

## Holes, washers, rods & couplers

```openscad
tq_clearance_hole(size, depth, fit="close"|"medium"|"free", through=true);
tq_recessed_clearance_hole(size, depth, head_d, head_h, fit, through);  // counterbore
tq_countersunk_clearance_hole(size, depth, head_d, angle=90, fit, through);
tq_washer(size, od=ISO7089, id=ISO7089, thk=ISO7089);
tq_rod_start(d, pitch, length, …);    // chamfered entry, square top
tq_rod_end(d, pitch, length, …);      // square bottom, chamfered finish
tq_rod_coupler(d, pitch, length, od=d+5, …);   // internally-threaded sleeve
tq_bottle_thread(d, pitch, length, internal=false, depth_frac=0.6, …);
```

- **Clearance holes** use ISO 273 diameters (`fit` selects close/medium/free);
  drop them into a `difference()`.
- **Recessed (counterbore)** adds a flat-bottom pocket for a cap head at the +Z
  face; **countersink** adds a 90° cone at the +Z face. Both default to the
  ISO head sizes + a small clearance.
- **`tq_rod_start` / `tq_rod_end`** are convenience wrappers controlling which
  end gets the lead-in chamfer — handy for building long rods in sections.
- **`tq_rod_coupler`** is a round coupling nut to join two threaded rods.

```openscad
difference() { plate(); tq_countersunk_clearance_hole(5, 8); }
difference() { plate(); tq_recessed_clearance_hole(5, 12); }   // M5 cap screw
tq_washer(8);                                                  // ISO 7089 M8
```

---

## Hardware dimension tables

Public lookup **functions** (return nominal ISO values; ratio fallback for
unlisted sizes). Use them directly when you need a number:

| Function | Returns | Standard |
|---|---|---|
| `tq_clearance_dia(size, fit)` | clearance hole Ø (mm) | ISO 273 |
| `tq_washer_dims(size)` | `[inner, outer, thickness]` | ISO 7089 |
| `tq_nut_thickness(size)` | hex nut height `m` | ISO 4032 |
| `tq_nut_across_flats(size)` | width across flats `s` | ISO 4032 |
| `tq_shcs_head(size)` | `[dk, k]` socket head | ISO 4762 |
| `tq_hex_key_af(size)` | hex-key across flats | ISO 4762 |
| `tq_csk_head_dia(size)` | countersunk head Ø | ISO 10642 |

```openscad
echo(tq_nut_thickness(8));     // 6.8
echo(tq_clearance_dia(5,"free"));  // 5.8
```

---

## Hex & drive helpers

```openscad
tq_hex(af, h, center=false);            // hex prism by across-flats width
tq_hex_drive(af, depth, center=false);  // hex socket tool (subtract)
tq_hex_across_corners(af);              // AF -> AC width (function)
tq_hex_across_flats(ac);               // AC -> AF width (function)
```

---

## Resolution

tq-threads honours the standard OpenSCAD special variables (this is **real
`$fs` support**):

- `fn=` argument or `$fn > 0` → exactly that many angular segments.
- Otherwise → `ceil(max(min(360/$fa, π·d/$fs), 5))`, clamped up to `TQ_MIN_SEG`
  (24) so flanks stay smooth even on small diameters.

`steps_per_pitch` controls **axial** sampling independently (raise for crisper
flanks on big coarse threads; lower to shrink the mesh on large parts).

```openscad
$fn = 96;                         tq_thread(8,1.25,10);  // fixed 96 segments
$fa = 6; $fs = 0.3;               tq_thread(8,1.25,10);  // fine auto resolution
tq_thread(8,1.25,10, fn=120, steps_per_pitch=24);        // per-call override
```

---

## FDM deep-dive

`clearance` = total diametral gap, split half to each mating part. A bolt and a
nut generated with the **same** `clearance` share the gap.

- Internal **oversize**: `internal=true` adds `clearance/2` to every radius.
- External **undersize**: `internal=false` removes `clearance/2`.
- For asymmetric bias (you only print the bolt, or only the nut), set a different
  `clearance` on each call, or set `clearance=0` and bake the allowance into `d`.

Starting points: tuned printer 0.2–0.3, default 0.4, loose 0.5–0.6, caps 0.5–0.8
mm. Print **axis vertical**; keep lead-in chamfers on; prefer `profile="rounded"`
for load-bearing roots; below ~0.7 mm pitch consider a heat-set insert.

A quick calibration cube: print M8 nuts at clearance 0.3/0.4/0.5 and keep the one
that spins on freely without slop.

---

## Heat-set inserts

Use brass heat-set inserts (not a printed thread) when the hole is small/fine
(≤ M3), assembled/disassembled often, needs high pull-out/torque, or threads
across layer lines. For those, print a **smooth tapered pilot** sized to the
insert spec:

```openscad
// pilot bore for a heat-set insert (size to your insert datasheet)
difference() { boss(); cylinder(h=insert_depth, d=insert_pilot_d); }
```

`tq_standoff` with a plain (non-threaded) bore also works as a boss for inserts.
Reserve `tq_threaded_hole` for printed threads ≥ M4 and coarse/cap threads.

---

## Integration

### Namespacing
Every public symbol is `tq_*`, so tq-threads coexists with any other library.
`include <tq_threads.scad>;` alongside others without clashes.

### BOSL2 / BOSL
Use BOSL2 for shapes, attachments, and rounding; use tq-threads for the actual
printable threads. To thread a BOSL2 part, `difference()` a `tq_thread_cutter`
out of it; tq-threads modules are ordinary children, so BOSL2's `attach()` /
`position()` can place them.

```openscad
include <BOSL2/std.scad>
include <tq_threads.scad>
difference() {
    cuboid([20,20,12], rounding=2);          // BOSL2
    tq_threaded_hole(6, 1.0, 12);            // tq-threads
}
```

### NopSCADlib / hardware catalogs
Keep using those for cosmetic/visualization parts (bearings, fans, vitamins).
Swap in tq-threads where you need a *printable* thread rather than a render-only
one.

### TinkerQuarry / KimCad
MIT is GPL-2.0-compatible, so vendor `tq_threads.scad` into the engine's
`library/` folder and `include` it from generated `.scad`. The plan→geometry
step can call presets by name, e.g. `tq_thread_preset("M8", len)` or
`tq_threaded_hole(d, pitch, depth)` for tapped features.

### Slicers
Export STL or 3MF; geometry is manifold, so no mesh-repair step is needed. Orient
the thread **axis vertical** for the cleanest flanks.

---

## Migration

Coming from Dan Kirshner / rcolyer `threads.scad`? tq-threads is a clean-room
*feature* equivalent (different code and API). Rough mapping:

| threads.scad-style call | tq-threads equivalent |
|---|---|
| `metric_thread(diameter, pitch, length)` | `tq_thread(d=diameter, pitch=pitch, length=length)` |
| `english_thread(dia_inch, tpi, len_inch)` | `tq_thread_tpi(d=tq_in(dia_inch), tpi=tpi, length=tq_in(len_inch))` |
| `metric_thread(..., internal=true)` | `tq_thread(..., internal=true)` or `tq_thread_cutter(...)` |
| `ScrewThread(od, len, pitch)` | `tq_thread(d=od, pitch=pitch, length=len)` |
| `ScrewHole(od, len, pitch=...)` wrapper | `difference(){ part(); tq_threaded_hole(od, pitch, len); }` |
| `RodStart` / `RodEnd` | `tq_rod_start` / `tq_rod_end` |
| `*_taper` / leadin options | `lead_in`, `lead_out`, `chamfer` |
| multi-start (`n_starts`) | `starts=` |
| left-hand flag | `hand="left"` |

Notes:
- tq-threads' `clearance` is a single diametral fit gap split half/half — tune it
  rather than per-side tolerances.
- Default profile is the ISO/UN **basic** (flat) form; use `profile="rounded"`
  for a deeper rounded root.

---

## Testing & CI

```sh
openscad -o out.stl tq_threads_fast_tests.scad      # fast: asserts + small grid
openscad -o demo.stl tq_threads_heavy_tests.scad    # heavy: full visual grid
```
```powershell
pwsh scripts/render-tests.ps1            # fast suite, with manifold-warning check
pwsh scripts/render-tests.ps1 -Heavy     # add the heavy grid
```
The fast suite also runs **compile-time assertions** that every required preset
(M2…M64) resolves to the correct pitch. CI (`.github/workflows/ci.yml`) runs the
fast suite on every push.

---

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `assert` failure on render | Read the message — it names the bad parameter. |
| Thread too tight / loose when printed | Adjust `clearance` (see [FDM](#fdm-deep-dive)); recalibrate. |
| Faceted / coarse flanks | Raise `$fn` or lower `$fs`; raise `steps_per_pitch`. |
| Huge mesh / slow render | Lower `$fn`/`steps_per_pitch`; it's a height-field. |
| Whole heavy grid STL takes minutes | Expected — N-way CGAL union; use F5 preview or render parts individually. |
| "minor radius ≤ 0" assert | Pitch too large for that diameter; reduce pitch or increase `d`. |
| Internal thread won't accept bolt | Match `clearance` on both parts; try +0.1 mm. |

---

## Limitations & roadmap

**Current limitations** (see also [README](README.md#limitations)):
- Internal threads via external-form cutter (pragmatic for FDM, not metrology-grade).
- Countersunk head diameters are nominal ISO 10642 values (overridable).
- No tapered pipe (NPT), ACME/trapezoidal, or buttress forms (60°-V only).

**Possible future work:** ACME/trapezoidal profile, true ISO internal profile
option, more named hardware presets, and a parametric thread-relief groove. PRs
and ideas welcome — see [CONTRIBUTING.md](CONTRIBUTING.md).
