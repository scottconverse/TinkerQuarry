# TinkerQuarry — Product Requirements Document

**Version:** 2.0 · **Date:** 2026-07-09 · **Supersedes:** v1.0 (same day; rewritten at takeover
depth) · **Baseline product:** v1.4.0, engine KimCad 0.9.4

**Who this is for:** someone deciding what to build next, reviewing whether a change is
acceptable, or checking whether a claim about the product is true. No prior exposure assumed —
read the [Charter](PROJECT-CHARTER.md) first for why any of this exists.

## 0. How to read this document

- Every requirement has an **ID** (stable across versions — do not renumber), a **statement**,
  a **rationale**, an **acceptance** clause written so a release gate can check it, and a
  **status**.
- **Status values:** `Verified` — an automated check exists and runs in the release gate today
  (the acceptance clause names where). `Implemented` — the behavior exists; evidence is partial
  or manual. `Planned (vX.Y)` — targeted in [ROADMAP.md](ROADMAP.md).
- This document changes **in the same PR** as any behavior that changes a requirement's status.
  A status upgrade to `Verified` requires naming the check.
- The single most important product rule, which every requirement serves: **nothing the AI
  produced reaches a printer without passing deterministic checks, and the user can always see
  the evidence.**

## 1. Personas

**P1 — The functional-parts tinkerer** (primary). Owns a modern consumer printer (Bambu A1,
Elegoo Centauri class); prints mostly other people's models; needs a bracket/hook/spacer/jig
with *real dimensions* maybe once a week; has never opened CAD and doesn't want to. Judges tools
in one dimension: *did the part fit*. Market sizing honesty: MakerWorld's own numbers put
designers/customizers at ~3% of 10M monthly users — a narrow slice with large absolute numbers,
and the exact population the market leader built an in-browser OpenSCAD runtime (~310K users)
to serve inside its wall. P1's environment: Windows, mid-range GPU or none, patience for one
setup download if progress is visible, zero patience for silent failure.

**P2 — The technical maker / IT reader.** Comfortable with OpenSCAD/Python/Klipper; reads
`STATUS.md` before trusting a claim; wants editable source, checksums, no cloud coupling; will
file sharp issues. P2 is who the evidence culture is written for, and the likely first
contributor pool.

**P3 — The small print-shop / farm operator** (emerging, not yet served). Runs 5–50 printers
behind Moonraker/PrusaLink/SimplyPrint; cares about clean job metadata, repeatability, and
never babysitting. Served indirectly today (open-protocol connectors); first-class support is
v2.0 scope.

## 2. Product principles (the "why" behind acceptance clauses)

1. **Fail closed.** A refused send is correct behavior. Staleness (changed source, params,
   printer, material, orientation) invalidates manufacturing state server-side.
2. **Evidence over magic.** Show the parsed intent, the assumptions, the measured numbers, the
   tool provenance. If a feature is advisory (VCL), it says so where the user is looking.
3. **Deterministic before stochastic.** Prefer template families + parameter sliders over
   re-prompting; a slider is reproducible, a re-roll is not.
4. **Local-first.** No account, no telemetry, no network egress without an explicit user key.
5. **Honest states.** Verified ≠ implemented ≠ planned; simulated-tested ≠ field-verified.

## 3. The user journey (what must work, end to end)

First run: install (SmartScreen walkthrough with illustrations) → app opens to Welcome →
local-AI status is probed and shown honestly → if absent, one click sets it up with live byte
progress; if the engine errors, recovery guidance matches the audience (never developer
commands in the installed app) → the Build box, example chips, and import paths are gated until
ready. Core loop: prompt → Intent panel shows the plan/assumptions/dimensions → Studio renders
the part → Properties panel shows measurements → user tweaks via Customizer sliders (no
re-prompt) or edits source directly (manual edits force re-gating) → "Make it real": pick
printer/material from the proven catalog, orient, gate runs, slice, then download or send →
outcome recorded in the iteration log. Recovery loop: save/reopen/rename/duplicate/branch;
restore requires a fresh engine pass before manufacturing.

## 4. Requirements

### R1 — Prompt-to-part core (P1, P2)

