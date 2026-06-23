// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads.scad  --  TinkerQuarry first-party printable thread library
//
// Copyright (c) 2026 Scott Converse / TinkerQuarry contributors
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, subject to the conditions in the accompanying LICENSE.
//
// The MIT license is GPL-2.0-compatible, so this file may be included in a
// GPL-2.0-only project (e.g. TinkerQuarry) without relicensing difficulty.
//
// CLEAN-ROOM NOTICE
//   Written from first principles using only public engineering standards and
//   formulae (ISO 68-1, ISO 261/262, ISO 965, ISO 273, ISO 4032, ISO 4762,
//   ISO 7089, ISO 10642, and ASME B1.1 / Unified thread geometry).  It does
//   NOT copy, translate, or derive from any third-party thread library.  See
//   REFERENCES.md.
//
// MODEL OF OPERATION (why this is robust)
//   A 60-degree thread is generated as a single watertight polyhedron whose
//   surface radius r is a height-field over a cylinder:
//
//       r(z, theta) = profile( frac( (z - dir * (theta/360) * lead) / P ) )
//
//   * one continuous surface wrapped 360 degrees + two centre-fan end caps
//     => closed 2-manifold by construction (no booleans, no coincident faces)
//   * multi-start falls out for free by using lead = starts * P in the phase
//   * left/right hand is just the sign of dir
//   * the radial profile is a small [axial, radius] table evaluated with the
//     built-in lookup() interpolator, so crest/root shaping is data-driven
//
// UNITS: millimetres (OpenSCAD default).  Use tq_in() for inch dimensions.
// FULL API + MANUAL: see README.md and MANUAL.md.
// ----------------------------------------------------------------------------

// ============================================================================
//  LOW-LEVEL CONSTANTS & HELPERS
// ============================================================================

// Library version (filenames are fixed by the `include` API; version lives
// here and in the git tag / CHANGELOG / GitHub release).
TQ_THREADS_VERSION = "0.4.0";

// sqrt(3)/2 : height of a sharp 60-degree V per unit pitch (H = 0.86603 * P)
_TQ_H = 0.86602540378;

// quality floor for thread flanks when $fn is unset (OpenSCAD's own floor is 5)
TQ_MIN_SEG = 24;

// inch -> millimetre
function tq_in(x) = x * 25.4;

// always-positive modulo, result in [0, m)
function _tq_pmod(a, m) = a - m * floor(a / m);

// face index for the (i,j) outer grid vertex (j wraps around na segments)
function _tq_id(i, j, na) = i * na + (j % na);

// Choose the number of angular segments for a circle of diameter d, honouring
// the standard OpenSCAD special variables (this is REAL $fs support):
//   fn arg / $fn > 0 -> that fixed count (>= 3)
//   otherwise        -> ceil(max(min(360/$fa, circumference/$fs), 5))  -- the
//                       exact OpenSCAD $fa/$fs rule (circumference = PI*d) --
//                       then clamped up to TQ_MIN_SEG for smooth flanks.
// Set $fn for an exact count, or lower $fs / $fa for finer auto resolution.
function _tq_aseg(d, fn) =
    !is_undef(fn) ? max(3, floor(fn))
  : ($fn > 0)     ? max(3, floor($fn))
  :                 max(TQ_MIN_SEG,
                       ceil(max(min(360 / max($fa, 0.01),
                                    (PI * d) / max($fs, 0.01)), 5)));

// ============================================================================
//  THREAD PROFILE TABLES   ->  [ [axial_in_pitch, radius], ... ]  (ascending)
//  One pitch spans axial 0..P.  The crest is centred at P/2; the root straddles
//  the 0/P wrap.  lookup() linearly interpolates between control points, so a
//  straight flank only needs its two endpoints.
// ============================================================================

// Sharp V (no flats).  Thin crests print poorly; used for self-tapping screws.
function _tq_table_sharp(P, Rmin, Rmaj) =
    [ [0, Rmin], [P/2, Rmaj], [P, Rmin] ];

// Truncated trapezoid (ISO / UN basic design profile).
//   cf = axial crest-flat width (default P/8), rf = axial root-flat width (P/4)
function _tq_table_flat(P, Rmin, Rmaj, cf, rf) =
    let( f1 = rf/2, f2 = P/2 - cf/2, f3 = P/2 + cf/2, f4 = P - rf/2 )
    [ [0, Rmin], [f1, Rmin], [f2, Rmaj], [f3, Rmaj], [f4, Rmin], [P, Rmin] ];

// Rounded crest & root.  Fillet radii follow the classic UN/ISO geometry
// (root ~0.144*P, crest ~0.072*P) scaled by `rnd`.  Flanks stay at 60 deg
// because the tangent points are derived from the same triangle.
function _tq_table_round(P, Rmin, Rmaj, rnd, nseg) =
    let(
        rc  = rnd * 0.0722 * P,      // crest fillet radius
        rr  = rnd * 0.1443 * P,      // root  fillet radius
        ccr = Rmaj - 0.5 * rc,       // crest arc centre height
        rc0 = Rmin + 0.5 * rr        // root  arc centre height
    )
    concat(
        [ for (k = [0:nseg]) let(phi = 270 + k*(60/nseg))
              [ rr*cos(phi), rc0 + rr*sin(phi) ] ],           // root, right half
        [ for (k = [0:nseg]) let(phi = 150 - k*(120/nseg))
              [ P/2 + rc*cos(phi), ccr + rc*sin(phi) ] ],     // crest arc
        [ for (k = [0:nseg]) let(phi = 210 + k*(60/nseg))
              [ P + rr*cos(phi), rc0 + rr*sin(phi) ] ]        // root, left half
    );

// ============================================================================
//  CORE GEOMETRY  --  helical height-field polyhedron
// ============================================================================
module _tq_thread_solid(P, L, Rmaj, Rmin, lead, dir, table, ci, co, na, nz, taper=0) {
    dz = L / nz;
    pts = concat(
        [ for (i = [0:nz], j = [0:na-1])
              let( z  = i * dz,
                   th = j * (360 / na),
                   a  = _tq_pmod(z - dir * (th/360) * lead, P),
                   r0 = lookup(a, table),
                   shrink = (taper / 2) * (z / L),       // linear radial taper
                   f  = min( ci > 0 ? min(z/ci, 1) : 1,
                             co > 0 ? min((L - z)/co, 1) : 1 ),
                   r  = (Rmin - shrink) + (r0 - Rmin) * f )
              [ r * cos(th), r * sin(th), z ] ],
        [ [0, 0, 0], [0, 0, L] ]                       // bottom & top centres
    );
    cB = (nz + 1) * na;        // bottom centre vertex index
    cT = cB + 1;               // top centre vertex index
    faces = concat(
        [ for (i = [0:nz-1], j = [0:na-1]) each [
              [ _tq_id(i, j, na),   _tq_id(i+1, j, na),   _tq_id(i+1, j+1, na) ],
              [ _tq_id(i, j, na),   _tq_id(i+1, j+1, na), _tq_id(i,   j+1, na) ]
          ] ],
        [ for (j = [0:na-1]) [ cB, _tq_id(0, j, na),  _tq_id(0, j+1, na) ] ],
        [ for (j = [0:na-1]) [ cT, _tq_id(nz, j+1, na), _tq_id(nz, j, na) ] ]
    );
    polyhedron(points = pts, faces = faces, convexity = 2 * ceil(L/P) + 6);
}

