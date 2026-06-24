# Evaluate TinkerQuarry

A no-spin walkthrough so you can judge the real product yourself, not a description of it. The
short smoke is a few minutes; the full proof commands are a release-gate run.

> **Verification honesty:** the engine has real automated tests, and the main desktop web flow now has
> a durable Playwright happy-path test. The checked-in browser test covers app boot against the demo
> engine, prompt/build, rendered design-ready state, the right-side Customize / Make it real rail,
> Make it real, first-real caution, slice, Ready-to-print state, mock Send, and post-send outcome
> recording. This is not a full UI matrix: mobile/narrow layouts, every error path, and hardware
> connector outcomes still need broader coverage. Browser e2e and native smoke now support isolated
> temp profile roots so proof does not depend on Scott's existing app data.

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
8. **Right rail**: use the right-side **Customize** and **Make it real** panel. It should show VCL
   status honestly, printer/material choices, Slice/Send buttons, and an Iteration log.
9. **Iteration restore**: after a refine or slice, restore a snapshot from the Iteration log. Restored
   snapshots reopen as source snapshots; re-render before manufacturing from them.
10. **Save / reopen / delete / portable design**: save the design, export it as `.kimcad`, import it
    again, reopen it from My Designs, and delete it with the two-step confirm.
11. **Undo**: after a refine, use Undo to restore the previous design.
12. **Visual review**: after a successful design/reopen, the app runs an advisory local probe loop
    when vision is available. The rail should show `VCL:` status such as off, missing, installing,
    advisory, running, likely issue, needs review, or unavailable. This does not replace slicing.
13. **Visual fix**: if visual review reports an agreed likely issue, the bounded loop can refine in
    context, keep/restore the best candidate, and record provenance in the Iteration log. It stops
    after three correction rounds.
14. **Export**: export `.scad`, STL, OBJ, AMF, 3MF, SVG, DXF, PNG preview, STEP when available, or
    portable `.kimcad`.
15. **External SCAD library admission**: in Settings > Libraries, admit a user-installed SCAD library.
    The app should ask for consent, copy it into the sandbox, and show an `external/<slug>/` include
    prefix.

## What Is Not Here Yet

- **Visual Correction Loop**: advisory local probe-mode v1 exists. It can inspect rendered images
  with local probe models and report likely visual issues, and the UI now runs a bounded autonomous
  review/correction pass after generated designs. It is still not metrology-grade vision. The
  default local critic is `qwen2.5vl:7b` in decomposed yes/no probe mode. Optional agreement mode
  uses `qwen2.5vl:7b` + `minicpm-v:8b`; `qwen3-vl:8b` remains the best-quality selectable local
  critic from the audit. The loop treats model disagreement, empty answers, and unparseable answers
  as `needs review`, not pass. The beta acceptance bar is 90% probe accuracy. The 3D viewer now
  supplies labeled `front` / `right` / `top` captures when ready and falls back to `current`; the API
  returns a bounded no-image
  `review_log`. Agreed issues can now generate a bounded user-triggered correction/refine loop with
  Undo as the prior-candidate fallback; the wrong-face handoff path is covered by a deterministic
  probe fixture. Browser proof against the real app captured labeled `front` / `right` / `top` PNGs
  with no console/HTTP errors (`docs/handoff/proof/vcl-multiview-browser-2026-06-22.txt`).
  A lightweight visual-change percentage exists after correction; a full before/after visual-diff
  viewer still needs to be built.
- **Bundled SCAD libraries**: BOSL2, Round-Anything, YAPP_Box, and gridfinity-rebuilt are vendored
  with pinned attribution and smoke-render proof. Printable thread support comes from first-party
  `library/threads.scad`, which wraps BOSL2's thread modules. Dan Kirshner `threads.scad` remains
  excluded.
- **External-library admission**: consent -> sandbox-copy -> include-path -> sanitization is wired.
  Admitted libraries are user-provided and are not redistributed by TinkerQuarry.
- **Explain/diff/iteration history**: current Explain is still mostly readiness/design summary.
  Persistent iteration history exists; full visual/structural diff remains incomplete.
- **Browser-level coverage breadth**: the committed Playwright test covers the core happy path through
  mock send/outcome. It does not yet cover mobile/narrow layouts, hardware connectors, every export
  format, every profile, or accessibility keyboard traversal.

## Automated Proof Commands

From `C:\Users\Scott\Desktop\CODE\tinkerquarry`:

```powershell
pnpm -r lint
pnpm -r type-check
cd apps\ui
node --experimental-vm-modules --no-warnings node_modules/jest/bin/jest.js --runInBand
cd ..\..
pnpm test:web:unit
pnpm test:e2e:web
cmd /c "call ""C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\LaunchDevCmd.bat"" -arch=x64 && set PATH=%USERPROFILE%\.cargo\bin;%PATH% && pnpm.cmd tauri:build"
node scripts/smoke-tauri-runtime.mjs
pnpm test:e2e:tauri:installed
pnpm test:gate
```

From `C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## Where The Truth Lives

- [STATUS.md](STATUS.md)
- [HANDOFF-TO-CODEX.md](HANDOFF-TO-CODEX.md) - historical 2026-06-22 handoff, not current status
- [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md)
- [audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md)
