# GauntletGate — Walkthrough lane — TinkerQuarry (real runtime)

**Date:** 2026-06-21 · **Target:** `kimcad web` (real engine) on http://127.0.0.1:8765
**Build:** KimCadClaude@8400497 (engine 0.9.3, rebranded+rethemed SPA) · KimCad on Python 3.13

## Environment-provisioning attestation

| What | State used | How VERIFIED |
|---|---|---|
| Profile / first-run | fresh browser profile; `kc-first-run-done` unset | `preview_eval` read localStorage → `[]` (empty); first-run wizard rendered on load |
| External dep: Ollama (AI) | **torn down → self-healed** | killed all `ollama` procs (probe: 11434 refused → `model-status` model_present:false); KimCad **re-spawned ollama** (pid 19052, 11434 back up) when a design ran |
| External dep: OpenSCAD | present | `/api/health` → `openscad: true` (artifact `health-absent-ai.json`) |
| External dep: OrcaSlicer | present | `/api/health` → `orcaslicer: true` |
| AI models on disk | qwen2.5:7b + qwen2.5vl:3b present | `ollama list` (cannot tear down 4.7GB to test "never downloaded" runtime) |
| Network | online (loopback only) | server bound 127.0.0.1; session-token enforced |

**Isolation verified?** PARTIAL — first-run UI state verified (empty profile, wizard shown) and the
**dependency-absent server path verified by teardown** (Ollama killed → self-healed). The
"model-never-downloaded" runtime cell was **not** torn down (models are on disk); it is covered by
the FirstRunWizard's setup flow (tested: UX-COLD-001) but not runtime-verified here.
**→ First-run coverage:** VALID for reachability (no dead-end found); note the caveat above.
**Artifacts:** `artifacts/health-absent-ai.json`, `artifacts/model-status-absent-ai.json`, the
in-run screenshots (first-run wizard; "Designing your part… 1:49 elapsed" progress state).

## First-run verdict: reaches core feature ✅ (no dead-end)

Provisioning-matrix cells walked: **{first-run} × {AI absent→self-healed, OpenSCAD/Orca present} ×
{data empty} × {online-loopback}**, plus {returning} via the prior end-to-end runs.

1. New user → **first-run wizard** ("Welcome to TinkerQuarry"; steps Welcome · Set up your AI ·
   Pick your printer · Direct printing · Ready). Guided, dismissible (Skip setup).
2. **Set up your AI** step offers one-click in-app setup (KimCad manages its own engine — no
   "go install Ollama yourself"); covered by passing UX-COLD-001/FULL-001 tests.
3. Adversarial: **Skip setup → type a prompt → "Design it" with the AI killed.** The app did NOT
   dead-end — it entered an honest progress state ("Designing your part… Planning the shape… can
   take a few minutes… Nothing leaves your machine", elapsed timer, **Cancel**) and **KimCad
   re-spawned Ollama automatically** (self-heal). Same pipeline proven to complete headless
   (cable_clip → Gate PASS 92/100 → sliced 86 KB G-code).

## Findings

- **W-1 (Minor) — status inconsistency while AI cold-loads.** `/api/model-status` returns
  `"running": true` together with `"model_present": false` in the window after Ollama is
  (re)started but before the model is loaded/probed. Evidence: `model-status-absent-ai.json`.
  Impact: a status pill could read contradictory; no functional break. Fix: gate `running` on a
  successful model probe, or expose a `loading` state.
- **W-2 (Nit) — cold-start latency surfaced only as a spinner+timer.** First design after an AI
  (re)start cold-loads the 4.7 GB model (~2 min observed); copy warns "a few minutes," which is
  honest, but a determinate phase indicator would reassure. Not a defect.

## What's working (credited)
Rebrand+retheme render correctly on the real engine (title/wordmark/palette); first-run wizard
guides; **managed-engine self-heal** (the headline first-run win — no dependency dead-end); honest
async progress with cancel; session-token CSRF enforced (tokenless POST → 403, verified earlier);
the full describe→plan→geometry→gate→slice pipeline proven end-to-end.