// pie-slice polygon (0..ang degrees) of radius r, for partial-arc threads
module _tq_sector(ang, r, seg) {
    n  = max(2, ceil(seg * ang / 360));
    pts = concat([[0, 0]],
                 [ for (k = [0:n]) let(t = ang * k / n) [ r*cos(t), r*sin(t) ] ]);
    polygon(pts);
}

// ----------------------------------------------------------------------------
//  ISO 965-1 tolerance POSITION (fundamental deviation / allowance)
//  These are the standard ISO 965-1 formulae for the fundamental deviation in
//  micrometres (P in mm).  This models the tolerance *position* (allowance)
//  only -- NOT the tolerance grade (band width); tq-threads renders a single
//  nominal surface, so it is NOT metrology-grade.  See REFERENCES.md / docs.
//    external positions e,f,g,h ; internal positions G,H
//  Returns the DIAMETRAL deviation in mm (negative shrinks, positive grows),
//  or undef for an unknown position letter.
function _tq_fit_dev_mm(letter, P) =
      letter=="e" ? -(50 + 11*P)/1000
    : letter=="f" ? -(30 + 11*P)/1000
    : letter=="g" ? -(15 + 11*P)/1000
    : letter=="h" ?  0
    : letter=="G" ? +(15 + 11*P)/1000
    : letter=="H" ?  0
    : undef;
// position letter from a class string: last char ("6g"->"g", "6H"->"H", "g"->"g")
function _tq_fit_letter(cls) = cls[len(cls)-1];
function _tq_fit_is_external(letter) =
    letter=="e" || letter=="f" || letter=="g" || letter=="h";
function _tq_fit_is_internal(letter) = letter=="G" || letter=="H";

// ============================================================================
//  PUBLIC :  tq_thread()  --  the one module everything else is built on
// ============================================================================
module tq_thread(d, pitch, length,
                 internal       = false,
                 starts         = 1,
                 hand           = "right",
                 clearance      = 0.4,
                 fit            = undef,
                 profile        = "flat",
                 angle          = 60,
                 tooth_height   = undef,
                 minor_d        = undef,
                 crest_flat     = undef,
                 root_flat      = undef,
                 round          = 1,
                 lead_in        = true,
                 lead_out       = true,
                 chamfer        = undef,
                 taper          = 0,
                 arc            = 360,
                 fn             = undef,
                 steps_per_pitch= 16,
                 center         = false)
{
    // -- input validation: fail loudly with a useful message --------------
    assert(is_num(d) && d > 0,
           str("tq_thread: d (major diameter) must be > 0, got ", d));
    assert(is_num(pitch) && pitch > 0,
           str("tq_thread: pitch must be > 0, got ", pitch));
    assert(is_num(length) && length > 0,
           str("tq_thread: length must be > 0, got ", length));
    assert(is_num(steps_per_pitch) && steps_per_pitch > 0,
           str("tq_thread: steps_per_pitch must be > 0, got ", steps_per_pitch));
    assert(is_num(arc) && arc > 0 && arc <= 360,
           str("tq_thread: arc must be in (0,360], got ", arc));
    assert(hand == "right" || hand == "left",
           str("tq_thread: hand must be \"right\" or \"left\", got ", hand));
    assert(profile == "flat" || profile == "sharp" || profile == "rounded",
           str("tq_thread: profile must be flat|sharp|rounded, got ", profile));
    assert(is_num(starts) && starts >= 1 && starts == floor(starts),
           str("tq_thread: starts must be an integer >= 1, got ", starts));
    assert(is_num(clearance) && clearance >= 0,
           str("tq_thread: clearance must be >= 0, got ", clearance));
    assert(is_undef(chamfer) || (is_num(chamfer) && chamfer >= 0),
           "tq_thread: chamfer must be >= 0 (or undef for auto)");
    assert(is_num(angle) && angle > 0 && angle < 180,
           str("tq_thread: angle (included flank angle) must be in (0,180), got ", angle));
    assert(is_undef(tooth_height) || (is_num(tooth_height) && tooth_height > 0),
           "tq_thread: tooth_height must be > 0 (or undef to derive from angle)");
    assert(is_num(taper) && taper >= 0,
           str("tq_thread: taper (total dia reduction over length) must be >= 0, got ", taper));
    assert(is_undef(minor_d) || (is_num(minor_d) && minor_d > 0 && minor_d < d),
           str("tq_thread: minor_d must be in (0, d=", d, "), got ", minor_d));
    // ISO 965 fit position (optional). Case must match internal/external.
    _fl  = is_undef(fit) ? undef : _tq_fit_letter(fit);
    assert(is_undef(fit) || (internal ? _tq_fit_is_internal(_fl) : _tq_fit_is_external(_fl)),
           str("tq_thread: fit '", fit, "' must be an ISO 965 position letter matching the ",
               internal ? "internal thread (G or H, e.g. \"6H\")" : "external thread (e/f/g/h, e.g. \"6g\")"));

    P   = pitch;
    cf  = is_undef(crest_flat) ? P/8 : crest_flat;
    rf  = is_undef(root_flat)  ? P/4 : root_flat;
    // radial flank height: explicit, or from minor_d, or derived from the angle.
    h   = !is_undef(tooth_height) ? tooth_height
        : !is_undef(minor_d)      ? (d - minor_d) / 2
        :                           (P - cf - rf) / (2 * tan(angle/2));
    // tolerance shift (radial): FDM clearance + optional ISO 965 allowance.
    fit_dev = is_undef(fit) ? 0 : _tq_fit_dev_mm(_fl, P);   // diametral (mm)
    off  = (internal ? +1 : -1) * clearance / 2 + fit_dev / 2;
    Rmaj = d/2 + off;
    Rmin = Rmaj - h;
    // worst-case core radius: rounded roots dip ~0.5*rr below Rmin, and a taper
    // shrinks everything by taper/2 at the top.
    rmin_floor = (profile == "rounded" ? Rmin - 0.5 * round * 0.1443 * P : Rmin)
                 - taper / 2;

    assert(h > 0,
           "tq_thread: flats/angle leave no flank (h <= 0); reduce crest_flat/root_flat");
    assert(cf + rf < P,
           "tq_thread: crest_flat + root_flat must be < pitch");
    assert(rmin_floor > 0.05,
           str("tq_thread: thread too deep for d=", d, " pitch=", pitch,
               " (effective minor radius ", rmin_floor,
               " <= 0); use a bigger d, smaller pitch/tooth_height/taper"));

    lead = starts * P;
    dir  = (hand == "left") ? -1 : 1;
    nz   = max(2, ceil(length / P * steps_per_pitch));
    ch   = is_undef(chamfer) ? h : chamfer;
    ci   = lead_in  ? ch : 0;
    co   = lead_out ? ch : 0;
    na   = _tq_aseg(d, fn);

    table = (profile == "sharp")   ? _tq_table_sharp(P, Rmin, Rmaj)
          : (profile == "rounded") ? _tq_table_round(P, Rmin, Rmaj, round, 6)
          :                          _tq_table_flat (P, Rmin, Rmaj, cf, rf);

    translate([0, 0, center ? -length/2 : 0])
        if (arc >= 360)
            _tq_thread_solid(P, length, Rmaj, Rmin, lead, dir, table, ci, co, na, nz, taper);
        else
            intersection() {
                _tq_thread_solid(P, length, Rmaj, Rmin, lead, dir, table, ci, co, na, nz, taper);
                translate([0, 0, -1])
                    linear_extrude(length + 2) _tq_sector(arc, Rmaj + 1, na);
            }
}

