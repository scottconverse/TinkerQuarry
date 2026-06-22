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
The **Phase 4 B core + adjacent surfaces are done + verified** (describe→viewer, readiness, make-it-real
slice, code drawer, AI-panel refine routing, in-progress feedback, engine-unreachable hardening; wall
removed). Remaining:
- **Visual Correction Loop (cloud-optional, Phase 6):** the signature feature — needs a **cloud vision
  API key** (you); local vision failed the spike.
- **Seven bundled libraries (§6.11):** needs **downloading/vendoring** third-party SCAD libs + the
  license/sandbox admission the plan specs — **your OK** (supply-chain + GPL/license care).
- **Full 2-turn refine UX:** the AI panel routes to the engine, but the conversation **bubbles** for a
  refine turn aren't rendered yet (needs the agent message API); verify the 2-turn flow when LLM latency
  allows.
- **Readiness semantics in the engine:** the UI reframes it (§6.7/§6.9 done at the UI); the deeper
  `smart_mesh` verdict rename (wide test impact) stays optional.
- **Edits back through the engine** (Phase 5): user code edits + manual orient + version history.

## Known limitations (honest — for the review)
- **Make-it-real after a manual code edit slices the LAST ENGINE design, not the edit.** Edits aren't yet
  wired back through the engine (no re-design/re-gate of edited SCAD), and `Make it real` slices the
  engine rid. The common flow (describe → make it real, no edit) is correct; document-edit-then-slice is
  the gap. Fix = the "edits back through the engine" piece (behind the SCAD sandbox).
- **Template parts show the inlined (self-contained) SCAD in the code drawer**, not the readable
  `coaster_with_rim(od=70)` form. The renderer accepts aux files (renderService), so a readable-source +
  virtual-library-files split is viable; deferred (needs a template describe to verify).
- The 2-turn refine **conversation display** (above).
- **Customizer (§6.6) for TEMPLATE parts:** Studio's Customizer parses top-level `name = value; //
  [min:step:max]`. LLM-codegen parts already emit top-level params (e.g. `width = 20.0;`), so they're
  Customizer-parseable; **template** parts emit a function call (`coaster_with_rim(od=60)`), which isn't.
  The clean fix is `templates.emit_scad` hoisting each `ParamSpec` (it has name/min/max/step) to a
  top-level customizer var and referencing it in the call — render/gate/slice are unaffected (OpenSCAD
  evaluates identically; the gate validates the mesh), but **`emit_scad`'s text is asserted across
  conftest + 5 test files → wide test impact**, so it's care-intensive (like the readiness rename), not a
  rushed edit. (Live-verifying the Customizer panel also needs dockview interaction the headless preview
  can't drive.)

**Recommended:** the auditor reviews the gate-passes (P1/P2/P4-foundation/P4-B-core/P5/P6, all evidenced
with live screenshots + tests; 603/603 front end, typecheck clean). The hard, uncertain work is **done and
proven**; the remaining is mostly blocked on you (cloud key, library OK) or is bounded polish. The sprint
remains armed until you release it.
