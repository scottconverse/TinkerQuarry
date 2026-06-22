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

## Result — the model cannot discriminate (hallucinates the expected feature)
| Fixture | Truth | `qwen2.5vl:3b` verdict |
|---|---|---|
| correct (hole on top) | should MATCH | **"MATCHES… hole centered on the TOP face."** ✓ |
| **wrong_face (hole on front, top is blank)** | **should flag SPATIAL ERROR** | **"MATCHES. …a single 6 mm mounting hole centered on the TOP face as intended."** ❌ |

It returned **MATCHES for both** — confirming a top hole that **is not there** in the wrong part. This is
confirmation-bias hallucination, not spatial critique.

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
This is an **initial** spike: one local model (`qwen2.5vl:3b`), one fixture pair, a couple of prompt
framings — the plan specs a fuller 8-fixture battery (4 planted errors + 4 controls) for confidence.
But the **canonical wrong-face-hole case fails decisively and consistently** (MATCHES for both correct
and wrong), which is sufficient to make the local-only path release-gating-fail and pick the
cloud-optional design now. The 8-fixture battery + alternate local VLMs can be run later to confirm /
revisit. Fixtures + script + renders: `packages/engine/spike-vision/`.