// ============================================================================
//  PRESETS  --  standard named threads (data-driven; [name, major, pitch])
//  Metric coarse per ISO 261/262; common metric fine; Unified per ASME B1.1.
// ============================================================================
TQ_PRESETS = [
    // == metric COARSE (ISO 261 general plan; nominal major + coarse pitch) ==
    ["M1.6",1.6, 0.35], ["M2",  2.0, 0.40], ["M2.5", 2.5, 0.45],
    ["M3",  3.0, 0.50], ["M3.5",3.5, 0.60], ["M4",   4.0, 0.70],
    ["M5",  5.0, 0.80], ["M6",  6.0, 1.00], ["M7",   7.0, 1.00],
    ["M8",  8.0, 1.25], ["M10",10.0, 1.50], ["M12", 12.0, 1.75],
    ["M14",14.0, 2.00], ["M16",16.0, 2.00], ["M18", 18.0, 2.50],
    ["M20",20.0, 2.50], ["M22",22.0, 2.50], ["M24", 24.0, 3.00],
    ["M27",27.0, 3.00], ["M30",30.0, 3.50], ["M33", 33.0, 3.50],
    ["M36",36.0, 4.00], ["M39",39.0, 4.00], ["M42", 42.0, 4.50],
    ["M45",45.0, 4.50], ["M48",48.0, 5.00], ["M52", 52.0, 5.00],
    ["M56",56.0, 5.50], ["M60",60.0, 5.50], ["M64", 64.0, 6.00],
    // == metric FINE (ISO 261 fine-pitch series) ===========================
    ["M3x0.35",3.0,0.35], ["M4x0.5",4.0,0.50], ["M5x0.5",5.0,0.50],
    ["M6x0.75",6.0,0.75], ["M8x1",8.0,1.00], ["M8x0.75",8.0,0.75],
    ["M10x1.25",10.0,1.25], ["M10x1",10.0,1.00], ["M10x0.75",10.0,0.75],
    ["M12x1.5",12.0,1.50], ["M12x1.25",12.0,1.25], ["M12x1",12.0,1.00],
    ["M14x1.5",14.0,1.50], ["M16x1.5",16.0,1.50], ["M16x1",16.0,1.00],
    ["M18x2",18.0,2.00], ["M18x1.5",18.0,1.50], ["M20x2",20.0,2.00],
    ["M20x1.5",20.0,1.50], ["M20x1",20.0,1.00], ["M22x1.5",22.0,1.50],
    ["M24x2",24.0,2.00], ["M24x1.5",24.0,1.50], ["M27x2",27.0,2.00],
    ["M30x3",30.0,3.00], ["M30x2",30.0,2.00], ["M30x1.5",30.0,1.50],
    ["M33x2",33.0,2.00], ["M36x3",36.0,3.00], ["M36x2",36.0,2.00],
    ["M42x3",42.0,3.00], ["M48x3",48.0,3.00],
    // == Unified NUMBERED (ASME B1.1; major = 0.060+0.013*N in) ============
    // UNC
    ["#1-64",tq_in(0.073),25.4/64], ["#2-56",tq_in(0.086),25.4/56],
    ["#3-48",tq_in(0.099),25.4/48], ["#4-40",tq_in(0.112),25.4/40],
    ["#5-40",tq_in(0.125),25.4/40], ["#6-32",tq_in(0.138),25.4/32],
    ["#8-32",tq_in(0.164),25.4/32], ["#10-24",tq_in(0.190),25.4/24],
    ["#12-24",tq_in(0.216),25.4/24],
    // UNF
    ["#0-80",tq_in(0.060),25.4/80], ["#1-72",tq_in(0.073),25.4/72],
    ["#2-64",tq_in(0.086),25.4/64], ["#3-56",tq_in(0.099),25.4/56],
    ["#4-48",tq_in(0.112),25.4/48], ["#5-44",tq_in(0.125),25.4/44],
    ["#6-40",tq_in(0.138),25.4/40], ["#8-36",tq_in(0.164),25.4/36],
    ["#10-32",tq_in(0.190),25.4/32], ["#12-28",tq_in(0.216),25.4/28],
    // == Unified FRACTIONAL (ASME B1.1; major = fraction*25.4) =============
    // UNC
    ["1/4-20",tq_in(1/4),25.4/20], ["5/16-18",tq_in(5/16),25.4/18],
    ["3/8-16",tq_in(3/8),25.4/16], ["7/16-14",tq_in(7/16),25.4/14],
    ["1/2-13",tq_in(1/2),25.4/13], ["9/16-12",tq_in(9/16),25.4/12],
    ["5/8-11",tq_in(5/8),25.4/11], ["3/4-10",tq_in(3/4),25.4/10],
    ["7/8-9",tq_in(7/8),25.4/9],   ["1-8",tq_in(1),25.4/8],
    // UNF
    ["1/4-28",tq_in(1/4),25.4/28], ["5/16-24",tq_in(5/16),25.4/24],
    ["3/8-24",tq_in(3/8),25.4/24], ["7/16-20",tq_in(7/16),25.4/20],
    ["1/2-20",tq_in(1/2),25.4/20], ["9/16-18",tq_in(9/16),25.4/18],
    ["5/8-18",tq_in(5/8),25.4/18], ["3/4-16",tq_in(3/4),25.4/16],
    ["7/8-14",tq_in(7/8),25.4/14], ["1-12",tq_in(1),25.4/12],
];

// linear search; returns [major, pitch] or undef
function _tq_find(name, i = 0) =
      i >= len(TQ_PRESETS)        ? undef
    : TQ_PRESETS[i][0] == name    ? [TQ_PRESETS[i][1], TQ_PRESETS[i][2]]
    : _tq_find(name, i + 1);

