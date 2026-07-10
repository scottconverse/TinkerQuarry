# TinkerQuarry — Project Plan & Roadmap

**Version:** 2.0 · **Date:** 2026-07-09 · **Supersedes:** v1.0 (same day; rewritten at takeover
depth) · **Baseline:** v1.4.0 shipped 2026-07-09 (GauntletGate CLEAR TO ADVANCE at fix-to-zero;
post-publish visitor audit fixed to zero).

**Who this is for:** whoever executes the next release. Each item says why it exists, what to
actually do (files/patterns), what it depends on, its size, and a **definition of done** a gate
can check. Sizes: S ≈ days, M ≈ 1–2 weeks, L ≈ several weeks of owner+agent time. Calendar
dates are deliberately not promised — one owner + AI agents, evidence-gated releases; cutting
scope beats slipping evidence.

## 0. Operating cadence (unchanged; it shipped two releases)

Goal plan → build tests-first → `pnpm test:release` (zero skips) → GauntletGate (fast lane +
first-run installed-app walkthrough + five-role review) fix-to-zero → tag at the merge commit →
publish with SHA256SUMS + commit-pinned manifest → visitor audit of every public surface
fix-to-zero. Runbook detail: [SAD §8](SAD.md); traps: [SAD §9](SAD.md).

## 0.1 Open decisions (owner) — these gate parts of the plan

