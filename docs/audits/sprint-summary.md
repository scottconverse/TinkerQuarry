# Recovery Sprint — Summary & Review Handoff

**Date:** 2026-06-22 · **Sprint goal:** execute [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md),
gated phase-by-phase. **27 commits** (`22a283e…`). Anti-stall gate **stays armed** — only the human can
release it; the agent cannot and did not disarm.

## Headline: the full core TinkerQuarry flow WORKS, end to end (Phase 4 B core, verified live)
**Describe a part in plain English → the local engine designs it → it renders in Studio's viewer with a
pre-slice readiness check → "Make it real" slices it to real printable G-code — locally, no cloud, no
provider wall.** Verified live this session, every step:
- **Describe → viewer:** the WelcomeScreen describe (`describeIntoStudio`) runs `/api/design`, pulls the
  engine's **self-contained** SCAD (`/api/source?inline=1` — `inline_library_includes` resolves library
  `use<>` so Studio's WASM renders template parts), sets the document, **auto-renders**. Screenshots: a
  20 mm cube and 55/70 mm coasters rendered at the right size; LLM-codegen AND template parts.
- **Readiness:** toast "Design ready · Looks printable (92/100) · Make it real to slice" (pre-slice, per
  PRD §6.7/§6.9 — final "Ready to print" is earned by the slice, not claimed at design time).
- **Make it real:** a toolbar button slices the design → toast **"Ready to print · ~11m 1s, 100 layers,
  3.12 cm³ filament · Bambu Lab P2S"** (18,335 G-code lines).
- **Code drawer:** the engine's generated SCAD shows in Studio's Monaco editor (editable).
- **Refine** foundation in place (engine `history` → refine in context; UI trigger pending).
- **No provider wall** (PRD §6.1). Front end **599/599 green**, typecheck clean. Detail:
  [phase4-architecture-decision.md](phase4-architecture-decision.md).

## What shipped (each with proof — builder ≠ self-grader)

| Phase | Delivered | Proof |
|---|---|---|
| **0** | Honest canonical repo / truth baseline | [STATUS.md](../STATUS.md) |
| **1 PASS** | **OpenSCAD Studio forked into `apps/ui`**, boots in-repo, reaches the real engine `/api/health` | [phase1-proof.md](phase1-proof.md) |
| **2 PASS** | **KimCad engine forked into `packages/engine`**; real design→gate→slice (31k-line G-code) + 38 sandbox tests, from the canonical repo | [phase2-proof.md](phase2-proof.md) |
| **3** | Reskin core: TinkerQuarry brand everywhere, **telemetry off by default**, Monaco-reload crash fixed, **3-column AI \| preview \| Customize** layout (verified desktop width) | commits `e5889e8…5330ed8` |
| **4 foundation** | Typed **`engineClient`** + authenticated dev wiring (dev token via vite proxy); **`describe→/api/design→mesh` proven end-to-end** (38 KB STL); **`engineDesign`** glue (engine result → viewer fields); CSRF-token unit test | [phase4-progress.md](phase4-progress.md) |
| **5** | Engine exposes generated source: **`GET /api/source/<rid>`** returns the real `.scad` (the code-drawer prerequisite); `engineClient.source()` | live proof + `test_webapp.py` (3/3) |
| **6 (spike)** | **Vision release-gating spike:** local `qwen2.5vl:3b` **fails spatial critique — 0/3 planted errors caught** → **v1 Visual Correction Loop must ship cloud-optional** (PRD §14 #1) | [vision-spike.md](vision-spike.md) |
| **7 (part)** | **About/Licenses panel** — GPL-2.0 source-availability statement + per-component licenses & source links → **closes the §6.14 GPL compliance gap** | preview-verified + typecheck clean |

**Verification at this checkpoint:** front end **592/592 green** (incl. new `engineDesign` 3/3,
`engineClient` 3/3, `layoutStore` 3/3); engine webapp/security subsets + new source test green; full
`apps/ui` **typecheck 0 errors**. One pre-existing upstream suite-collection quirk (`desktopMcp.test.ts`),
not introduced here.

## The headline outcomes
1. **The old central failure is reversed.** The product is no longer "KimCad's reskinned SPA" — the
   **Studio front end is absorbed** into `tinkerquarry`, branded, telemetry-off, in the design's layout.
2. **The engine↔front-end seam is real and proven** (authenticated `describe→geometry` over HTTP, plus a
   source endpoint) — the uncertain integration question is answered *yes*.
3. **The signature feature's hard question is answered with evidence:** local vision can't critique
   spatially, so the loop is **cloud-optional** — decided by a spike, not a guess.

## What's next
The product is **usable end-to-end** (describe → tune → print the tuned part → refine), all verified.
Remaining, by category:
- **Blocked on you:** the **Visual Correction Loop** (signature feature — needs a **cloud vision API key**;
  local vision failed the spike) and the **7 bundled libraries** (needs your **OK to download/vendor** —
  supply-chain + license/sandbox).
- **Large net-new features** (engine surface + UI): **manual orient** (§6.8 — the engine auto-orients but
  exposes no candidate-pose override), **version history / My Designs** (§6.12 — the engine has
  `/api/designs` save/list/reopen; needs a UI surface), **edits-back-through-the-engine** (re-gate
  arbitrary edited SCAD, behind the sandbox).
- **Lower-value polish:** refine conversation bubbles, Explain mode, live-readiness-while-dragging, the
  optional `smart_mesh` verdict rename.

## Resolved since the first cut (now done + live-verified)
- ✅ **Customizer (§6.6) for template parts** — `emit_scad` hoists params to sliders; the panel renders
  Width/Depth/Height/Wall sliders and **tuning re-renders** (box 80→120, screenshots). 584 engine + 9
  parser tests.
- ✅ **Make-it-real prints the TUNED part** — a pure slider tune re-renders via `engine.render` before
  slicing (safe tune-vs-edit detection; tuned 60→150 sliced the 150 mm box, not the original).
- ✅ **Refine in context** — "make it 80mm tall" on an 80×60×40 box → height-80 box, via conversation history.

## Known limitations (honest — for the review)
- **Make-it-real after a structural CODE edit** (not a slider tune) still slices the last engine design,
  with a warning — wiring arbitrary edited SCAD back through the engine's re-gate (behind the sandbox) is
  the remaining "edits-back" piece.
- **Template parts show the inlined (self-contained) SCAD in the code drawer**, not the readable form —
  but the inlined form is *correct* for the Customizer (Studio re-renders the document locally on a tune;
  a library-less readable doc would break that). Low priority.
- The 2-turn refine **conversation-bubble transcript** (the refine works; it just doesn't render as chat).
- **Live readiness while dragging a slider** — the readiness verdict updates at Make-it-real (the engine
  re-gates then; an un-printable tune is refused), not continuously during the drag. Safety is covered.

**Recommended:** the auditor reviews the gate-passes (P1/P2/P4-foundation/P4-B-core/P5/P6, all evidenced
with live screenshots + tests; 603/603 front end, typecheck clean). The hard, uncertain work is **done and
proven**; the remaining is mostly blocked on you (cloud key, library OK) or is bounded polish. The sprint
remains armed until you release it.