// Public: [major_diameter_mm, pitch_mm] for a preset name, or undef.
function tq_preset(name) = _tq_find(name);

// Number of named presets (for tests/introspection).
function tq_preset_count() = len(TQ_PRESETS);

// Table self-check: returns true iff EVERY preset row is well-formed (string
// name, positive major & pitch) AND resolves through tq_preset() to its own
// values.  Use in a parse/render-time assert: assert(tq_presets_selfcheck()).
function tq_presets_selfcheck(i = 0) =
      i >= len(TQ_PRESETS) ? true
    : ( is_string(TQ_PRESETS[i][0])
        && is_num(TQ_PRESETS[i][1]) && TQ_PRESETS[i][1] > 0
        && is_num(TQ_PRESETS[i][2]) && TQ_PRESETS[i][2] > 0
        && tq_preset(TQ_PRESETS[i][0]) == [TQ_PRESETS[i][1], TQ_PRESETS[i][2]] )
      ? tq_presets_selfcheck(i + 1) : false;

// Thread by preset name.  Extra args forwarded to tq_thread().
module tq_thread_preset(name, length, internal=false, starts=1, hand="right",
                        clearance=0.4, profile="flat", lead_in=true,
                        lead_out=true, fn=undef, center=false) {
    p = tq_preset(name);
    assert(!is_undef(p), str("tq_thread_preset: unknown preset '", name,
                             "' (see TQ_PRESETS / README)"));
    tq_thread(d=p[0], pitch=p[1], length=length, internal=internal,
              starts=starts, hand=hand, clearance=clearance, profile=profile,
              lead_in=lead_in, lead_out=lead_out, fn=fn, center=center);
}

// Thread specified by threads-per-inch instead of pitch.
module tq_thread_tpi(d, tpi, length, internal=false, starts=1, hand="right",
                     clearance=0.4, profile="flat", lead_in=true, lead_out=true,
                     fn=undef, center=false) {
    assert(is_num(tpi) && tpi > 0, str("tq_thread_tpi: tpi must be > 0, got ", tpi));
    tq_thread(d=d, pitch=25.4/tpi, length=length, internal=internal,
              starts=starts, hand=hand, clearance=clearance, profile=profile,
              lead_in=lead_in, lead_out=lead_out, fn=fn, center=center);
}

// ============================================================================
//  STANDARD HARDWARE DIMENSION TABLES  (public lookup functions)
//  Values are nominal per the cited ISO standards; unknown sizes fall back to
//  a sensible ratio so custom diameters still work.
// ============================================================================

// ISO 273 clearance-hole diameter (mm).  fit: "close" | "medium" | "free".
function tq_clearance_dia(size, fit="medium") =
    let(r =
        size==2   ? [2.2, 2.4, 2.6]   : size==2.5 ? [2.7, 2.9, 3.1] :
        size==3   ? [3.2, 3.4, 3.6]   : size==3.5 ? [3.7, 3.9, 4.2] :
        size==4   ? [4.3, 4.5, 4.8]   : size==5   ? [5.3, 5.5, 5.8] :
        size==6   ? [6.4, 6.6, 7.0]   : size==8   ? [8.4, 9.0, 10.0] :
        size==10  ? [10.5,11.0,12.0]  : size==12  ? [13.0,13.5,14.5] :
        size==14  ? [15.0,15.5,16.5]  : size==16  ? [17.0,17.5,18.5] :
        size==20  ? [21.0,22.0,24.0]  : size==24  ? [25.0,26.0,28.0] :
        [size*1.07, size*1.12, size*1.2])
    fit=="close" ? r[0] : fit=="free" ? r[2] : r[1];

// ISO 7089 plain washer (form A): [inner_d, outer_d, thickness] mm.
function tq_washer_dims(size) =
      size==2   ? [2.2,  5.0, 0.3] : size==2.5 ? [2.7,  6.0, 0.5] :
      size==3   ? [3.2,  7.0, 0.5] : size==4   ? [4.3,  9.0, 0.8] :
      size==5   ? [5.3, 10.0, 1.0] : size==6   ? [6.4, 12.0, 1.6] :
      size==8   ? [8.4, 16.0, 1.6] : size==10  ? [10.5,20.0, 2.0] :
      size==12  ? [13.0,24.0, 2.5] : size==16  ? [17.0,30.0, 3.0] :
      size==20  ? [21.0,37.0, 3.0] :
      [size*1.08, size*2.0, max(0.3, size*0.18)];

// ISO 4032 hex nut thickness m (mm).
function tq_nut_thickness(size) =
      size==2   ? 1.6 : size==2.5 ? 2.0  : size==3  ? 2.4  : size==4  ? 3.2 :
      size==5   ? 4.7 : size==6   ? 5.2  : size==8  ? 6.8  : size==10 ? 8.4 :
      size==12  ? 10.8: size==16  ? 14.8 : size==20 ? 18.0 : size==24 ? 21.5 :
      size * 0.87;

// ISO 4032 hex nut width across flats (mm) -- also used for hex bolt heads.
function tq_nut_across_flats(size) =
      size==2   ? 4.0 : size==2.5 ? 5.0  : size==3  ? 5.5  : size==4  ? 7.0 :
      size==5   ? 8.0 : size==6   ? 10.0 : size==8  ? 13.0 : size==10 ? 16.0 :
      size==12  ? 18.0: size==16  ? 24.0 : size==20 ? 30.0 : size==24 ? 36.0 :
      size * 1.8;

// ISO 4762 socket-head cap screw: [head_diameter dk, head_height k] mm.
function tq_shcs_head(size) =
      size==2   ? [3.8, 2.0] : size==2.5 ? [4.5, 2.5] : size==3  ? [5.5, 3.0] :
      size==4   ? [7.0, 4.0] : size==5   ? [8.5, 5.0] : size==6  ? [10.0,6.0] :
      size==8   ? [13.0,8.0] : size==10  ? [16.0,10.0]: size==12 ? [18.0,12.0]:
      [size*1.5, size*1.0];

// Hex key (socket drive) across flats for ISO 4762 (mm).
function tq_hex_key_af(size) =
      size==2   ? 1.5 : size==2.5 ? 2.0 : size==3  ? 2.5 : size==4  ? 3.0 :
      size==5   ? 4.0 : size==6   ? 5.0 : size==8  ? 6.0 : size==10 ? 8.0 :
      size==12  ? 10.0: size * 0.8;

// ISO 10642 countersunk (flat) socket head theoretical head diameter (mm), 90 deg.
function tq_csk_head_dia(size) =
      size==2   ? 4.0 : size==2.5 ? 5.0 : size==3  ? 6.0 : size==4  ? 8.0 :
      size==5   ? 10.0: size==6   ? 12.0: size==8  ? 16.0: size==10 ? 20.0 :
      size==12  ? 24.0: size * 2.0;

