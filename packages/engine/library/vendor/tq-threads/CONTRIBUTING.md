<!-- SPDX-License-Identifier: MIT -->
# Contributing to tq-threads

Thanks for your interest! A few rules keep this library shippable and legally clean.

## 🧼 Clean-room rule (read first)

tq-threads is a **clean-room** implementation and must stay that way.

- **Do not** copy, paste, translate, or adapt code, comments, module/parameter
  names, examples, or tests from any other OpenSCAD thread library — of *any*
  license (GPL, public domain, MIT, or otherwise).
- Implement from **public standards** (ISO/ASME), first-principles math, and the
  existing tq-threads code only.
- If you use a standard or formula, **cite it in [REFERENCES.md](REFERENCES.md)**.
- Don't paste a competing library's data tables; transcribe values from the
  published standard (they're facts) and cite the standard.

PRs that appear to derive from another library will be declined.

## Licensing

By contributing you agree your contribution is licensed under the project's
**MIT** license (see [LICENSE](LICENSE)). MIT is GPL-2.0-compatible, which lets
tq-threads ship inside GPL-2.0 projects — please don't introduce code under a
license that breaks that.

## Code style

- Public API is namespaced `tq_*`; private helpers are `_tq_*`.
- Validate inputs with `assert(...)` and a message naming the bad parameter.
- Prefer robust geometry (manifold-by-construction) over clever-but-fragile.
- Match the surrounding comment density and formatting.
- Keep `tq_threads.scad` the single runtime file (no new required dependencies).

## Adding a preset

Edit the `TQ_PRESETS` table in `tq_threads.scad` (`[name, major_mm, pitch_mm]`)
and add the size to the assertion list in `tq_threads_fast_tests.scad`.

## Before you open a PR

1. Render-proof locally:
   ```powershell
   pwsh scripts/render-tests.ps1
   ```
   or
   ```sh
   openscad -o out.stl tq_threads_fast_tests.scad   # exit 0, no WARNING / manifold lines
   ```
2. If you added a module, add an example to `tq_threads_examples.scad` and a cell
   to `tq_threads_heavy_tests.scad`.
3. Update `MANUAL.md` / `README.md` and add a `CHANGELOG.md` entry.

## Reporting bugs / ideas

Open an issue or start a thread in
[Discussions](https://github.com/scottconverse/tq-threads/discussions). A minimal
`.scad` snippet and your OpenSCAD version make bugs much faster to fix.
