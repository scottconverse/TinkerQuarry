// SPDX-License-Identifier: MIT
// ----------------------------------------------------------------------------
// tq_threads_tests.scad  --  COMPATIBILITY WRAPPER.
//
// The test grid was split so CI never hangs on a heavy render:
//   * tq_threads_fast_tests.scad   small, fast smoke grid + preset assertions
//   * tq_threads_heavy_tests.scad  full visual stress / demo grid (minutes)
//
// This file keeps the historical name and runs the FAST suite, so existing
// commands (`openscad -o tests.stl tq_threads_tests.scad`) stay quick and safe.
// Render tq_threads_heavy_tests.scad for the full demo grid.
// ----------------------------------------------------------------------------

include <tq_threads_fast_tests.scad>