// ============================================================================
//  HEX / DRIVE GEOMETRY HELPERS
// ============================================================================
function tq_hex_across_corners(af) = af / cos(30);   // across-flats -> across-corners
function tq_hex_across_flats(ac)   = ac * cos(30);   // across-corners -> across-flats

// Hexagonal prism sized by across-flats width `af`.
module tq_hex(af, h, center=false) {
    cylinder(h=h, d=tq_hex_across_corners(af), $fn=6, center=center);
}
// Backwards-compatible private alias.
module _tq_hex(af, h, center=false) { tq_hex(af, h, center); }

// Hex drive recess tool: subtract to form a hex socket of key size `af`.
module tq_hex_drive(af, depth, center=false) {
    cylinder(h=depth, d=tq_hex_across_corners(af), $fn=6, center=center);
}

// Phillips (cruciform) cross-recess nominal dims by PH number:
//   [arm_reach (cross half-length, mm), wing_width (mm)]  (PH0..PH4)
function tq_ph_dims(size) =
      size==0 ? [1.0, 0.5] : size==1 ? [1.7, 0.7] : size==2 ? [2.6, 1.0] :
      size==3 ? [3.8, 1.4] : size==4 ? [5.4, 1.9] : [0.8+size*0.9, 0.4+size*0.35];

// Map a screw diameter to a sensible Phillips driver number.
function tq_ph_size_for(d) = d<=2.5 ? 0 : d<=3.5 ? 1 : d<=5 ? 2 : d<=8 ? 3 : 4;

// Phillips cross-recess tool (clean-room cruciform): subtract from a head to
// form a Phillips drive, OR use directly as a driver-bit tip shape.  Built from
// a central tapered core plus two crossed wings that taper toward the tip.
module tq_phillips_drive(size=2, depth=undef, center=false) {
    wd = tq_ph_dims(size);
    wl = wd[0];                              // cross arm reach (each side)
    ww = wd[1];                              // wing width at the rim
    dp = is_undef(depth) ? wl * 1.6 : depth; // recess depth
    translate(center ? [0,0,-dp/2] : [0,0,0])
        union() {
            // central tapered core (the point), wider at the rim
            cylinder(h=dp, r1=ww*0.30, r2=ww*0.75, $fn=24);
            // two crossed wings (a 90-deg pair = the full cross), tapering down
            for (a = [0, 90]) rotate([0,0,a])
                hull() {
                    translate([0,0,dp])      cube([2*wl, ww, 0.02], center=true);
                    translate([0,0,dp*0.12]) cube([ww*1.1, ww*0.45, 0.02], center=true);
                }
        }
}

// Phillips driver-bit tip: a shank with the cross tip on the +Z end.
module tq_phillips_tip(size=2, shank_d=undef, length=undef, fn=undef) {
    wd = tq_ph_dims(size);
    sd = is_undef(shank_d) ? wd[0]*2.2 : shank_d;
    ln = is_undef(length)  ? wd[0]*5   : length;
    tipL = wd[0]*1.6;
    union() {
        cylinder(h=ln - tipL, d=sd, $fn=_tq_aseg(sd, fn));
        translate([0,0,ln - tipL]) tq_phillips_drive(size, depth=tipL);
    }
}

// ============================================================================
//  THREADED PRIMITIVES :  rod / cutter / hole / nut / standoff
// ============================================================================

// Plain threaded rod (external thread, full length).
module tq_threaded_rod(d, pitch, length, starts=1, hand="right",
                       clearance=0.4, profile="flat", fn=undef, center=false) {
    tq_thread(d=d, pitch=pitch, length=length, starts=starts, hand=hand,
              clearance=clearance, profile=profile, fn=fn, center=center);
}

// Internal-thread CUTTER : an oversize negative solid meant to be subtracted.
//   difference() { your_part; tq_thread_cutter(d, pitch, depth); }
module tq_thread_cutter(d, pitch, length, starts=1, hand="right",
                        clearance=0.4, profile="flat", fn=undef,
                        through=true, center=false) {
    e = through ? 0.5 : 0;                 // overshoot for clean through-cuts
    translate([0, 0, center ? -length/2 : -e])
        tq_thread(d=d, pitch=pitch, length=length + 2*e, internal=true,
                  starts=starts, hand=hand, clearance=clearance,
                  profile=profile, lead_in=false, lead_out=false, fn=fn);
}

// Threaded hole helper: drop into a difference() to cut a tapped hole.
module tq_threaded_hole(d, pitch, depth, starts=1, hand="right",
                        clearance=0.4, profile="flat", fn=undef, through=true) {
    tq_thread_cutter(d=d, pitch=pitch, length=depth, starts=starts, hand=hand,
                     clearance=clearance, profile=profile, fn=fn, through=through);
}

// Hex nut.  Bore is threaded by subtracting an oversize cutter.  Height and
// across-flats default to ISO 4032 values for known sizes.
module tq_nut(d, pitch, height=undef, across_flats=undef, starts=1,
              hand="right", clearance=0.4, profile="flat", chamfer=true,
              fn=undef) {
    ht = is_undef(height)       ? tq_nut_thickness(d)   : height;
    af = is_undef(across_flats) ? tq_nut_across_flats(d): across_flats;
    assert(ht > 0 && af > 0, "tq_nut: height and across_flats must be > 0");
    cr = tq_hex_across_corners(af) / 2;          // across-corners radius
    ch = chamfer ? min(cr - af/2, ht/2 - 0.2) : 0;
    difference() {
        intersection() {
            tq_hex(af, ht);
            if (ch > 0)
                union() {
                    cylinder(h=ch,           r1=af/2, r2=cr,    $fn=96);
                    translate([0,0,ch])      cylinder(h=ht-2*ch, r=cr, $fn=96);
                    translate([0,0,ht-ch])   cylinder(h=ch, r1=cr, r2=af/2, $fn=96);
                }
            else
                cylinder(h=ht, r=cr, $fn=96);
        }
        tq_thread_cutter(d=d, pitch=pitch, length=ht, starts=starts, hand=hand,
                         clearance=clearance, profile=profile, fn=fn);
    }
}

// Threaded standoff / printed insert : an OD cylinder with a tapped bore.
module tq_standoff(d, pitch, length, od=undef, starts=1, hand="right",
                   clearance=0.4, profile="flat", fn=undef) {
    o = is_undef(od) ? d + 4 : od;
    assert(o > d, "tq_standoff: od must exceed thread diameter d");
    difference() {
        cylinder(h=length, d=o, $fn=_tq_aseg(o, fn));
        tq_thread_cutter(d=d, pitch=pitch, length=length, starts=starts,
                         hand=hand, clearance=clearance, profile=profile, fn=fn);
    }
}

// ============================================================================
//  BOLTS / SCREWS  (solid, fused with epsilon overlaps)
// ============================================================================

// Socket / hex / plain head bolt.  Thread runs Z 0..length; head sits below 0
// with its drive face at z = -head_h.  Components overlap by EPS so the STL is
// one coherent printable solid.  `drive` selects the recess in the socket head:
// "hex" (hex socket), "phillips" (cross recess), or "none" (plain solid head).
TQ_EPS = 0.02;

