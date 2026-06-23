# Vendored OpenSCAD Libraries

TinkerQuarry is GPL-2.0-only. This directory contains third-party OpenSCAD libraries that were
reviewed for GPLv2-compatible redistribution and pinned to explicit upstream commits.

## Libraries

| Library | Upstream | Commit | License | Notes |
|---|---|---:|---|---|
| BOSL2 | https://github.com/BelfrySCAD/BOSL2 | `5786cbf2313cbcb9c4ec216b0610cf8985acc366` | BSD-2-Clause | Full upstream tree, excluding `.git`. Requires OpenSCAD 2021.01 or later. |
| Round-Anything | https://github.com/Irev-Dev/Round-Anything | `061fef7c429628808e847696bb345a9b0ec6e279` | MIT | Full upstream tree, excluding `.git`. |
| YAPP_Box | https://github.com/mrWheel/YAPP_Box | `f9400c419ef1dea7dc0b3607876989b4f3faa2b7` | MIT | Full upstream tree, excluding `.git`. |
| Catch'n'Hole | https://github.com/mmalecki/catchnhole | `99428972ca2588f5ce33c0df54d097a14acf7f10` | MIT | Full upstream tree, excluding `.git`. Requires OpenSCAD JSON `import` support for its bolt/nut data. |
| gridfinity-rebuilt-openscad | https://github.com/kennetek/gridfinity-rebuilt-openscad | `910e22d8607fd7f5f51ad5e5cbc5287a76810bfd` | MIT | Vendored without `src/external/threads-scad`, which is GPL-3.0-or-later. Thumbscrew features are disabled until TinkerQuarry has a clean-room thread library. |
| MCAD | https://github.com/openscad/MCAD | `bd0a7ba3f042bfbced5ca1894b236cea08904e26` | LGPL-2.1-or-later, with some files under compatible permissive/CC-BY terms noted upstream | Full upstream tree, excluding `.git`. Preserve `lgpl-2.1.txt` and upstream notices. |
| tq-threads | https://github.com/scottconverse/tq-threads | `bf4ac59028997fb111a2ae598fa71137b5e1e58a` (`v0.5.0`) | MIT | Clean-room printable OpenSCAD thread library used as the GPLv2-compatible replacement for Dan Kirshner / rcolyer `threads.scad`. Full upstream tree, excluding `.git`. |

## Explicit Exclusion

Dan Kirshner / rcolyer `threads.scad` is not bundled because the available source is
GPL-3.0-or-later, which is not compatible with this GPL-2.0-only project. Thread support is provided
by the clean-room MIT `tq-threads` library above.

## Local Modifications

- `gridfinity-rebuilt-openscad/src/core/base.scad`: removed the upstream `use
  <../external/threads-scad/threads.scad>` line and added an assertion that rejects `thumbscrew=true`.
  This keeps the MIT Gridfinity code available while preventing accidental use of the excluded GPLv3
  thread dependency. Gridfinity's upstream thumbscrew API has not yet been ported to `tq-threads`.
