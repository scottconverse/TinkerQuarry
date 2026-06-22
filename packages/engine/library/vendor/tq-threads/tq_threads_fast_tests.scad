// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads_fast_tests.scad  --  FAST smoke test (CI / headless safe).
//
// Two parts:
//   1. compile-time ASSERTIONS that every required preset resolves correctly
//      (these run even on F5 preview and on `openscad -o out.stl ...`).
//   2. a small, low-resolution render grid that exports quickly.
//
// Pass = renders with exit 0, finite facet count, and no WARNING / "not a
// valid 2-manifold" lines.  Typical headless render: a few seconds.
// ----------------------------------------------------------------------------

include <tq_threads.scad>

// ---- 1. preset resolution (the required coverage list) ---------------------
_required = [
    ["M2",0.40],["M3",0.50],["M4",0.70],["M5",0.80],["M6",1.00],["M8",1.25],
    ["M10",1.50],["M12",1.75],["M16",2.00],["M20",2.50],["M24",3.00],
    ["M30",3.50],["M36",4.00],["M42",4.50],["M48",5.00],["M56",5.50],["M64",6.00],
];
for (e = _required) {
    p = tq_preset(e[0]);
    assert(!is_undef(p), str("FAST TEST: preset ", e[0], " did not resolve"));
    assert(abs(p[1] - e[1]) < 1e-6,
           str("FAST TEST: preset ", e[0], " pitch = ", p[1], " expected ", e[1]));
}
echo("FAST TEST: all required presets resolve OK");

// ---- 2. tiny render grid ---------------------------------------------------
$fn = 24;
SP = 16;
L  = 5;
module cell(i) { translate([(i%5)*SP, -floor(i/5)*SP, 0]) children(); }

cell(0) tq_thread_preset("M3", L);
cell(1) tq_thread_preset("M8", L);
cell(2) tq_thread_tpi(d=6, tpi=24, length=L);
cell(3) tq_thread(8, 1.25, L, hand="left");
cell(4) tq_thread(8, 1.25, L, starts=2);

cell(5) tq_thread_cutter(8, 1.25, L);
cell(6) tq_nut(8, 1.25);
cell(7) tq_bolt(6, 1.0, 10, head="socket");
cell(8) tq_washer(6);
cell(9) tq_thread(8, 1.25, L, arc=180);

// v0.3 helper smoke cases
cell(10) tq_thread(10, 2, L, angle=55);            // custom flank angle
cell(11) tq_thread(10, 2, L, tooth_height=1.2);    // explicit tooth height
cell(12) tq_thread(10, 1.5, L, taper=2);           // tapered
cell(13) tq_auger(16, L);                          // auger flight
cell(14) tq_bolt(6, 1.0, 10, drive="phillips");    // Phillips drive
cell(15) tq_phillips_tip(2);                        // Phillips bit
cell(16) tq_tap(6, 1.0, L) cube([12,12,L]);        // child-wrapper tap
cell(17) tq_drill(5, L) translate([-6,-6,0]) cube([12,12,L]);   // child-wrapper drill