// Drive-recess selector: subtract this at a head's bearing face.
module _tq_drive_recess(drive, d, depth) {
    if      (drive == "hex")      tq_hex_drive(tq_hex_key_af(d), depth);
    else if (drive == "phillips") tq_phillips_drive(tq_ph_size_for(d), depth = depth);
    // "none" / unknown -> no recess
}
module tq_bolt(d, pitch, length, head="socket", head_d=undef, head_h=undef,
               shank=0, drive="hex", hand="right", clearance=0.4,
               profile="flat", fn=undef) {
    assert(is_num(d) && d > 0,           str("tq_bolt: d must be > 0, got ", d));
    assert(is_num(pitch) && pitch > 0,   "tq_bolt: pitch must be > 0");
    assert(is_num(length) && length > 0, "tq_bolt: length must be > 0");
    assert(is_num(shank) && shank >= 0 && shank < length,
           str("tq_bolt: shank must be in [0, length), got ", shank));
    hd = is_undef(head_d) ? (head=="hex" ? tq_nut_across_flats(d) : tq_shcs_head(d)[0]) : head_d;
    hh = is_undef(head_h) ? (head=="hex" ? 0.7*d : tq_shcs_head(d)[1]) : head_h;
    sd = d - clearance;                          // shank flush with thread crests
    union() {
        // head (drive/bearing face at z = -hh)
        if (head == "hex")
            translate([0,0,-hh]) tq_hex(hd, hh + TQ_EPS);
        else if (head == "socket")
            difference() {
                translate([0,0,-hh]) cylinder(h=hh + TQ_EPS, d=hd, $fn=_tq_aseg(hd, fn));
                translate([0,0,-hh - TQ_EPS]) _tq_drive_recess(drive, d, hh*0.6 + TQ_EPS);
            }
        else if (head != "none")
            translate([0,0,-hh]) cylinder(h=hh + TQ_EPS, d=hd, $fn=_tq_aseg(hd, fn));
        // optional unthreaded shank (overlaps head below, thread above)
        if (shank > 0)
            translate([0,0,-TQ_EPS]) cylinder(h=shank + TQ_EPS, d=sd, $fn=_tq_aseg(sd, fn));
        // thread (dropped by EPS so it fuses with shank/head; square base end)
        translate([0,0,(shank > 0 ? shank : 0) - TQ_EPS])
            tq_thread(d=d, pitch=pitch, length=length - shank + TQ_EPS, hand=hand,
                      clearance=clearance, profile=profile,
                      lead_in=false, lead_out=true, fn=fn);
    }
}

// Countersunk (flat) head machine screw.  Head cone: wide (head_d) at the
// outer/bearing face, narrowing to the shank where it meets the thread.
module tq_countersunk_bolt(d, pitch, length, head_d=undef, head_angle=90,
                           shank=0, drive="hex", hand="right", clearance=0.4,
                           profile="flat", fn=undef) {
    assert(is_num(d) && d > 0,           str("tq_countersunk_bolt: d must be > 0, got ", d));
    assert(is_num(pitch) && pitch > 0,   "tq_countersunk_bolt: pitch must be > 0");
    assert(is_num(length) && length > 0, "tq_countersunk_bolt: length must be > 0");
    assert(is_num(shank) && shank >= 0 && shank < length,
           "tq_countersunk_bolt: shank must be in [0, length)");
    assert(is_num(head_angle) && head_angle > 0 && head_angle < 180,
           "tq_countersunk_bolt: head_angle must be in (0,180)");
    hd = is_undef(head_d) ? tq_csk_head_dia(d) : head_d;
    hk = (hd/2) / tan(head_angle/2);             // head cone height
    sd = d - clearance;
    union() {
        // countersunk head cone: wide (hd) at z=-hk, narrow (d) at z=0
        difference() {
            translate([0,0,-hk]) cylinder(h=hk + TQ_EPS, d1=hd, d2=d, $fn=_tq_aseg(hd, fn));
            translate([0,0,-hk - TQ_EPS]) _tq_drive_recess(drive, d, hk*0.7 + TQ_EPS);
        }
        if (shank > 0)
            translate([0,0,-TQ_EPS]) cylinder(h=shank + TQ_EPS, d=sd, $fn=_tq_aseg(sd, fn));
        translate([0,0,(shank > 0 ? shank : 0) - TQ_EPS])
            tq_thread(d=d, pitch=pitch, length=length - shank + TQ_EPS, hand=hand,
                      clearance=clearance, profile=profile,
                      lead_in=false, lead_out=true, fn=fn);
    }
}

// GENERIC printable "wood / self-tapping" screw -- a coarse, sharp-profile
// thread with a configurable point.  This is wood-screw-LIKE geometry for FDM,
// NOT a specific wood-screw standard (no ANSI/DIN dimensions are claimed).
//   pitch        coarse pitch (default 0.6*d)        head   "countersunk"|"pan"|"none"
//   point        "gimlet" (sharp) | "cone" | "flat"  (bool true=gimlet, false=flat)
//   taper        diameter reduction over the threaded length (toward the tip)
//   core_d       core/root diameter (sets thread depth)   thread_depth  radial depth (overrides core_d)
//   shank        smooth unthreaded shank length under the head (dia ~ core)
module tq_wood_screw(d, length, pitch=undef, head="countersunk", head_d=undef,
                     point="gimlet", taper=0, core_d=undef, thread_depth=undef,
                     shank=0, hand="right", clearance=0.0, fn=undef) {
    assert(is_num(d) && d > 0,           str("tq_wood_screw: d must be > 0, got ", d));
    assert(is_num(length) && length > 0, "tq_wood_screw: length must be > 0");
    assert(is_num(shank) && shank >= 0 && shank < length,
           str("tq_wood_screw: shank must be in [0, length), got ", shank));
    assert(is_num(taper) && taper >= 0, "tq_wood_screw: taper must be >= 0");
    assert(is_undef(core_d) || (is_num(core_d) && core_d > 0 && core_d < d),
           str("tq_wood_screw: core_d must be in (0, d), got ", core_d));
    assert(is_undef(thread_depth) || (is_num(thread_depth) && thread_depth > 0),
           "tq_wood_screw: thread_depth must be > 0");
    pt = is_bool(point) ? (point ? "gimlet" : "flat") : point;
    assert(pt=="gimlet" || pt=="cone" || pt=="flat",
           str("tq_wood_screw: point must be gimlet|cone|flat (or bool), got ", point));
    p    = is_undef(pitch)  ? d * 0.6 : pitch;
    hd   = is_undef(head_d) ? d * 2.0 : head_d;
    tipL = pt=="flat" ? 0 : (pt=="cone" ? d*0.6 : d*0.9);
    tipD = pt=="cone" ? d*0.4 : 0.2;
    md   = is_undef(thread_depth) ? core_d : undef;        // don't pass both
    shd  = is_undef(core_d) ? d*0.72 : core_d;             // reduced smooth shank
    tl   = length - shank;                                  // threaded length
    union() {
        if (head == "countersunk") {
            hk = (hd/2) / tan(45);
            translate([0,0,-hk]) cylinder(h=hk + TQ_EPS, d1=hd, d2=d, $fn=_tq_aseg(hd, fn));
        } else if (head == "pan") {
            translate([0,0,-d*0.5]) cylinder(h=d*0.5 + TQ_EPS, d=hd, $fn=_tq_aseg(hd, fn));
        }
        if (shank > 0)
            translate([0,0,-TQ_EPS]) cylinder(h=shank + TQ_EPS, d=shd, $fn=_tq_aseg(d, fn));
        translate([0,0,shank])
            intersection() {
                translate([0,0,-TQ_EPS])
                    tq_thread(d=d, pitch=p, length=tl + TQ_EPS, hand=hand,
                              clearance=clearance, profile="sharp",
                              tooth_height=thread_depth, minor_d=md, taper=taper,
                              lead_in=false, lead_out=false, fn=fn);
                union() {
                    translate([0,0,-TQ_EPS]) cylinder(h=tl - tipL + TQ_EPS, d=d + 1, $fn=_tq_aseg(d, fn));
                    if (tipL > 0)
                        translate([0,0,tl - tipL])
                            cylinder(h=tipL, d1=d + 1, d2=tipD, $fn=_tq_aseg(d, fn));
                }
            }
    }
}

