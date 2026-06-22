// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads_examples.scad  --  worked examples for every major feature plus
// realistic printable parts.
//
// Pick what to show WITHOUT editing this file:
//   command line:  openscad -D 'SHOW="bolt"' -o bolt.stl tq_threads_examples.scad
//   wrapper file:  SHOW="bolt"; include <tq_threads_examples.scad>
// SHOW is read only if the caller defined it; this file never assigns it, so a
// wrapper's value (or a -D value) survives and "all" is the default.
//
// Recognised ids are listed in the dispatch at the bottom.
// ----------------------------------------------------------------------------

include <tq_threads.scad>

$fn = 64;
_show = is_undef(SHOW) ? "all" : SHOW;

// ============================================================================
//  FEATURE GALLERY
// ============================================================================
module gallery() {
    sp = 16;
    g = [[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[2,1],[3,1],[0,2],[1,2],[2,2],[3,2]];
    translate([g[0][0]*sp, g[0][1]*sp, 0])  tq_thread(6, 1.0, 10);                       // metric ext
    translate([g[1][0]*sp, g[1][1]*sp, 0])  tq_thread_cutter(6, 1.0, 10);               // metric int cutter
    translate([g[2][0]*sp, g[2][1]*sp, 0])  tq_thread_preset("1/4-20", 10);             // unified ext
    translate([g[3][0]*sp, g[3][1]*sp, 0])  tq_thread_cutter(tq_in(3/8), 25.4/16, 10);  // unified int
    translate([g[4][0]*sp, g[4][1]*sp, 0])  tq_thread(d=9, pitch=1.4, length=10);       // custom d/pitch
    translate([g[5][0]*sp, g[5][1]*sp, 0])  tq_thread_tpi(d=9, tpi=18, length=10);      // custom d/TPI
    translate([g[6][0]*sp, g[6][1]*sp, 0])  tq_thread(6, 1.0, 10, hand="left");         // left-hand
    translate([g[7][0]*sp, g[7][1]*sp, 0])  tq_thread(8, 1.5, 12, starts=3);            // 3-start
    translate([g[8][0]*sp, g[8][1]*sp, 0])  tq_thread(6, 1.5, 10, profile="sharp");     // sharp
    translate([g[9][0]*sp, g[9][1]*sp, 0])  tq_thread(6, 1.5, 10, profile="rounded");   // rounded
    translate([g[10][0]*sp, g[10][1]*sp, 0]) tq_thread(6, 1.0, 10, lead_in=false, lead_out=false); // square
    translate([g[11][0]*sp, g[11][1]*sp, 0]) tq_thread(8, 1.25, 10, arc=180);           // partial arc
}

// ============================================================================
//  REALISTIC PARTS
// ============================================================================
module ex_knob() {                                   // knob with captive tapped hole
    kd=30; kh=14; bore=8; bp=1.25;
    difference() {
        union() {
            cylinder(h=kh, d=kd, $fn=90);
            translate([0,0,kh]) scale([1,1,0.35]) sphere(d=kd*0.85, $fn=90);
        }
        for (a=[0:24:359]) rotate(a) translate([kd/2+1.5,0,-1]) cylinder(h=kh+2, d=7, $fn=28);
        translate([0,0,-0.01]) tq_threaded_hole(bore, bp, kh*0.7, through=false);
    }
}
module ex_cap() {                                    // bottle/jar cap (internal coarse thread)
    d=40; pitch=4; thr=14; wall=2.5; top=2.5; or=d/2 + 0.144*pitch + wall;
    difference() {
        cylinder(h=thr+top, r=or, $fn=120);
        translate([0,0,top]) tq_bottle_thread(d, pitch, thr+1, internal=true, clearance=0.6);
        union() for (a=[0:18:359]) rotate(a) translate([or,0,top]) cylinder(h=thr+top+1, d=2.5, $fn=12);
    }
}
module ex_neck() {                                   // matching threaded spout
    d=40; pitch=4; thr=14;
    difference() {
        union() { cylinder(h=6, d=d+8, $fn=140); translate([0,0,6]) tq_bottle_thread(d, pitch, thr); }
        translate([0,0,-1]) cylinder(h=thr+10, d=d-9, $fn=140);
    }
}
module ex_insert() {                                 // tapped boss/bracket
    bw=22; bl=22; bh=14; hole=5; hp=0.8;
    difference() {
        union() { translate([-bw/2,-bl/2,0]) cube([bw,bl,4]); cylinder(h=bh, d=hole+7, $fn=64); }
        translate([0,0,-0.01]) tq_threaded_hole(hole, hp, bh+0.02);
        for (x=[-bw/2+4, bw/2-4]) translate([x, bl/2-4, -1]) cylinder(h=6, d=3.4, $fn=24);
    }
}
module ex_bolt()     { tq_bolt(d=8, pitch=1.25, length=20, head="socket", shank=4); }
module ex_hexbolt()  { tq_bolt(d=8, pitch=1.25, length=20, head="hex", shank=4); }
module ex_nut()      { tq_nut(d=8, pitch=1.25); }
module ex_csk_bolt() { tq_countersunk_bolt(d=8, pitch=1.25, length=20, shank=4); }
module ex_washer()   { tq_washer(8); }
module ex_wood()     { tq_wood_screw(d=5, length=20); }
module ex_coupler()  { tq_rod_coupler(d=8, pitch=1.25, length=18); }
module ex_standoff() { tq_standoff(d=5, pitch=0.8, length=14, od=9); }
module ex_adapter() {                                // M10 male <-> M6 female
    od=16; bodyh=12; maleh=12; femh=9;
    difference() {
        union() { tq_hex(od, bodyh); translate([0,0,-maleh]) tq_thread(10, 1.5, maleh); }
        translate([0,0,bodyh-femh]) tq_threaded_hole(6, 1.0, femh+0.01, through=false);
    }
}
module ex_csk_plate() {                              // plate with a countersunk hole
    difference() { translate([-12,-12,0]) cube([24,24,8]); translate([0,0,0]) tq_countersunk_clearance_hole(5,8); }
}
module ex_counterbore_plate() {                      // plate with a recessed (counterbored) hole
    difference() { translate([-12,-12,0]) cube([24,24,12]); translate([0,0,0]) tq_recessed_clearance_hole(5,12); }
}
module ex_debug()    { tq_thread_debug(8, 1.25, 12); }

// ============================================================================
//  LAYOUT / DISPATCH
// ============================================================================
module parts_row() {
    translate([  0,0,0]) ex_knob();
    translate([ 55,0,0]) ex_cap();
    translate([110,0,0]) ex_neck();
    translate([165,0,0]) ex_insert();
    translate([205,0,0]) ex_bolt();
    translate([235,0,0]) ex_csk_bolt();
    translate([265,0,0]) ex_nut();
    translate([295,0,0]) ex_washer();
    translate([320,0,0]) ex_wood();
    translate([350,0,0]) ex_coupler();
    translate([385,0,0]) ex_adapter();
    translate([420,0,0]) ex_csk_plate();
    translate([460,0,0]) ex_counterbore_plate();
}

if      (_show == "all")            { gallery(); translate([0,-70,0]) parts_row(); }
else if (_show == "features")       gallery();
else if (_show == "parts")          parts_row();
else if (_show == "knob")           ex_knob();
else if (_show == "cap")            ex_cap();
else if (_show == "neck")           ex_neck();
else if (_show == "insert")         ex_insert();
else if (_show == "bolt")           ex_bolt();
else if (_show == "hexbolt")        ex_hexbolt();
else if (_show == "nut")            ex_nut();
else if (_show == "csk_bolt")       ex_csk_bolt();
else if (_show == "washer")         ex_washer();
else if (_show == "wood")           ex_wood();
else if (_show == "coupler")        ex_coupler();
else if (_show == "standoff")       ex_standoff();
else if (_show == "adapter")        ex_adapter();
else if (_show == "csk_plate")      ex_csk_plate();
else if (_show == "counterbore")    ex_counterbore_plate();
else if (_show == "debug")          ex_debug();
else echo(str("tq_threads_examples: unknown SHOW='", _show, "' (see dispatch list)"));
