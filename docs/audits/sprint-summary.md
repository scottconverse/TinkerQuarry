# Recovery Sprint — Summary & Review Handoff

**Date:** 2026-06-22 · **Sprint goal:** execute [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md),
gated phase-by-phase. **19 commits** (`22a283e…18a2e0f`). Anti-stall gate **stays armed** — only the
human can release it; the agent cannot and did not disarm.

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

## What's next — and what it needs from you
The remaining work is substantial and multi-turn. The **safe, independent** pieces are done; what's left
is deliberately **not** rushed solo:
- **Phase 4 body (AI panel → engine + remove the "Configure an AI provider" wall):** coupled UI surgery
  on Studio's AI panel (the wall removal only makes sense *with* the engine wiring). Warrants the
  auditor's review of this foundation first, per your builder≠auditor process.
- **Readiness semantics ("Ready to print" only after a slice, §6.7/§6.9):** a core change to the engine's
  readiness model (`smart_mesh`/`pipeline`) with wide test impact — care-intensive, not an hour-N edit.
- **Visual Correction Loop implementation (cloud-optional):** needs a **cloud vision API key** (you).
- **Seven bundled libraries (§6.11):** needs **downloading/vendoring** third-party SCAD libs (your OK).

**Recommended:** the auditor reviews the P1/P2/P4/P5/P6 gate-passes (all evidenced above) before I take
on the coupled Phase-4-body surgery. The sprint remains armed until you release it.