// ============================================================================
//  CLEARANCE / RECESS / COUNTERSINK HOLES  (negatives for difference())
// ============================================================================

// Plain through/blind clearance hole (ISO 273).  fit: close|medium|free.
module tq_clearance_hole(size, depth, fit="medium", fn=undef, through=true) {
    assert(is_num(size) && size > 0, "tq_clearance_hole: size must be > 0");
    assert(is_num(depth) && depth > 0, "tq_clearance_hole: depth must be > 0");
    e = through ? 0.5 : 0;
    cd = tq_clearance_dia(size, fit);
    translate([0,0,-e]) cylinder(h=depth + 2*e, d=cd, $fn=_tq_aseg(cd, fn));
}

// Recessed (counterbored) clearance hole for a cap-head screw.  Pocket opens
// at the +Z (depth) face; defaults to the ISO 4762 head size + clearance.
module tq_recessed_clearance_hole(size, depth, head_d=undef, head_h=undef,
                                  fit="medium", fn=undef, through=true) {
    hd = is_undef(head_d) ? tq_shcs_head(size)[0] + 0.6 : head_d;
    hh = is_undef(head_h) ? tq_shcs_head(size)[1] + 0.3 : head_h;
    assert(depth > hh, "tq_recessed_clearance_hole: depth must exceed head_h");
    union() {
        tq_clearance_hole(size, depth, fit, fn, through);
        translate([0,0,depth - hh]) cylinder(h=hh + 0.5, d=hd, $fn=_tq_aseg(hd, fn));
    }
}

// Countersunk clearance hole for a flat-head screw.  Cone opens at the +Z face.
module tq_countersunk_clearance_hole(size, depth, head_d=undef, angle=90,
                                     fit="medium", fn=undef, through=true) {
    hd = is_undef(head_d) ? tq_csk_head_dia(size) + 0.6 : head_d;
    cd = tq_clearance_dia(size, fit);
    ck = (hd/2) / tan(angle/2);                  // countersink cone height
    union() {
        tq_clearance_hole(size, depth, fit, fn, through);
        translate([0,0,depth - ck])
            cylinder(h=ck, d1=cd, d2=hd, $fn=_tq_aseg(hd, fn));
        translate([0,0,depth]) cylinder(h=0.5, d=hd, $fn=_tq_aseg(hd, fn));  // open rim
    }
}

// ============================================================================
//  WASHERS, RODS & COUPLERS
// ============================================================================

// Flat washer.  Dimensions default to ISO 7089 (form A) for known sizes.
module tq_washer(size, od=undef, id=undef, thk=undef, fn=undef) {
    dm = tq_washer_dims(size);
    i = is_undef(id)  ? dm[0] : id;
    o = is_undef(od)  ? dm[1] : od;
    t = is_undef(thk) ? dm[2] : thk;
    assert(o > i && i > 0 && t > 0, "tq_washer: need outer > inner > 0 and thk > 0");
    linear_extrude(t)
        difference() {
            circle(d=o, $fn=_tq_aseg(o, fn));
            circle(d=i, $fn=_tq_aseg(i, fn));
        }
}

// Rod START piece: threaded rod with a clean chamfered entry (bottom) and a
// square top, so it threads into a nut easily and can be joined at the top.
module tq_rod_start(d, pitch, length, hand="right", clearance=0.4,
                    profile="flat", fn=undef)
    tq_thread(d=d, pitch=pitch, length=length, hand=hand, clearance=clearance,
              profile=profile, lead_in=true, lead_out=false, fn=fn);

// Rod END piece: square bottom (to join) and a clean chamfered finish on top.
module tq_rod_end(d, pitch, length, hand="right", clearance=0.4,
                  profile="flat", fn=undef)
    tq_thread(d=d, pitch=pitch, length=length, hand=hand, clearance=clearance,
              profile=profile, lead_in=false, lead_out=true, fn=fn);

// Rod EXTENDER / COUPLER: a sleeve internally threaded through, to join two
// threaded rods end-to-end (a long round coupling nut).
module tq_rod_coupler(d, pitch, length, od=undef, hand="right", clearance=0.4,
                      profile="flat", fn=undef) {
    o = is_undef(od) ? d + 5 : od;
    assert(o > d, "tq_rod_coupler: od must exceed thread diameter d");
    difference() {
        cylinder(h=length, d=o, $fn=_tq_aseg(o, fn));
        tq_thread_cutter(d=d, pitch=pitch, length=length, hand=hand,
                         clearance=clearance, profile=profile, fn=fn, through=true);
    }
}

// GENERIC coarse "bottle / jar / closure" thread (external or internal).  A
// generic printable rounded coarse thread for caps and necks -- it is NOT a
// specific SPI/GPI or ISO closure finish, and claims no compatibility with one
// (use exact, sourced values via tq_thread if you have a real finish drawing).
//   d            neck / finish diameter        starts   multi-start (common on caps)
//   depth_frac   <1 widens flats -> shallower tooth   tooth_height  explicit radial depth
//   angle        flank angle (flat/sharp profiles)    profile  "rounded"(default)|"flat"|"sharp"
//   lead_in      taper both ends (default: external yes / internal no)
//   internal     true = cap (cut as a thread), false = neck/spout
module tq_bottle_thread(d, pitch, length, starts=1, hand="right",
                        clearance=0.4, depth_frac=0.6, tooth_height=undef,
                        angle=60, profile="rounded", lead_in=undef,
                        internal=false, fn=undef, center=false) {
    cf = pitch * 0.18 / depth_frac;
    rf = pitch * 0.30 / depth_frac;
    li = is_undef(lead_in) ? !internal : lead_in;
    uf = is_undef(tooth_height);                       // use flats to set depth?
    tq_thread(d=d, pitch=pitch, length=length, internal=internal, starts=starts,
              hand=hand, clearance=clearance, profile=profile,
              crest_flat = uf ? cf : undef, root_flat = uf ? rf : undef,
              tooth_height=tooth_height, angle=angle,
              lead_in=li, lead_out=li, fn=fn, center=center);
}