**R1.1 — Prompt produces editable, explained CAD.** A plain-English prompt yields OpenSCAD
source plus a parsed intent (plan, assumptions, target dimensions, feature list) surfaced in the
Intent panel. *Rationale:* the trust mechanism — the user checks what the model *thought* before
trusting what it drew. *Acceptance:* Playwright e2e drives prompt→workspace against the demo
engine; the release walkthrough does it against the real engine in the installed app and
verifies the rendered part's dimensions match the prompt (v1.4.0 evidence: 30 mm cube prompt →
"Dimensions match: 30.0 × 30.0 × 30.0 mm"). **Status: Verified.**

**R1.2 — Deterministic lane first.** Generation prefers template families (~87 in
`packages/engine/src/kimcad/templates.py`) whose parameters become Customizer sliders;
re-render on slider change is deterministic. *Acceptance:* engine tests cover family rendering,
bbox contracts, and re-render determinism; e2e drags a slider and asserts a fresh mesh.
**Status: Verified.**

**R1.3 — Measured properties.** The Properties panel reports volume, surface area, mass
estimate (solid, labeled as pre-infill), center of mass, bed contact, bounding box — from the
rendered mesh, not from the plan. *Acceptance:* engine `validate_mesh`/report tests + UI panel
tests assert values and honest fallbacks ("Not measured") when absent. **Status: Verified.**

**R1.4 — STEP export via trusted twins.** Families with a CadQuery twin offer STEP; when no
interpreter is available the UI offers Settings instead of failing. *Acceptance:* engine tests
cover twin rendering + the offer/absence branches; UI test covers the settings-offer branch.
**Status: Implemented** (real CadQuery execution is env-dependent; runs on the release box).

**R1.5 — Library-backed primitives.** Prompting steers generated code toward vendored BOSL2
(BSD-2) for threads/gears/snap-fits instead of hand-rolled CSG. *Rationale:* shrink the
hallucination surface for exactly the features that must mate with hardware. *Acceptance:* on
the standard prompt set, generated code references library modules for those features; failure
class measured before/after. **Status: Planned (v1.6).**

**R1.6 — Customizer-comment compatibility.** Generated SCAD carries OpenSCAD customizer
annotations so any stock OpenSCAD (and MakerWorld-class runtimes) shows the same sliders.
*Rationale:* groundwork for publish-anywhere parametric models — the open answer to the walled
Parametric Model Maker. *Acceptance:* generated file opened in stock OpenSCAD shows the
parameter UI; round-trip test in gate. **Status: Planned (v1.6).**

### R2 — Manufacturing truth (P1, P2, P3)

**R2.1 — Fail-closed gate, server-side.** Stale source/slice/printer/material/orientation
blocks download and send in the engine, regardless of UI state. *Acceptance:* engine tests
drive each staleness path over HTTP (e.g., re-render invalidates cached slice; gate-failed part
refuses send even with override flags); e2e proves stale manual edits are refused before
slicing. **Status: Verified.**

**R2.2 — Slice truth.** "Ready to print" appears only after a current successful OrcaSlicer
run; the G-code proof (motion lines, layer count, time estimate, filament) is parsed and
surfaced. *Acceptance:* live per-vendor slice tests (10 representative printers) assert real
toolpaths with estimates; e2e asserts the state transitions. **Status: Verified.**

**R2.3 — Catalog integrity.** Every catalog printer is slice-proven; the proof-of-record
(`printer_catalog.verified.json`) stores a content hash of the catalog, and a tripwire test
fails if the catalog changes without re-verification **or if a proven printer is ever
GUI-blocked** (this exact drift shipped pre-v1.4.0 and was caught at the gate). *Acceptance:*
`tests/test_printer_catalog.py` hash + block-list tripwires. **Status: Verified.**

**R2.4 — Advisory features are visibly advisory.** VCL findings and inspection cards carry
advisory labeling at the point of use, not only in docs. *Acceptance:* UI audit checklist item
in the gate walkthrough; explicit copy review. **Status: Implemented** — in-UI labeling audit is
Roadmap v1.5-4's sibling; verify wording during the next walkthrough.

**R2.5 — Severity-graded printability.** Replace binary warn/pass with graded findings
(overhang severity classes, thin-wall grades), MIT prior art (SupportSage) as reference.
**Status: Planned (v2.0).**

**R2.6 — Material limits surfaced.** When a part reads as heat-adjacent or load-bearing, the
Properties panel flags material thermal/mechanical limits (canonical case: the 2025 aircraft
induction-elbow failure — printed ABS softened far below engine-bay temperature). **Status:
Planned (v2.0).**