| Decision | Options | Blocks | Where the analysis lives |
|---|---|---|---|
| Licensing/UI-ownership posture | A: stay GPL-2.0-only · B: independent implementation of the UI layer from a functional spec · C: A now, B later as "UI 2.0" | Nothing in v1.5 (its items are correct under all three); B/C would reshape v2.0 | [SAD ADR-7](SAD.md); upstream or-later request open (issue #155 on the upstream repo) |
| Default chat/vision models | flip after bake-off vs keep qwen2.5 | v1.5-6 flip step only | PRD R5.3 |

---

## v1.5 — "Trust hardening" (overall M; no external dependencies)

Theme: close what the external audit and the license sweep exposed **before** adding surface.
Every item is independently shippable; 1 and 5 are the long poles.

**v1.5-1 · License-clean bundle · M · the top compliance item**
*Why:* the installer venv ships three Apache-2.0 packages (`openai`, `distro`, `manifold3d`) —
incompatible with GPL-2.0-only distribution (scan 2026-07-09; [SAD ADR-3](SAD.md)).
*What:* (a) replace the `openai` client in `llm_provider.py` with direct chat-completions HTTP
over the already-bundled `httpx` (BSD-3) — `distro` leaves with it; (b) move the `manifold3d`
call in `hardening.py` into a worker process, mirroring `cadquery_runner.py`'s isolation
pattern (same env-scrubbing, same typed-degradation when absent); (c) add a gate job that
sweeps staged `*.dist-info` METADATA license fields against an allowlist and fails on
violations; (d) update THIRD_PARTY_LICENSES.
*Depends on:* nothing. *DoD:* staged-bundle sweep shows zero incompatible licenses; provider
tests pass against a mocked HTTP endpoint; hardening tests cover worker-present/absent; the
scan job is red if anyone re-adds `openai`.

**v1.5-2 · Per-commit CI expansion · S**
*Why:* today CI is a smoke; the 1,755-test story runs only at release, so regressions surface
in weeks, not hours. *What:* extend `.github/workflows/ci.yml` to run the full tool-independent
engine lane (the `-m "not live and not real_tool and not needs_cadquery and not needs_browser"`
selection, ~3.5 min) plus full UI+web Jest on every push/PR.
*DoD:* CI wall-time stays under ~20 min; a deliberately seeded regression in a
non-tool-dependent module fails PR CI.

**v1.5-3 · Flakiness + coverage evidence · S**
*Why:* "the gate passed" is a single sample; the product's promise is determinism.
*What:* nightly scheduled workflow runs the CI lane N=5 and publishes a stability table;
publish `scripts/check_diff_coverage.py` output on PRs.
*DoD:* table visible in the repo (Actions summary or committed markdown); 5/5 baseline
recorded; PRs show diff-coverage.

**v1.5-4 · Connector honesty states · S**
*Why:* mock-verified send must not look field-proven (PRD R4.2 — the audit's sharpest product
point). *What:* per-family verification state in the connector metadata; UI badge
("simulated-tested only") + explicit first-real-send confirmation; lifting a badge requires a
committed field log under `docs/audits/field/`.
*DoD:* badge visible in the release walkthrough; Jest locks both states; zero families lifted
without a log.

**v1.5-5 · `App.tsx` decomposition, phase 1 · M**
*Why:* 5,077 lines / 41-29-57 hook footprint; every v1.4.0 UI defect was wiring inside it.
*What:* mechanical, test-locked extraction — workflow/manufacturing state machine into
`workspaceStore` (selectors exist), reverse-import + engine-lifecycle + dialog effect clusters
into hooks. Two or three PRs, no behavior change.
*Depends on:* v1.5-2 first (so extraction PRs get real CI). *DoD:* `App.tsx` < 3,000 lines;
full suite green with zero test rewrites beyond imports; no new lint suppressions.

**v1.5-6 · Model bake-off · M**
*Why:* qwen2.5:7b (June default) is no longer the size-class leader; VCL floor should run on
<4 GB VRAM. *What:* run the existing `bench`/`bakeoff` harness over Qwen3-Coder-class
(Apache-2.0) chat candidates and Moondream2 vs qwen2.5vl:3b for VCL probes; flip defaults only
on measured wins; keep license allowlist (no non-OSI custom-terms weights).
*DoD:* committed bake-off report with per-prompt-set numbers; defaults changed (or explicitly
kept) with the evidence linked; `model_pull` rows updated if flipped.

**v1.5-7 · Doc completeness fixes · S**
*What:* add `backend/` to the README repository map with an honest in-folder README
("historical prototype, not product evidence" — the folder currently has none); split the
README feature list along STATUS's Verified/Implemented line.
*DoD:* visitor-audit re-check of the README clean.

**v1.5-8 · Upstream or-later request stewardship · S (external)**
*What:* the request is filed (upstream issue #155). Steward it: respond if he replies; if
granted, record the grant, update THIRD_PARTY_LICENSES, and reopen ADR-7 with option space
widened. No nagging cadence beyond one polite follow-up after ~a month.
*DoD:* outcome (grant / decline / silence) recorded in ADR-7 by v1.6 cut.

**Release exit:** all of the above at DoD → gate → gauntlet → tag v1.5.0.

---

## v1.6 — "Reach" (overall L)

Theme: meet the 2025–26 hardware wave and proven parametric-model demand.

**v1.6-1 · Printer wave 1 (open machines) · M**
*Why:* the genuinely open 2025-26 machines are the low-risk, high-alignment adds — Snapmaker U1
(vendor open-sourced Klipper/Moonraker forks, official Orca profiles), Prusa CORE One / CORE
One L / MK4S (PrusaLink REST, cleanest documented API surveyed), Qidi Plus 4 / Q2 (real
Moonraker + official profiles), FLSUN S1/T1 (vendor-open Klipper deltas; new vendor for the
catalog). *What:* catalog entries + profiles; existing Moonraker/PrusaLink connectors should
cover them — verify per machine; re-run `build_printer_catalog.py --verify` per batch.
*DoD:* proof-of-record updated; per-machine slice proofs; connector smoke per protocol; catalog
tripwire green.

**v1.6-2 · Bambu current-gen connector · M**
*Why:* volume matters; X1C (current catalog flagship) is EOL. *What:* rework
`bambu_connector.py` for Developer-Mode LAN MQTT/FTP per the open community protocol docs
(H2D/H2S/X2D fields incl. dual-nozzle/AMS state); in-product copy for the Developer-Mode
tradeoff; catalog updates (add H2-series/X2D, mark X1C EOL). Constraint: [ADR-6](SAD.md) —
open docs only; H2C toolchanger excluded until stable slicer support exists.
*DoD:* mock contract tests with protocol citations; honesty badge active (v1.5-4); walkthrough
shows the tradeoff copy.

**v1.6-3 · 3MF-first · S**
*Why:* 3MF is ISO/IEC 25422:2025 and the native format of every major slicer; STL is legacy.
*What:* default export/handoff to 3MF everywhere (slice path already produces it); STL kept as
fallback; docs/copy updated. *DoD:* e2e asserts 3MF default; manual updated.

**v1.6-4 · Customizer-comment SCAD · M**
*Why:* PRD R1.6 — publish-anywhere parametric models; the walled in-browser customizer has
~310K users and no open equivalent. *What:* emit OpenSCAD customizer annotations from template
parameters; round-trip test in stock OpenSCAD.
*DoD:* generated file shows sliders in stock OpenSCAD; gate test covers the round-trip.

**v1.6-5 · BOSL2-first prompting · S**
*What:* PRD R1.5 — steer generation to vendored BOSL2 modules for threads/gears/snap-fits;
measure failure-class delta on the standard prompt set. *DoD:* before/after numbers committed.

**v1.6-6 · First-run weight relief · S**
*What:* PRD R5.4/R5.5 — surface the existing BYOK cloud path at Welcome ("start now, download
later"); make the vision model pull lazily on first VCL use.
*DoD:* walkthrough reaches prompt-to-part with no local model downloaded (cloud key path) and
shows deferred vision pull.

**v1.6-7 · ADMesh pre-repair · S**
*What:* PRD R3.3 — GPL-2.0 ADMesh pass before validation on upload. *DoD:* malformed-mesh
corpus test shows repaired-or-honestly-rejected for each case.

**v1.6-8 · Engine/UI structure phase 2 · M**
*What:* split `webapp.py` handlers along the route-table seams; `App.tsx` phase 2 (dialogs,
panels wiring). *DoD:* `webapp.py` no single module >1,500 lines; suite green.

**v1.6-9 · Field-verification program start · M (external participants)**
*What:* real-hardware send verification on owner's printers + recruited early users; committed
field logs; lift honesty badges per family (target ≥3 families by v2.0 — Charter success
criterion 4). *DoD:* `docs/audits/field/` logs; badges lifted only via logs.

**Multi-material design doc** (PRD R7.1) also lands this cycle as a design-only deliverable.

---

## v2.0 — "Differentiate" (overall L; shapes depend on ADR-7 outcome)

| # | Item | Size | Notes |
|---|---|---|---|
| 1 | In-webview instant slice estimates (Kiri:Moto, MIT — runs inside the UI webview) feeding the evidence panel | M | No AGPL contact; OrcaSlicer stays the authoritative slicer |
| 2 | Severity-graded printability (PRD R2.5) | M | SupportSage (MIT) as reference implementation |
| 3 | Per-body multi-material + AMS/CFS/toolchanger mapping (PRD R7.1) | L | Slice-time mapping only — vendor LAN modes don't remap imported G-code |
| 4 | Parametric publish flow (customizer-ready export to model platforms) | M | Builds on v1.6-4 |
| 5 | Material limits in evidence panel (PRD R2.6) | S | |
| 6 | Obico/OctoPrint in-print feedback webhook (PRD R4.7) | S | REST only |
| 7 | Linux build + signed Windows installer (SignPath) | L | Signing requires CI-built artifacts — real pipeline work, external onboarding |
| 8 | Template-registry growth program (authoring guide + validation harness + contribution path) | M | The deterministic lane's ceiling is the registry (ADR-2) |

## External dependencies (tracked, none blocking v1.5)

SignPath Foundation onboarding (v2.0-7) · upstream or-later re-grant (widens ADR-7 options
only) · OrcaSlicer release cadence (pin recent stable per cycle; re-check profile coverage) ·
early-user field participation (v1.6-9).

## Standing risks — reviewed at each release cut

Vendor lockdown spread (re-check each connector's legal terrain per wave) · funded competitor
ships local prompt-to-CAD (re-check differentiation claims in README/charter) · print-blocking
legislation (feasibility studies; nothing enforceable before 2029 — watch only) · solo-
maintainer sustainability (if a cycle overruns, cut scope, never evidence).

## Backlog (researched, unscheduled)

PythonSCAD as a second codegen target (GPL-2.0 fork of OpenSCAD; Python surface may reduce
LLM syntax errors) · FreeCAD (LGPL) as a long-horizon trusted-twin backend with real feature
history · farm-manager integrations beyond metadata (SimplyPrint-class) · libnest2d
(LGPL-3.0) plate nesting for multi-part jobs · upstream-Studio changelog mining each cycle
(same-license fixes are free to take, both directions).

## Change control

This roadmap changes by PR. Reordering within a cycle: owner's call in the PR description.
Moving items across cycles or adding L-sized scope: update the [Charter](PROJECT-CHARTER.md)
success criteria in the same PR if they're affected. Every item's DoD is checkable at the gate
— an item without a checkable DoD doesn't enter the plan.