// ============================================================================
//  AUGER (deep coarse helical flight) + thread-relief groove
// ============================================================================

// Auger-style deep, coarse helical flight (e.g. screw conveyor, soil/ice auger,
// printed feed screw).  Generic deep coarse thread: large pitch (~d), deep
// flight, single start by default; optional taper toward the tip.  This is a
// generic printable flight, NOT a specific auger standard.
module tq_auger(d, length, pitch=undef, flight=undef, hand="right",
                profile="rounded", starts=1, taper=0, fn=undef, center=false) {
    p  = is_undef(pitch)  ? d        : pitch;   // coarse: pitch ~ d
    ft = is_undef(flight) ? 0.28 * d : flight;  // radial flight depth
    tq_thread(d=d, pitch=p, length=length, tooth_height=ft, hand=hand,
              profile=profile, starts=starts, taper=taper, clearance=0,
              fn=fn, center=center);
}

// Negative cutter for an auger channel / matching bore (oversize like a thread
// cutter).  Drop into difference().
module tq_auger_hole(d, length, pitch=undef, flight=undef, hand="right",
                     clearance=0.4, fn=undef, through=true, center=false) {
    p  = is_undef(pitch)  ? d        : pitch;
    ft = is_undef(flight) ? 0.28 * d : flight;
    e  = through ? 0.5 : 0;
    translate([0,0, center ? -length/2 : -e])
        tq_thread(d=d, pitch=p, length=length + 2*e, internal=true,
                  tooth_height=ft, hand=hand, profile="rounded",
                  clearance=clearance, lead_in=false, lead_out=false, fn=fn);
}

// Thread-relief / runout groove cutter: a shallow ring to subtract at a thread
// runout so a mating nut can seat fully.  Place at the desired Z (groove centre).
module tq_relief_groove(d, width=undef, depth=undef, fn=undef, center=true) {
    w  = is_undef(width) ? 1.5 : width;
    dp = is_undef(depth) ? 0.8 : depth;          // radial depth below the surface
    translate([0,0, center ? -w/2 : 0])
        rotate_extrude($fn=_tq_aseg(d, fn))
            translate([d/2 - dp, 0]) square([dp + 0.02, w]);
}

// ============================================================================
//  CHILD-DIFFERENCE CONVENIENCE WRAPPERS
//  (ScrewHole / ClearanceHole in spirit, with tq_* naming.  Each cuts its hole
//   into the supplied children() at position `at`, axis +Z.)
// ============================================================================

// Tap a threaded hole into children().
module tq_tap(d, pitch, depth, at=[0,0,0], starts=1, hand="right",
              clearance=0.4, profile="flat", through=true, fn=undef) {
    difference() {
        children();
        translate(at) tq_threaded_hole(d, pitch, depth, starts=starts, hand=hand,
                                       clearance=clearance, profile=profile,
                                       through=through, fn=fn);
    }
}

// Drill a plain clearance hole (ISO 273) into children().
module tq_drill(size, depth, at=[0,0,0], fit="medium", through=true, fn=undef) {
    difference() {
        children();
        translate(at) tq_clearance_hole(size, depth, fit, fn, through);
    }
}

// Counterbore (recessed cap-head clearance hole) into children().
module tq_counterbore(size, depth, at=[0,0,0], head_d=undef, head_h=undef,
                      fit="medium", through=true, fn=undef) {
    difference() {
        children();
        translate(at) tq_recessed_clearance_hole(size, depth, head_d, head_h,
                                                 fit, fn, through);
    }
}

// Countersink (flat-head clearance hole) into children().
module tq_countersink(size, depth, at=[0,0,0], head_d=undef, angle=90,
                      fit="medium", through=true, fn=undef) {
    difference() {
        children();
        translate(at) tq_countersunk_clearance_hole(size, depth, head_d, angle,
                                                    fit, fn, through);
    }
}

// ============================================================================
//  DEBUG / VISUALISATION
// ============================================================================
module tq_thread_debug(d, pitch, length, starts=1, hand="right", profile="flat",
                       clearance=0.4, fn=undef) {
    P    = pitch;  cf = P/8;  rf = P/4;
    h    = (P - cf - rf) * _TQ_H;
    Rmaj = d/2 - clearance/2;
    Rmin = Rmaj - h;
    lead = starts * P;
    dir  = (hand == "left") ? -1 : 1;
    na   = _tq_aseg(d, fn);

    echo(str("== tq_thread_debug: ", d, " x ", pitch, " mm =="));
    echo(major_dia = 2*Rmaj, minor_dia = 2*Rmin,
         pitch_dia = 2*(Rmaj - 0.375*_TQ_H*P));
    echo(thread_height_h = h, sharp_V_H = _TQ_H*P,
         lead = lead, starts = starts, hand = hand);

    %tq_thread(d=d, pitch=pitch, length=length, starts=starts, hand=hand,
               profile=profile, clearance=clearance, fn=fn);
    %cylinder(h=length, r=Rmaj, $fn=na);

    turns = length / lead;
    npts  = max(8, ceil(turns * na));
    color("red")
        for (k = [0 : npts-1]) {
            t0 = k / npts;        t1 = (k+1) / npts;
            a0 = dir * t0 * turns * 360;   z0 = t0 * length;
            a1 = dir * t1 * turns * 360;   z1 = t1 * length;
            hull() {
                translate([Rmaj*cos(a0), Rmaj*sin(a0), z0]) sphere(r=0.25, $fn=8);
                translate([Rmaj*cos(a1), Rmaj*sin(a1), z1]) sphere(r=0.25, $fn=8);
            }
        }
    color("blue")
        for (k = [0 : floor(length/pitch)])
            translate([0, 0, k*pitch]) cylinder(h=0.2, r=Rmaj*1.05, $fn=na);
    color("green")
        translate([Rmaj*1.8, 0, 0]) rotate([90, 0, 0])
            linear_extrude(0.4)
                polygon(concat(
                    [ for (a = [0 : pitch/24 : pitch*2])
                          [ lookup(_tq_pmod(a, P),
                                   _tq_table_flat(P, Rmin, Rmaj, cf, rf)) - Rmin, a ] ],
                    [ [0, pitch*2], [0, 0] ]));
}
