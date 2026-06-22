<!-- category: General -->
# Integrating with BOSL2 & migrating from threads.scad

A place to share integration recipes and migration tips. Starter notes below —
please add yours.

## Coexisting with other libraries
Every public symbol is namespaced `tq_*`, so tq-threads coexists with BOSL2,
NopSCADlib, and friends without clashes. Use the other library for shapes,
attachments, and rounding; use tq-threads for the actual printable threads.

```openscad
include <BOSL2/std.scad>
include <tq_threads.scad>
difference() {
    cuboid([20,20,12], rounding=2);   // BOSL2 shape
    tq_threaded_hole(6, 1.0, 12);     // tq-threads tapped hole
}
```

## Migrating from Dan Kirshner / rcolyer `threads.scad`
tq-threads is a clean-room **feature** equivalent (different code + API):

| threads.scad-style | tq-threads |
|---|---|
| `metric_thread(d,p,l)` | `tq_thread(d=d, pitch=p, length=l)` |
| `english_thread(in,tpi,l)` | `tq_thread_tpi(d=tq_in(in), tpi=tpi, length=tq_in(l))` |
| `...internal=true` | `tq_thread(...,internal=true)` / `tq_thread_cutter(...)` |
| `ScrewHole(...)` | `difference(){ part(); tq_threaded_hole(d,pitch,len); }` |
| `RodStart/RodEnd` | `tq_rod_start / tq_rod_end` |
| `n_starts` | `starts=` · left-hand → `hand="left"` |

Full table + parameters in the [MANUAL](../../MANUAL.md#migration).

## TinkerQuarry / KimCad
MIT → GPL-2.0 compatible; vendor `tq_threads.scad` into the engine's `library/`
and call presets by name from generated `.scad`.

**Share your setup:** which libraries do you pair tq-threads with, and what
migration gotchas did you hit?
