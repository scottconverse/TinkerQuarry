# TinkerQuarry — Project Plan & Roadmap

**Version:** 1.0 · **Date:** 2026-07-09 · **Baseline:** v1.4.0 shipped 2026-07-09 (public beta,
GauntletGate CLEAR TO ADVANCE at fix-to-zero).
**Planning units:** release cycles with S/M/L effort sizes (S ≈ days, M ≈ 1–2 weeks, L ≈ several
weeks of owner+agent time). Calendar dates are deliberately not promised: the team is one owner
plus AI agents, and every release is gated by evidence, not by date.

## Operating cadence

Each release runs the same pipeline that shipped v1.4.0: goal plan → build with tests-first →
full release gate (`pnpm test:release`, zero skips) → GauntletGate (lite + first-run walkthrough +
five-role review) fix-to-zero → tag → publish with checksums/manifest → visitor audit of all
public surfaces fix-to-zero. The gate artifacts are committed under `docs/audits/`.

## v1.5 — "Trust hardening" (target: next cycle; overall size M)

Theme: close the gaps the external audit and the license sweep exposed, before adding surface.

| # | Item | Size | Exit proof |
|---|---|---|---|
| 1 | License-clean bundle: drop `openai`+`distro` (direct HTTP via bundled `httpx`), worker-process `manifold3d`; add license scan to the gate | M | Installer venv contains zero GPL-2.0-incompatible packages; scan job red on reintroduction |
| 2 | Per-commit CI expansion: full tool-independent engine lane + full Jest on every push | S | CI wall-time report; a seeded regression caught pre-merge |
| 3 | Nightly N=5 gate-lane flakiness table + published diff-coverage | S | Table auto-published; 5/5 stable baseline recorded |
| 4 | Connector honesty states: "simulated-tested only" labels + first-real-send confirmation | S | Installed-app walkthrough shows the state; Jest locks it |
| 5 | `App.tsx` extraction phase 1 (workflow state machine → store; reverse-import + engine-lifecycle effects → hooks) | M | Line count < 3,000; zero behavior diffs (full suite green); UI wiring defect class retired |
| 6 | Model bake-off: Qwen3-Coder-class default (Apache-2.0), Moondream2 low-VRAM vision floor; avoid Gemma-3 terms | M | Benchmark harness comparison published; default flipped only on measured win |
| 7 | Docs: `backend/` in repo map + honest README there; README feature list split Verified/Implemented | S | Visitor-audit re-check clean |
| 8 | Upstream license ask: request GPL-2.0-or-later re-grant from `openscad-studio` author (their stated rationale — matching OpenSCAD — already implies it; OpenSCAD is verifiably v2-or-later) | S (external) | Issue filed; outcome recorded here. Unlocks, not blocks |

**Decision gate at v1.5 exit (owner):** default-model flip; whether the upstream re-grant
changes the licensing posture.

## v1.6 — "Reach" (target: following cycle; overall size L)

Theme: meet the 2025–26 hardware wave and the parametric-model demand where they are.

| # | Item | Size | Exit proof |
|---|---|---|---|
| 1 | Printer wave 1: Snapmaker U1, Prusa CORE One / L / MK4S, Qidi Plus 4 / Q2, FLSUN S1/T1 — all open Moonraker/PrusaLink machines with official Orca profiles | M | Catalog `--verify` re-run committed; slice-proof per machine |
| 2 | Bambu Developer-Mode connector (H2D/H2S/X2D; X1C marked EOL) per OpenBambuAPI; in-product tradeoff copy | M | Mock contract tests + protocol-doc citations; honesty label until field-verified |
| 3 | 3MF-first export/handoff everywhere (ISO/IEC 25422:2025); STL fallback | S | Defaults flipped; e2e asserts 3MF path |
| 4 | Customizer-comment support in generated SCAD (PMM-compatible syntax) — groundwork for publish-anywhere parametric models | M | Generated models expose sliders in stock OpenSCAD customizer |
| 5 | BOSL2-first prompting for mechanical primitives (threads, gears, snap-fits) | S | Benchmark: hallucination-class failures down on the standard prompt set |
| 6 | First-run weight relief: cloud-key quick start at welcome; lazy vision-model pull | S | Walkthrough: prompt-to-part reachable without the 5–6 GB model set |
| 7 | ADMesh pre-repair for uploads; reverse-import robustness pass | S | Malformed-mesh corpus test |
| 8 | `webapp.py` handler split along route-table seams; `App.tsx` phase 2 | M | File sizes halved; suite green |
| 9 | Field-verification program: first real-hardware send evidence for ≥3 families (owner's printers + early users) | M (external) | Field logs committed; honesty labels lifted per family |

## v2.0 — "Differentiate" (target: the quarter after; overall size L)

Theme: the features nobody else has, on the foundation the first two cycles hardened.

| # | Item | Size |
|---|---|---|
| 1 | In-webview instant slice estimates (Kiri:Moto, MIT, runs inside the UI) feeding the evidence panel — no OrcaSlicer round-trip for feedback | M |
| 2 | Severity-graded printability (SupportSage-style overhang classes; thin-wall grades) replacing binary warnings | M |
| 3 | Per-body multi-material generation + AMS/CFS/toolchanger mapping through slicing (design starts v1.6) | L |
| 4 | Parametric publish flow: one-click export of customizer-ready models (e.g., to Printables, which has no customizer) — the open, local answer to MakerWorld's walled PMM | M |
| 5 | Material limits in evidence panel (thermal/mechanical flags for heat-adjacent or load-bearing parts) | S |
| 6 | Obico/OctoPrint webhook: in-print failures feed the iteration log (REST only) | S |
| 7 | Linux build; signed Windows installer (SignPath) | L (external dependency for signing) |
| 8 | Template-registry growth program: authoring guide + validation harness + contribution path | M |

## Resources & assumptions

Owner + AI agents; hardware on hand for field verification limited to owner's printers — item
v1.6-9 needs early-user participation. External dependencies: SignPath onboarding (v2.0-7),
upstream license re-grant (v1.5-8, optional), OrcaSlicer release cadence (track, don't fork).

## Standing risks watched per cycle

Bambu/vendor lockdown spread (re-check connector legality each wave) · Autodesk "neural CAD" /
Zoo pricing moves (re-check differentiation claims) · print-blocking legislation (NY/CA studies;
nothing enforceable before 2029 — watch item) · solo-maintainer sustainability (the cadence above
is sized for it; cutting scope beats slipping evidence).

## Change control

This roadmap changes by PR. Reordering within a cycle: owner's call in the PR. Moving items
across cycles or adding L-sized scope: requires updating the Charter's success criteria in the
same PR if affected.
