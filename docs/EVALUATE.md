# Evaluate TinkerQuarry in ~2 minutes

A no-spin walkthrough so you can judge the real product yourself, not a description of it.

> **Read first (verification honesty):** the **engine** has real automated tests. The **front-end**
> steps below were **manually click-checked once** during the sprint — they are **not** covered by
> automated browser tests (there's one live *API* integration test, `engineLive.integration.test.ts`,
> not an `App.tsx`/Playwright flow). So treat this as "here's how to see it work yourself," not "this
> is guaranteed by a test suite." See [STATUS.md](STATUS.md) and
> [audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md).

## Run it

Two terminals (PowerShell). The engine is the local "brain"; the front end is the absorbed
OpenSCAD-Studio UI wired to it.

```powershell
# 1) Engine (local manufacturing engine — port 8765)
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765

# 2) Front end (Vite dev server — port 1420; proxies /api -> the engine)
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev
```

Then open **http://localhost:1420**. (If a dev server is already running from the sprint, just
open that URL.)

## Try the loop (each step is a real capability — engine-tested; FE manually checked)

1. **Describe** — in the prompt box: `a 70 mm round drink coaster, 4 mm tall`. Wait for the local
   engine (it's an on-box LLM + real CAD, so seconds-to-a-minute, not instant). The part renders in
   the 3D viewer; the toast leads with the engine's own check, e.g.
   *"Dimensions match: 70.0 × … mm. Looks printable (92/100)."*
2. **Tune** — open the **Customizer** tab; drag a slider (e.g. diameter). The geometry re-renders;
   the **Make it real** button's tooltip keeps the readiness live.
3. **Pick your printer** — the toolbar shows two dropdowns (printer · material) before slicing — 29
   printers (Bambu/Creality/Prusa/Elegoo/Qidi/…). Pick yours; it persists.
4. **Make it real** — first time, a one-time caution appears (check fit/material). Confirm → it
   slices to **real G-code for the printer you picked** and downloads a `.gcode.3mf`.
5. **Refine** — in the AI panel: `make it 80 mm across`. The engine re-designs in context.
6. **Save / reopen / delete** — Save the design; it appears under **My Designs** on the welcome
   screen; reopen it (loads back into the viewer); the × deletes it (two-step confirm).
7. **Undo** — after a refine, the **Undo** button reverts to the previous design instantly.
8. **Export** — the Export dialog writes STL / OBJ / 3MF / SVG / DXF; File ▸ Save writes the `.scad`.
   (**PNG is NOT offered** — an earlier doc wrongly listed it.) The export *byte* path is only
   mock-tested; the click was manual.

## What is NOT here yet (the honest, complete list)

Measured against the PRD — not "polish," genuinely unbuilt or partial:

- **The signature Visual Correction Loop (§6.3.1)** — render → vision-critique → auto-fix → rounds.
  **0 lines of code.** It is *not* merely "blocked on a cloud key": even with a key, the whole loop
  (capture, critique call, multi-round, best-candidate, convergence, logging) must be **built**. The
  local-vision spike proved a 7B model can't do the critique (`docs/audits/vision-spike.md`).
- **Send-to-printer + post-print outcome (§6.10 / v1)** — the engine endpoints and client methods
  (`engine.send`, `engine.outcome`) exist but have **no front-end at all**: no connector picker, no
  status, no confirm-send, no progress, no outcome prompt. "Make it real" only **downloads** a file.
- **External-library admission (§6.11)** — the PRD's consent → sandbox-copy → include-path →
  sanitization flow does **not** exist. (Studio's inherited "custom paths" feed its own WASM renderer,
  not the engine sandbox, with no consent or copy — it is *not* this feature.)
- **7 bundled SCAD libraries (BOSL2, Round-Anything, threads.scad, YAPP_Box, Catch'n'Hole,
  gridfinity-rebuilt, MCAD)** — not vendored.
- **Manual orientation override (§6.8)** — auto-orient only; orientation is a read-only field.
- **User-invoked Explain mode, a tool-using agent loop, visual/structural diff with rollback, and a
  per-iteration "what was tried" log (§6.3 / §6.12)** — missing or only partially approximated (the
  current "Explain" is a readiness toast; "undo" is whole-design revert, not a diff).
- **Automated browser-level FE coverage** — no Playwright/`App.tsx` "describe → render → make it real"
  test. The one live API integration test is a start, not that.

## Where the truth lives

- [STATUS.md](STATUS.md) — the per-feature matrix (current + honest; supersedes any older "done").
- [TinkerQuarry-Recovery-Plan-v2.md](TinkerQuarry-Recovery-Plan-v2.md) — the plan this sprint executed.
- `git log --grep Recovery --oneline` — the recovery commits (engine work has automated proof; most
  front-end commits carry a manual screenshot/eval, not an automated test — see the honesty note).
