# Evaluate TinkerQuarry in ~2 minutes

A no-spin walkthrough so you can judge the real product yourself, not a description of it.
Everything below was verified live during the recovery sprint; this is just how to reproduce it.

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

## Try the loop (each step is a real, verified capability)

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
8. **Export** — the Export dialog writes STL/OBJ/3MF/PNG/SVG/DXF; File ▸ Save writes the `.scad`.

## What is NOT here yet (honest)

- **The signature Visual Correction Loop** — render → critique → auto-fix. It needs a **cloud
  vision API key**; the local-vision spike proved a 7B model can't do reliable spatial critique
  (proof: `docs/audits/vision-spike.md`).
- **7 bundled SCAD libraries (BOSL2, …)** — not vendored (download + license/sandbox decision).
- **Manual orientation override (§6.8)** — auto-orient works; the manual picker is a net-new UX.

## Where the truth lives

- [STATUS.md](STATUS.md) — the per-feature matrix (current + honest; supersedes any older "done").
- [TinkerQuarry-Recovery-Plan-v2.md](TinkerQuarry-Recovery-Plan-v2.md) — the plan this sprint executed.
- `git log --grep Recovery --oneline` — the 95 verified commits, each with its proof in the message.
