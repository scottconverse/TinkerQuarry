// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads_selftest.scad  --  STANDARD-TABLE self-test (parse/render time).
//
// Pure assertions (no heavy geometry): verifies the preset table integrity,
// preset-count floor, spot-check nominal values, and the ISO 965 fundamental-
// deviation formulae.  Renders only a trivial cube so `openscad -o out.stl`
// exits 0 on success and NONZERO on any failed assertion.
//
//   openscad -o selftest.stl tq_threads_selftest.scad
// ----------------------------------------------------------------------------

include <tq_threads.scad>

// -- preset table integrity --------------------------------------------------
assert(tq_presets_selfcheck(),
       "SELFTEST: preset table self-check failed (a row is malformed or unresolvable)");
assert(tq_preset_count() >= 54,
       str("SELFTEST: preset count regressed below 54: ", tq_preset_count()));

// -- spot-check nominal preset values (exact) --------------------------------
assert(tq_preset("M3")  == [3.0, 0.50],  "SELFTEST: M3 nominal");
assert(tq_preset("M8")  == [8.0, 1.25],  "SELFTEST: M8 nominal");
assert(tq_preset("M12") == [12.0, 1.75], "SELFTEST: M12 nominal");
assert(tq_preset("M10x1.25") == [10.0, 1.25], "SELFTEST: M10x1.25 fine");
assert(abs(tq_preset("1/4-20")[0] - 6.35) < 1e-9,       "SELFTEST: 1/4-20 major");
assert(abs(tq_preset("1/4-20")[1] - 25.4/20) < 1e-12,   "SELFTEST: 1/4-20 pitch");
assert(abs(tq_preset("#6-32")[0]  - 0.138*25.4) < 1e-9, "SELFTEST: #6-32 major");
assert(abs(tq_preset("#10-32")[1] - 25.4/32) < 1e-12,   "SELFTEST: #10-32 pitch");
assert(is_undef(tq_preset("NoSuchPreset")),             "SELFTEST: unknown -> undef");

// -- ISO 965-1 fundamental deviation formulae (exact, micrometres) -----------
assert(abs(_tq_fit_dev_mm("g", 1.25)*1000 - (-(15 + 11*1.25))) < 1e-9, "SELFTEST: es(g)");
assert(abs(_tq_fit_dev_mm("f", 1.0 )*1000 - (-(30 + 11*1.0 ))) < 1e-9, "SELFTEST: es(f)");
assert(abs(_tq_fit_dev_mm("e", 1.0 )*1000 - (-(50 + 11*1.0 ))) < 1e-9, "SELFTEST: es(e)");
assert(_tq_fit_dev_mm("h", 1.0) == 0,                                  "SELFTEST: es(h)=0");
assert(abs(_tq_fit_dev_mm("G", 1.5)*1000 - ( 15 + 11*1.5)) < 1e-9,     "SELFTEST: EI(G)");
assert(_tq_fit_dev_mm("H", 1.0) == 0,                                  "SELFTEST: EI(H)=0");

echo(str("SELFTEST PASS: ", tq_preset_count(), " presets, table + ISO 965 formulae OK"));
cube(0.1);   // trivial geometry so STL export succeeds
