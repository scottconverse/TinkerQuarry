// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads_heavy_tests.scad  --  FULL visual stress / demo grid.
//
// This is the big one: a wide grid covering presets, every variant, profiles,
// tolerances, and the hardware helpers.  It is meant for visual inspection
// (F5 preview is instant).  A single fused STL export (F6 / -o out.stl) builds
// an N-way CGAL union of ~35 disjoint solids and can take MINUTES -- that cost
// is the union, not any one part.  For CI use tq_threads_fast_tests.scad.
// ----------------------------------------------------------------------------

include <tq_threads.scad>

$fn = 40;
COLS = 6;
SP   = 20;
L    = 8;
module cell(i) { translate([(i%COLS)*SP, -floor(i/COLS)*SP, 0]) children(); }

// row: metric coarse presets
cell(0)  tq_thread_preset("M2",  L);
cell(1)  tq_thread_preset("M3",  L);
cell(2)  tq_thread_preset("M5",  L);
cell(3)  tq_thread_preset("M8",  L);
cell(4)  tq_thread_preset("M12", L);
cell(5)  tq_thread_preset("M16", L);

// row: more metric + unified
cell(6)  tq_thread_preset("M20", L);
cell(7)  tq_thread_preset("M24", L);
cell(8)  tq_thread_preset("1/4-20", L);
cell(9)  tq_thread_preset("3/8-16", L);
cell(10) tq_thread_preset("1/2-13", L);
cell(11) tq_thread_tpi(d=10, tpi=24, length=L);

// row: variants
cell(12) tq_thread(8, 1.25, L, hand="left");
cell(13) tq_thread(8, 1.25, L, starts=2);
cell(14) tq_thread(8, 1.25, L, starts=3);
cell(15) tq_thread(8, 1.25, L, profile="sharp");
cell(16) tq_thread(8, 1.25, L, profile="rounded");
cell(17) tq_thread(8, 1.25, L, arc=180);

// row: tolerance + ends
cell(18) tq_thread(8, 1.25, L, clearance=0.0);
cell(19) tq_thread(8, 1.25, L, clearance=0.8);
cell(20) tq_thread(8, 1.25, L, lead_in=false, lead_out=false);
cell(21) tq_thread_cutter(8, 1.25, L);
cell(22) tq_thread(20, 2.5, L);
cell(23) tq_bottle_thread(24, 4, L);

// row: hardware
cell(24) tq_nut(8, 1.25);
cell(25) tq_bolt(6, 1.0, 12, head="hex");
cell(26) tq_bolt(8, 1.25, 14, head="socket", shank=4);
cell(27) tq_countersunk_bolt(8, 1.25, 14, shank=4);
cell(28) tq_washer(8);
cell(29) tq_wood_screw(5, 14);

// row: more hardware + holes
cell(30) tq_standoff(5, 0.8, L);
cell(31) tq_rod_coupler(8, 1.25, 14);
cell(32) difference(){ translate([-9,-9,0]) cube([18,18,8]); tq_countersunk_clearance_hole(5,8); }
cell(33) difference(){ translate([-9,-9,0]) cube([18,18,12]); tq_recessed_clearance_hole(5,12); }
cell(34) difference(){ translate([-9,-9,0]) cube([18,18,6]); tq_clearance_hole(6,6); }

// row: v0.3 features
cell(35) tq_thread(10, 2, L, angle=45);            // custom 45-deg flank
cell(36) tq_thread(10, 2, L, tooth_height=1.5);    // explicit tooth height
cell(37) tq_thread(12, 1.75, L, taper=3);          // tapered
cell(38) tq_auger(20, 14);                          // auger flight
cell(39) tq_auger(18, 14, taper=6);                // tapered auger (drill-ish)
cell(40) tq_bolt(8, 1.25, 14, drive="phillips", shank=3);    // Phillips bolt
cell(41) tq_countersunk_bolt(8, 1.25, 14, drive="phillips"); // Phillips csk bolt
cell(42) tq_phillips_tip(2);                        // Phillips driver bit
cell(43) difference(){ tq_thread(10,1.5,L); translate([0,0,4]) tq_relief_groove(10); } // relief
cell(44) tq_tap(8, 1.25, L) cube([16,16,L]);       // child-wrapper tap
cell(45) tq_counterbore(5, L) translate([-8,-8,0]) cube([16,16,L]);  // child-wrapper counterbore

// debug view below the grid
translate([0, -8.5*SP, 0]) tq_thread_debug(8, 1.25, 12);
