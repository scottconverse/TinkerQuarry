# Evaluate TinkerQuarry in about 2 minutes

A no-spin walkthrough so you can judge the real product yourself, not a description of it.

> **Verification honesty:** the engine has real automated tests. The front-end steps below were
> manually click-checked during the sprint; they are not covered by automated browser tests. There is
> one live API integration test, `engineLive.integration.test.ts`, but no Playwright or `App.tsx` user
> flow test yet.

## Run It

Two PowerShell terminals:

```powershell
# 1. Engine
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765

# 2. Front end
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev
```

Then open `http://localhost:1420`.

## Try The Loop

1. **Describe**: enter `a 70 mm round drink coaster, 4 mm tall`. The local engine should design the
   part, gate it, and render it in the Studio viewer.
2. **Tune**: open the Customizer tab and drag a parameter slider. Geometry should re-render and the
   make-it-real readiness should update.
3. **Pick your printer**: choose a printer and material from the toolbar dropdowns.
4. **Orient**: use the X/Y/Z ±90 controls if the build-plate pose needs a manual override. The
   preview should refresh; the next slice uses that pose.
5. **Make it real**: confirm the first-real-print caution. The app should slice and download a
   `.gcode.3mf`.
6. **Send**: choose a printer connection and send the sliced G-code. The built-in `mock` connector is
   simulated; real hardware sends prompt for a print outcome.
7. **Refine**: ask for a change such as `make it 80 mm across`.
8. **Save / reopen / delete**: save the design, reopen it from My Designs, and delete it with the
   two-step confirm.
9. **Undo**: after a refine, use Undo to restore the previous design.
10. **Visual review**: after a successful design/reopen, hover **Make it real**. The tooltip should
   include an advisory line such as `Visual review: running`, `no obvious issues found`, `likely
   issue`, `needs review`, or `unavailable`. This does not replace slicing.
11. **Export**: export STL / OBJ / AMF / 3MF / SVG / DXF, or use File > Save for `.scad`. PNG is not
   currently offered.

## What Is Not Here Yet

- **Visual Correction Loop**: advisory local probe-mode v1 exists. It can inspect rendered images
  with local probe models and report likely visual issues, but it is not the full PRD loop yet. The
  default tries `qwen3-vl:8b`, `qwen2.5vl:7b`, and `minicpm-v:8b`, uses agreement when at least two
  critics respond, falls back honestly if only one is installed, and treats model disagreement as
  `needs review`. The beta acceptance bar is 90% probe accuracy; `qwen3-vl:8b` is the current
  best-quality local option from the audit. The 3D viewer now supplies labeled `front` / `right` /
  `top` captures when ready and falls back to `current`; the API returns a bounded no-image
  `review_log`. Multi-round repair, best-candidate retention, convergence, visual diff, browser-level
  multiview proof, and automated wrong-face fixture proof still need to be built.
- **Bundled SCAD libraries**: BOSL2, Round-Anything, YAPP_Box, Catch'n'Hole, gridfinity-rebuilt,
  MCAD, and the clean-room MIT `tq-threads` replacement are vendored with pinned attribution and
  smoke-render proof. Dan Kirshner `threads.scad` remains excluded.
- **External-library admission**: the PRD consent -> sandbox-copy -> include-path -> sanitization flow
  is not wired to the engine.
- **Explain/diff/iteration history**: current Explain is a readiness toast; Undo is whole-design
  session revert; persistent per-iteration history and visual/structural diff remain incomplete.
- **Automated browser-level coverage**: no Playwright or `App.tsx` test for describe -> render ->
  make-it-real.

## Where The Truth Lives

- [STATUS.md](STATUS.md)
- [HANDOFF-TO-CODEX.md](HANDOFF-TO-CODEX.md)
- [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md)
- [audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md)
