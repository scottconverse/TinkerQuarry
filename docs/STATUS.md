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

## Naming: TinkerQuarry vs `kimcad`

**TinkerQuarry is the product; KimCad is the engine inside it.** Per the Option-B strategy, the
KimCad manufacturing engine is the host/brain and its Studio-derived front-end was absorbed and
**reskinned to TinkerQuarry** (name, wordmark, earthy-dark theme). So you'll see TinkerQuarry in
the UI but `kimcad` throughout the plumbing — the repo (`KimCadClaude/`), the CLI (`kimcad web`,
`kimcad design`), the data dir, the `.kimcad` design-file format, and the `X-KimCad-Session`
security header. **Those `kimcad` identifiers are deliberately kept** (renaming protocol/format
strings would break the API contract and saved files); only user-facing copy was rebranded. If
you're driving the app and wondering why `kimcad.exe` serves "TinkerQuarry" — that's expected.

When you export a design from TinkerQuarry you get a **`.kimcad` portable design file** — that is
the engine's at-rest format (a zip, re-checked from its geometry on import); it's a TinkerQuarry
design, just under the engine's filename. The full rationale for keeping the `kimcad` name internally
(and for the Option-B host-the-engine strategy) is in
[`STRATEGY-RECON.md`](../../STRATEGY-RECON.md) at the `CODE/` repo-parent level.

---

## The real toolchain (installed + verified on this machine)

| Tool | Where | Proof |
|---|---|---|
| **Python 3.13.14** | uv-managed (`…\uv\python\cpython-3.13.14…`) | KimCad imports; **1,590 engine tests pass · 0 failing** (~1,691 collected; 101 skips for absent optional probes / live-tool tests) |
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
  on the real engine, now **rebranded + rethemed to TinkerQuarry** (title/wordmark/earthy-dark
  palette). Runtime-verified in-browser by the 2026-06-21 walkthrough and full gate
  ([`gate-tinkerquarry-2026-06-21/gate-report.md`](../gate-tinkerquarry-2026-06-21/gate-report.md)):
  welcome wizard, describe→Design-it, example prompts, the Describe→Preview→Check flow, printer =
  Bambu Lab P2S, and the rebranded face renders correctly. To be precise about test coverage: the
  rebranded SPA is a **visual composition, screenshot-verified** (no separate test files for the skin),
  while the **engine's React SPA is unit-tested** (405/405 frontend cases) — "full functional SPA
  verified" means it serves and runs, not that the skin layer carries its own test suite.
- **Security** — the real server enforces a per-boot session token (CSRF). `api-client.js` now reads
  that token from the page shell and sends `X-KimCad-Session` on POSTs (no-op against the mock), so
  TinkerQuarry's client speaks the **real** KimCad protocol same-origin.

## Two-repo layout (which directory each command runs from)

This product spans **two sibling repos** under `C:\Users\Scott\Desktop\CODE\`:

- **`KimCadClaude\`** — the KimCad engine (Python 3.13 venv, `kimcad.exe`, `config/local.yaml`). All
  real-runtime commands (`kimcad web`, `kimcad design`, the engine `pytest` suite) run **from here**.
- **`tinkerquarry\`** — the TinkerQuarry product repo (this repo: the reskinned front-end, the
  `backend/` connector + mock, docs). The offline-dev and glue-test commands run **from here**.

Bundled tools (OpenSCAD, OrcaSlicer) live under `..\_tools` relative to `KimCadClaude\`, wired by
`KimCadClaude\config\local.yaml`.

## Offline dev (still works on any machine, no toolchain)

From `C:\Users\Scott\Desktop\CODE\tinkerquarry`:

```
# the dependency-free mock + front-end design (no engine, no toolchain):
python scripts\dev.py            # workspace :8753 + mock API :8766
# backend glue tests:
python backend\tests\test_connector.py
python backend\tests\test_mock_api.py
```
The mock encodes the same safety invariants (gate→slice, confirm→send, outcome-only-after-real-send).

## Run it for real on this machine

From `C:\Users\Scott\Desktop\CODE\KimCadClaude`:

```
# the real engine UI (full functional SPA on the real pipeline):
.venv313\Scripts\kimcad.exe web --port 8765        # http://127.0.0.1:8765
# or the headless full chain to print-ready G-code:
.venv313\Scripts\kimcad.exe design "a 90 mm round trinket dish" --slice
```
(`config\local.yaml` wires OpenSCAD + OrcaSlicer from `..\_tools`; Ollama serves qwen2.5:7b for the plan.)

## Done (landed this build)

- **TinkerQuarry reskin/rebrand** — the TinkerQuarry name + earthy-dark visual design are applied to
  KimCad's functional SPA and **render correctly on the real engine** (verified in the 2026-06-21
  walkthrough + full gate; no stray user-facing "KimCad", protocol identifiers preserved). The
  cosmetic/branding layer is no longer outstanding.
- **Gate it** — `gauntletgate walkthrough full` ran on this real runtime → **✅ CLEAR TO ADVANCE**
  (0 Blocker / 0 Critical). See
  [`gate-tinkerquarry-2026-06-21/gate-report.md`](../gate-tinkerquarry-2026-06-21/gate-report.md).

## What remains (post–"it runs")

1. **Physical printer** — the only deliberately-deferred step (send a sliced job to real hardware).
2. **Vision input** — `qwen2.5vl:3b` (photo/sketch → design) not yet pulled; text-to-design works now.
3. **Visual-correction loop** — the render→see→fix AI loop (from the absorbed Studio front-end) is
   **being wired into the codegen path**; it is not live yet. Marketing copy should frame it as
   planned/in-progress, not as a present-tense capability.

## Licensing — GPL-2.0 (resolved)

TinkerQuarry is **GPL-2.0** end to end, and the question is settled. Per
[`STRATEGY-RECON.md`](../../STRATEGY-RECON.md) (Option B), the KimCad engine's own code was
**relicensed Apache-2.0 → GPL-2.0** so the combined work is uniformly GPL-2.0: the v2 lock comes from
the absorbed OpenSCAD-Studio front-end (GPL-2.0-only) that the product embeds, and OpenSCAD/OrcaSlicer
are invoked as arm's-length subprocesses. There is no longer an Apache-vs-GPL split to reconcile.
Bundled permissive libraries (BOSL2/MIT/CC0/LGPL-2.1) keep their own licenses; per-component
attribution is tracked in
[`KimCadClaude/THIRD_PARTY_LICENSES.md`](../../KimCadClaude/THIRD_PARTY_LICENSES.md).