### R3 — Reverse import (P1, P2)

**R3.1 — Conservative matching across all candidates.** An uploaded STL/3MF/OBJ is measured and
matched against template families by envelope, then **every** envelope-tied candidate is rebuilt
and checked by volume/surface signature until one agrees; no match → honest rejection with
reasons and the tried-candidate count. *Rationale:* v1.4.0's gate found the matcher trying only
the first-registered candidate — a solid cylinder (the dowel-pin family's own shape) was
rejected because a hollow box registered first. *Acceptance:* pure-function tie tests + an HTTP
regression that imports a real cylinder through the real renderer to the dowel_pin family;
reject branches (no-signature sphere, unmatched envelope, oversize 413, unknown suffix 400) all
tested. **Status: Verified.**

**R3.2 — Rejections clean up.** Failed imports remove server-side artifacts and leak nothing
into the design registry. *Acceptance:* tests assert no output dirs after each reject path.
**Status: Verified.**

**R3.3 — Pre-repair for malformed meshes.** ADMesh (GPL-2.0, exact license match) pass before
validation for common STL damage. **Status: Planned (v1.6).**

### R4 — Send & printer ecosystem (P1, P3)

**R4.1 — Open-protocol connectors.** Six real connectors (`octoprint`, `moonraker`,
`prusalink`, `duet`, `marlin`, `bambu`) plus the built-in `mock`; each contract-tested against
protocol mocks; send provenance (simulated vs real) is stored and shown. *Acceptance:* engine
connector suites + e2e mock send/outcome. **Status: Verified (mock level).**

**R4.2 — Honesty labels until field-verified.** Connector UI states "simulated-tested only"
per family until a real machine send is field-verified; first real send asks for explicit
confirmation. *Rationale:* a green mock suite proves the JSON seam, not that a machine does the
safe thing — the external audit's sharpest point. *Acceptance:* label visible in walkthrough;
Jest locks the states; lifting a label requires a committed field log. **Status: Planned
(v1.5).**

**R4.3 — Printer wave 1 (open machines first).** Add: Snapmaker U1 (vendor open-sourced
Klipper/Moonraker forks; official Orca profiles), Prusa CORE One / CORE One L / MK4S
(PrusaLink REST — the cleanest documented API surveyed), Qidi Plus 4 / Q2 (real Moonraker,
official profiles), FLSUN S1/T1 (vendor-open Klipper deltas; absent from the catalog today).
*Acceptance:* catalog `--verify` re-run committed per machine; slice proof; connector smoke.
**Status: Planned (v1.6).**

**R4.4 — Bambu current-generation, Developer-Mode only.** H2D/H2S/X2D via user-enabled
Developer Mode LAN MQTT/FTP per the openly documented protocol; the tradeoff (permanent loss of
vendor-cloud features on that printer) stated in-product; X1C marked EOL in the catalog. No
material derived from vendor binaries. *Acceptance:* protocol-doc citations in the connector;
mock contract tests; honesty label per R4.2. **Status: Planned (v1.6).**

**R4.5 — Catalog hygiene per wave.** EOL annotations; `build_printer_catalog.py --verify`
re-run whenever the catalog or profiles change (the proof-of-record tripwire enforces this).
**Status: Verified** (tripwire) / ongoing practice.

**R4.6 — Farm-friendly job metadata.** Jobs carry part name, plate/copy count, material so
farm managers can queue them sanely. **Status: Planned (v2.0).**

**R4.7 — In-print feedback loop (optional).** Obico/OctoPrint webhook ingestion so failures on
a TinkerQuarry-sliced job land in the iteration log. REST integration only — no AGPL code
linkage. **Status: Planned (v2.0).**

### R5 — Local AI (P1, P2)

**R5.1 — Local-first, provably.** No account, no telemetry code in the binaries, no egress
without a user-configured key. *Acceptance:* v1.4.0 removed the analytics/crash-reporting
integrations outright (CHANGELOG documents it); the engine binds loopback; e2e runs offline
from any cloud. **Status: Verified.**

**R5.2 — One-click local-AI setup with real progress.** With no runtime installed, "Set up
local AI" fetches a portable runtime + models showing live byte progress ("AI engine: 190 of
1462 MB"); with a stopped system runtime, the engine adopts/starts it; engine errors show
audience-appropriate recovery (restart guidance in the installed app; source-checkout steps
only in dev). *Acceptance:* WelcomeScreen tests drive the real nested progress-snapshot shape
end to end; the release walkthrough proved live byte progress on the installed build (v1.4.0
artifacts: `walkthrough-rewalk-fixed.json`). **Status: Verified.**

**R5.3 — Model refresh discipline.** Default chat model and VCL vision models are re-baked
against current small open-weights models each cycle using the benchmark harness; licenses must
be redistribution-clean (Apache-2.0/MIT; avoid non-OSI custom terms). Current defaults:
qwen2.5:7b chat, qwen2.5vl:3b vision; candidates: Qwen3-Coder class (Apache-2.0), Moondream2
(Apache-2.0, <4 GB VRAM floor). *Acceptance:* bake-off results committed; default flipped only
on measured wins. **Status: Planned (v1.5).**

**R5.4 — Cloud quick start.** The existing BYOK cloud path (OpenRouter-compatible) is offered
at Welcome as the "start now, download later" option. **Status: Planned (v1.6)** (backend
exists — `cloud_enabled`/key/model settings are live; the requirement is the first-run surfacing).

**R5.5 — Lazy vision-model pull.** The vision model downloads on first VCL use, not during
initial setup. **Status: Planned (v1.6).**

### R6 — Distribution, trust & compliance (P2)

**R6.1 — Checksummed, pinned releases.** Every release ships the installer + `SHA256SUMS.txt` +
`release-manifest.json` (product/engine versions, tag, exact source commit, unsigned_build
flag, artifact hashes). Docs never quote a second copy of an artifact hash (a stale hash in the
manual was a v1.4.0 visitor-audit blocker — the manual now points at the release page as the
single source). *Acceptance:* release checklist + visitor audit re-check. **Status: Verified.**

**R6.2 — License-clean bundle.** The installer's Python environment contains no packages
incompatible with GPL-2.0-only distribution. At v1.4.0 exactly three Apache-2.0 packages remain
(`openai`, `distro`, `manifold3d` — full scan 2026-07-09). Fix: engine's cloud calls go direct
over bundled `httpx` (BSD-3); `manifold3d` runs in a worker process mirroring the CadQuery
isolation pattern; a gate job scans and fails on reintroduction. *Acceptance:* scan job green;
staged dist-info sweep shows zero incompatible licenses. **Status: Planned (v1.5) — the top
compliance item.**

**R6.3 — Signed installer.** SignPath Foundation (requires CI-built artifacts — see policy
doc). **Status: Planned (v2.0).**

**R6.4 — Linux build.** Engine is Python; shell is Tauri; the work is toolchain + packaging +
walkthrough parity. *Rationale:* the local-first audience skews Linux. **Status: Planned
(v2.0).**

**R6.5 — 3MF-first.** 3MF (ISO/IEC 25422:2025) is the default export/handoff everywhere; STL
is the legacy fallback. **Status: Planned (v1.6)** (the slice path already produces 3MF; the
requirement is defaults + copy).

**R6.6 — Continuous evidence.** Per-commit CI runs the full tool-independent engine lane +
full Jest (not just the current focused smoke); a nightly N=5 run publishes a flakiness table;
`check_diff_coverage.py` output is published. *Rationale:* today the 1,755-test story runs at
release time; regressions between releases surface late. **Status: Planned (v1.5).**

### R7 — Multi-material (P1) — design phase

**R7.1 — Per-body material/color.** Generated models support per-body material/color
assignment mapped through slicing to AMS/CFS/toolchanger metadata. *Rationale:* 2025-26
mainstreamed multi-material (AMS 2 Pro, CFS, toolchanger wave: Snapmaker U1, Prusa/Bondtech
INDX); mapping must be produced at slice time — imported-gcode remapping is not supported by
vendor LAN modes. *Acceptance (design phase):* design doc + one end-to-end spike on a
multi-material target. **Status: Planned (v2.0; design starts v1.6).**

## 5. Non-goals

See [Charter §5](PROJECT-CHARTER.md) — the table there is normative. PRs implementing non-goals
are declined regardless of quality.

## 6. Requirement change control

- New requirement: PR adding it here with rationale + acceptance + status, linked from the
  roadmap item that funds it.
- Status change to Verified: same PR as the check.
- Removing/weakening a `Verified` requirement: owner sign-off, and the release notes must say
  so (users may rely on it).
