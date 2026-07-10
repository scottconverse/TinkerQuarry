# TinkerQuarry — Project Charter

**Version:** 1.0 · **Date:** 2026-07-09 · **Product at time of writing:** v1.4.0 (engine KimCad 0.9.4) · **Owner:** Scott Converse (@scottconverse)

## Why this project exists

Two waves of "AI for 3D" both fail the person who needs a *functional* printed part. Mesh
generators (TRELLIS, Hunyuan3D, Tripo) produce visually convincing geometry with no dimensions,
tolerances, or manufacturability semantics — the industry's own 2026 reporting says so plainly.
LLM code-generation research (Text2CAD → CAD-Recode → STEP-LLM) converged on emitting executable
CAD code, but every 2026 benchmark that checks beyond looks (BenchCAD's 17,900 execution-verified
programs; MUSE's assembly rubric) finds a "failure cascade from executable code to valid geometry
to engineering-ready design."

TinkerQuarry's thesis: **AI may plan and generate; deterministic state decides what can be
manufactured.** A local LLM drafts editable OpenSCAD; real renders, measured properties, and a
fail-closed printability gate decide whether the result may be sliced or sent. The user always
sees the evidence (intent, assumptions, measured properties, provenance) and always owns the
source.

The second thesis is independence. In 2025–26 the consumer-printing market's leading vendor put
print-start behind a proprietary authorization layer, drawing a Software Freedom Conservancy
complaint and cease-and-desist letters against community tooling. TinkerQuarry is the structural
opposite: **no account, no telemetry, no cloud dependency, GPL-licensed, local by default.**

## Goals

1. **G1 — Trustworthy prompt-to-part:** a maker describes a functional part in plain English and
   receives dimensioned, editable, print-gated output — with every claim in the UI backed by a
   check that ran.
2. **G2 — Any printer, no lock-in:** a curated, slice-proven printer catalog and open-protocol
   connectors (Moonraker, PrusaLink, OctoPrint, Duet, Marlin, Bambu-LAN) rather than one vendor's
   cloud.
3. **G3 — Evidence culture as product:** the Verified/Implemented distinction, the zero-skip
   release gate, and published release checksums are user-facing features, not internal hygiene.
4. **G4 — A sustainable open project:** GPL-licensed, documented to top-decile standard,
   maintainable by a solo owner plus AI agents, friendly to future contributors.

## Success criteria for the public-beta phase (v1.4 → v2.0)

- A first-run user with no local AI runtime reaches a real printed-part workflow guided entirely
  in-product (verified by the release gate's first-run walkthrough on every release).
- Release gate remains at zero skipped tests and zero known Blocker/Critical findings at every
  tag; every release ships `SHA256SUMS.txt` + a commit-pinned manifest.
- At least three printer families gain **field-verified** (not mock-verified) send evidence.
- The three bundled Apache-2.0 dependencies are removed/isolated (see Constraints) so the
  distributed work is license-clean under GPL-2.0-only.
- External signal: issues/PRs from users we don't know, and at least one independent review that
  reproduces our claims.

## Scope

**In scope:** functional/dimensioned FDM parts (brackets, mounts, enclosures, jigs, threaded
parts); prompt→OpenSCAD generation with CadQuery "trusted twins" for STEP; reverse import of
STL/3MF/OBJ into known template families; printability gating; slicing via OrcaSlicer; job
submission over open printer protocols; local models by default with opt-in cloud keys; Windows
first, Linux next.

**Out of scope (deliberate):** artistic/organic mesh generation (the mesh-gen wave owns this);
metrology-grade inspection (the Visual Correction Loop is advisory and labeled so); slicer
re-implementation (we orchestrate OrcaSlicer, we don't fork it); print-farm fleet management
(we emit farm-friendly jobs; SimplyPrint-class tools own the queue); resin/SLA; safety-critical
part certification (the manual says plainly what this tool is not).

## Constraints

- **License:** GPL-2.0-only, inherited irrevocably (today) from the absorbed OpenSCAD-Studio
  front-end (`zacharyfmarion/openscad-studio`, stated GPL-2.0 with no or-later grant, verified
  2026-07-09). Consequences: (1) AGPL/GPL-3 code (OrcaSlicer, Klipper stack) may only be invoked
  as separate processes/network peers — the codebase already enforces this pattern; (2) three
  bundled Apache-2.0 Python packages (`openai`, `distro`, `manifold3d`) are compatibility
  defects to remediate (v1.5); (3) a GPL-3.0-or-later future requires an upstream re-grant — a
  tracked, optional ask, not a plan dependency.
- **Bambu ecosystem:** integration only via user-enabled Developer Mode (LAN MQTT/FTP) per the
  openly documented protocol; never via reverse-engineered vendor binaries or GUI-impersonation,
  given active litigation climate (SFC investigation opened May 2026).
- **Resourcing:** one owner + AI agents. Everything must be automatable, evidence-gated, and
  resumable; process weight that a solo maintainer can't sustain is a defect.
- **Distribution:** Windows installer currently unsigned (SmartScreen documented); SignPath
  Foundation onboarding is a tracked follow-up.

## Top risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Solo-maintainer bus factor | — | High | Evidence-gated automation; public docs; this governance suite |
| Autodesk/Zoo ship local or cheap prompt-to-CAD | Medium | High | Move fast in the open window; moat = gate + connectors + catalog, not the LLM trick |
| Bambu-style lockdowns spread to other vendors | Medium | Medium | Prioritize genuinely open machines (Moonraker/PrusaLink first); document tradeoffs |
| License misstep in a GPL-2.0-only bundle | Low (post-audit) | High | License scan in the release gate (v1.5); subprocess-isolation rule |
| A real print failure attributed to our gate | Low | High | Fail-closed defaults; advisory features labeled in-UI; material thermal limits surfaced (roadmap) |

## Stakeholders & decision rights

Owner (Scott Converse): tags, releases, licensing posture, roadmap priority, anything
irreversible. AI agents: build, verify, gate, propose — never self-approve a release. Users and
contributors: issues/PRs under the repo's evidence bar (a change ships with the check that would
catch its regression).
