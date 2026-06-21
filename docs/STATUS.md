# TinkerQuarry — build status

**As of:** 2026-06-21 · **Runtime:** real KimCad engine on Python 3.13, this machine (Beelink SER8)
**Honest one-liner:** the **full software pipeline runs end-to-end on this box** —
plain-English prompt → local LLM design plan → real OpenSCAD geometry → mesh validation →
auto-orient → manifold3d hardening → printability gate → **real OrcaSlicer slice to print-ready
G-code**. The only thing untouched is sending to a **physical printer** (deliberately deferred).

> This supersedes the earlier STATUS, which said "no real geometry runs yet / needs a machine this
> build box is not." That was wrong. The real toolchain was installable here and is now installed
> and proven.

---

## The real toolchain (installed + verified on this machine)

| Tool | Where | Proof |
|---|---|---|
| **Python 3.13.14** | uv-managed (`…\uv\python\cpython-3.13.14…`) | KimCad imports; **~1,554 engine tests pass** (full suite ~1,667 collected; 9 pre-existing env/profile failures unrelated to this work, 104 skips for absent optional probes) |
| **OpenSCAD 2021.01** | `_tools/openscad/openscad-2021.01/openscad.exe` | renders headlessly: cube→STL, part→**3MF** (no fallback) |
| **OrcaSlicer 2.4.0** | `_tools/orcaslicer/orca-slicer.exe` | slices to G-code with the Bambu P2S profile |
| **Ollama + qwen2.5:7b** | `…\Programs\Ollama`, model pulled (4.7 GB) | local design-plan LLM (CPU, ~50–80 s/part) |
| **KimCad 0.9.3** | `KimCadClaude/.venv313` (`pip install -e .[dev]`) | the engine; `config/local.yaml` points it at the tools above |

`kimcad web` health on this box: `{"openscad": true, "orcaslicer": true}`.

## What runs end-to-end here, today (real engine — not the mock)

- **Headless full chain** — `kimcad design "a desk cable clip for an 8 mm cable" --slice`:
  - qwen2.5:7b planned `cable_clip` (16×27×10 mm) — **~82 s** (design) / **~48 s** (design+slice), real CPU inference
  - real OpenSCAD geometry → **watertight** mesh, 3761 mm³
  - auto-orient (most-stable facet) + **manifold3d hardening (genus 1)**
  - **Printability Gate: PASS · readiness 92/100** · checks: mesh.solid, dim.match, volume.fits (Bambu P2S)
  - **OrcaSlicer slice: 17,034 G-code lines → `part.gcode.3mf` (86 KB)**, est. ~6m58s / 50 layers / 1.93 cm³
- **Real web UI** — `kimcad web` serves the full functional SPA (the absorbed Studio-derived front-end)
  on the real engine; verified in-browser (welcome wizard, describe→Design-it, example prompts, the
  Describe→Preview→Check flow, printer = Bambu Lab P2S).
- **Security** — the real server enforces a per-boot session token (CSRF). `api-client.js` now reads
  that token from the page shell and sends `X-KimCad-Session` on POSTs (no-op against the mock), so
  TinkerQuarry's client speaks the **real** KimCad protocol same-origin.

## Offline dev (still works on any machine, no toolchain)

`backend/` mock + `frontend/` design: `python scripts/dev.py` → workspace :8753 + mock API :8766.
Backend glue tests: `python backend/tests/test_connector.py` · `python backend/tests/test_mock_api.py`.
The mock encodes the same safety invariants (gate→slice, confirm→send, outcome-only-after-real-send).

## Run it for real on this machine

```
# the real engine UI (full functional SPA on the real pipeline):
KimCadClaude\.venv313\Scripts\kimcad.exe web --port 8765        # http://127.0.0.1:8765
# or the headless full chain to print-ready G-code:
KimCadClaude\.venv313\Scripts\kimcad.exe design "a 90 mm round trinket dish" --slice
```
(`config/local.yaml` wires OpenSCAD + OrcaSlicer; Ollama serves qwen2.5:7b for the plan.)

## What remains (post–"it runs")

1. **Physical printer** — the only deliberately-deferred step (send a sliced job to real hardware).
2. **TinkerQuarry reskin/rebrand** — apply the TinkerQuarry visual design + name to KimCad's functional
   SPA. The engine + UI work; this is the cosmetic/branding layer.
3. **Vision input** — `qwen2.5vl:3b` (photo/sketch → design) not yet pulled; text-to-design works now.
4. **Gate it** — `gauntletgate walkthrough full` on this real runtime.
