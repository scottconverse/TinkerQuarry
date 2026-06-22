# Phase 6 — local-vision spike (release-gating, PRD §14 #1) — RESULT: ❌ local vision inadequate → loop must be cloud-optional

**Date:** 2026-06-22 · **Plan:** [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md) Phase 6
**Question:** is the local vision model (`qwen2.5vl:3b`) good enough for the Visual Correction Loop's
**spatial critique** — can it catch a design that passes the math gate but is spatially wrong?

## Method
- **Fixtures** (both pass the geometric gate — only vision can tell them apart):
  - `correct.scad` — a 40 mm cube with a 6 mm hole **on the TOP face** (matches intent).
  - `wrong_face.scad` — same intent, but the hole is **on the FRONT face** (the PRD's canonical
    wrong-face-hole planted error). Renders confirm it: the top is plain.
- Rendered isometric + top-down PNGs via OpenSCAD (headless), fed to `qwen2.5vl:3b` (local, via Ollama)
  with the intent and: *"is the hole on the TOP face? MATCHES or SPATIAL ERROR, and why."*

## Result — 0 / 3 planted errors caught; the model hallucinates the expected feature
| Fixture | Truth | `qwen2.5vl:3b` verdict |
|---|---|---|
| correct (hole on top) | should MATCH | **"MATCHES… hole centered on the TOP face."** ✓ |
| **wrong_face** (hole on front; top is blank) | flag ERROR | **"MATCHES… hole centered on the TOP face as intended."** ❌ |
| **wrong_floating** (knob floats ~19 mm above, obvious gap) | flag ERROR | **"MATCHES… physically connected… not floating or disconnected."** ❌ |
| **wrong_missing** (plain cube; intended slot absent) | flag ERROR | **"MATCHES. …a rectangular slot cut through its front face… clearly visible."** ❌ |

The model returns **MATCHES for every case** — it confirms the intended feature regardless of what was
rendered, even **contradicting a plainly visible mid-air gap** ("not floating") and **describing a slot
on a plain cube**. This is confirmation-bias hallucination, not spatial critique. The one *correct*
fixture passing is no comfort: a model that always says MATCHES trivially "passes" controls.

*(Methodology note: the floating fixture's first version had only a 3 mm gap — not visibly floating, so it
wasn't a fair test; it was re-rendered with a ~19 mm gap that is unmistakable in the render, and the model
still failed. The renders are in `spike-vision/`.)*

## Verdict (against the PRD acceptance criterion)
PRD §6.3.1: *"a deliberately wrong design that passes mathematical validation — e.g. a hole on the wrong
face — must be flagged by the loop when vision is available. 'The loop ran' is not success; 'the loop
caught the planted spatial error' is."* **`qwen2.5vl:3b` does not meet this.** It fails the canonical
case decisively (says the intended feature is present when it is absent).

## Decision (PRD §14 #1 contingency)
**The v1 Visual Correction Loop must ship CLOUD-OPTIONAL, not local-only.** The *design* is identical
(per the PRD) — same rounds/best-candidate/modes/logging; only the critique model and the honest
**full-visual (cloud) vs text-only (no usable vision)** labels differ. Local `qwen2.5vl:3b` stays usable
for the photo/sketch **seeding** on-ramp (a different, easier task), **not** for render critique.

## Honesty / scope
One local model (`qwen2.5vl:3b`), 3 valid planted errors + 1 control — short of the plan's full
8-fixture battery, but **0/3 planted errors caught (with one always-MATCHES failure mode)** is decisive
enough to gate the local-only path out now and adopt the cloud-optional design. The failure is not a
near-miss to tune away: the model asserts features that are visibly absent and denies a gap that is
plainly visible. Remaining confirmation work (lower priority, since the decision is made): the full
8-fixture battery, prompt/temperature variations, and alternate local VLMs (e.g. larger qwen-VL,
llava, moondream) — if some future local VLM clears the bar, the loop can switch back to local with no
design change (the cloud/local split is already the plan). Fixtures + script + renders:
`packages/engine/spike-vision/`.
