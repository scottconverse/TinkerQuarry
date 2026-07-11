# TinkerQuarry — Project Charter

**Version:** 2.0 · **Date:** 2026-07-09 · **Supersedes:** v1.0 (same day; rewritten at takeover
depth) · **Product at time of writing:** v1.4.0, engine KimCad 0.9.4 · **Owner:** Scott Converse
(@scottconverse)

**Who this is for:** someone — human or AI agent — taking over or joining this project with zero
prior context. Read this first, then [SAD.md](SAD.md) §"Start here" for the hands-on path.

---

## 1. What TinkerQuarry is

TinkerQuarry is a **Windows desktop application that turns a plain-English description of a
functional 3D-printable part into dimensioned, editable CAD, then gates it through real
manufacturing checks before it can be sliced or sent to a printer.**

A user types "a wall hook for a 12 mm dowel with two screw holes." A locally-running language
model drafts a design plan; the engine emits **OpenSCAD source code** (not an opaque mesh);
the bundled OpenSCAD binary renders it; the engine measures the result (dimensions, volume,
surface area, mass estimate, center of mass, bed contact); a printability gate checks it against
the selected printer and material; only after a successful, current slice (via the bundled
OrcaSlicer) can the user download G-code or send the job to a printer over an open protocol.
Every step shows its evidence — the parsed intent, the assumptions the model made, the measured
properties, and the provenance of every tool that touched the part.

The product is **local-first**: no account, no telemetry (none — the v1.4.0 binaries contain no
telemetry code at all), no cloud calls unless the user explicitly configures a cloud model key.

Three names matter:

| Name | What it is |
|---|---|
| **TinkerQuarry** | The product: desktop app + docs + releases. Versioned 1.x. |
| **KimCad** | The Python engine inside it (`packages/engine/`): planning, rendering, gating, slicing, connectors. Versioned 0.9.x, deliberately independent of the product version. |
| **Studio** | The React/TypeScript UI (`apps/ui/`), absorbed from the upstream open-source project `zacharyfmarion/openscad-studio` and re-skinned/extended. This lineage drives the license posture (§6). |

## 2. Why it exists — two theses, both externally validated

**Thesis 1: AI may propose; deterministic state disposes.** Every serious 2026 benchmark of
LLM-generated CAD that checks beyond "looks right" — BenchCAD (17,900 execution-verified CadQuery
programs across 106 industrial part families) and MUSE (manufacturability/assembly rubric) —
finds the same failure cascade: models produce executable code, less often valid geometry, and
rarely engineering-ready parts. TinkerQuarry does not bet on the model being right; it bets on
**measuring the output and refusing to manufacture anything unverified**. The fail-closed gate is
the product's answer to the field's known-unsolved problem, and it is enforced server-side, not
just by disabling buttons.

**Thesis 2: independence from vendor clouds is a live, sharpening need.** In January 2025 the
consumer-printing market leader put print-start behind a proprietary authorization layer; by May
2026 that had escalated to cease-and-desist letters against community tooling and a Software
Freedom Conservancy compliance investigation. Meanwhile the same vendor's cloud runs OpenSCAD
in-browser for ~310,000 users of its "Parametric Model Maker" — proving mainstream demand for
parametric-over-static models, inside a wall. TinkerQuarry is the structural opposite: GPL,
local, any-printer, user-owned source.

Nobody else combines these. Commercial AI-CAD (Zoo/Zookeeper, Autodesk's announced "neural CAD",
Adam) is cloud-hosted and closed; the open-source LLM→OpenSCAD experiments (C3D, TalkCAD, CQAsk)
have no gating, no slicing, no printer catalog. The moat is the **pipeline**, not the LLM trick.

## 3. Goals

- **G1 — Trustworthy prompt-to-part.** A maker gets a dimensioned, editable, print-gated part
  from a plain-English prompt, and every claim shown in the UI is backed by a check that actually
  ran. *In practice:* the intent/properties/provenance panels, the readiness gate, and the rule
  that "Ready to print" appears only after a current successful slice.
- **G2 — Any printer, no lock-in.** A curated, slice-proven printer catalog (29 machines at
  v1.4.0, each backed by a content-hashed verification record) and connectors that speak open
  protocols: OctoPrint, Moonraker/Klipper, PrusaLink, Duet, Marlin serial, Bambu LAN. Adding a
  well-behaved Klipper machine should be config + verification, not code.
- **G3 — Evidence culture as a product feature.** The repo's discipline — the
  Verified/Implemented distinction in [STATUS](../STATUS.md), the zero-skip release gate,
  committed audit artifacts under `docs/audits/`, published checksums with a commit-pinned
  manifest — is part of what users are buying. It must survive maintainer changes; hence this
  governance suite.
- **G4 — Sustainable by one owner plus AI agents.** Every recurring task must be automatable and
  evidence-gated: releases, audits, catalog verification. Process that a solo maintainer cannot
  sustain is treated as a defect. Contributor-friendliness is a goal, not yet a reality (zero
  external contributors as of v1.4.0).

## 4. Success criteria for the public-beta phase (v1.4 → v2.0)

Measurable, checked at each release gate:

1. **First-run reachability:** a brand-new user with no local AI runtime installed reaches the
   core prompt→part flow guided entirely in-product. (Proven for v1.4.0 by installed-app
   walkthroughs with the runtime absent, not-installed, and present — artifacts in
   `docs/audits/gate-tinkerquarry-2026-07-09/`.)
2. **Release honesty:** every tag ships `SHA256SUMS.txt` + `release-manifest.json` pinning the
   exact source commit; the release gate runs with zero skipped tests; releases only on a
   GauntletGate CLEAR TO ADVANCE verdict.
3. **License cleanliness:** the installer bundle contains zero packages incompatible with the
   distribution license (three Apache-2.0 packages remain at v1.4.0 — see §6 — remediation is
   Roadmap v1.5-1; after that, a gate job enforces it).
4. **Hardware truth:** at least three printer families move from "simulated-tested" to
   **field-verified** send, and the UI distinguishes the two states until then.
5. **External signal:** issues/PRs arrive from people we don't know; at least one independent
   party reproduces a release from source and matches the checksums.

## 5. Scope

**In scope:** functional, dimensioned FDM parts (brackets, mounts, hooks, enclosures, jigs,
threaded parts) · prompt→OpenSCAD generation with ~87 deterministic template families ·
CadQuery "trusted twins" for STEP export where families support it · conservative reverse import
of STL/3MF/OBJ into known families · printability gating + slicing via bundled OrcaSlicer · job
submission over open printer protocols · local models by default (Ollama), opt-in BYOK cloud ·
Windows installer now, Linux next · the optional share-web surface (`apps/web`, separate deploy,
outside the desktop trust boundary).

**Out of scope, deliberately, with reasons:**

| Not doing | Why |
|---|---|
| Artistic/organic mesh generation | The mesh-gen wave (TRELLIS, Hunyuan3D, Tripo) owns it; output is undimensioned by design — different product category. We say this in marketing to avoid being lumped in. |
| Metrology-grade inspection | The Visual Correction Loop is an advisory local vision-model pass and is labeled so. Claiming measurement-grade would be false. |
| Re-implementing a slicer | We orchestrate OrcaSlicer as a separate process. Slicing is a solved, actively-maintained problem with an AGPL license wall (§6). |
| Print-farm fleet management | SimplyPrint-class tools own queues/fleets. We emit farm-friendly jobs (Roadmap v2.0) and stop there. |
| Resin/SLA | Different toolchain, different gate physics. FDM focus. |
| Safety-critical certification | The manual says plainly what this tool is not. We surface material limits (Roadmap v2.0) but never certify. |

## 6. Constraints (settled facts a newcomer must not re-litigate casually)

**License: GPL-2.0-only, inherited.** The absorbed Studio front end is licensed GPL-2.0 by its
upstream with no "or later" grant (verified against the upstream repo 2026-07-09: bare GPLv2
LICENSE text, README states v2.0, no per-file notices). A combined work containing it must be
GPL-2.0. Consequences:

- AGPL-3.0/GPL-3.0 components (OrcaSlicer, Klipper stack, OctoPrint) are used **only as separate
  processes or network peers** — never linked/imported. This is an architecture rule
  ([SAD ADR-3](SAD.md)) with one known deviation set being remediated (three Apache-2.0 Python
  packages in the bundle; Roadmap v1.5-1).
- OpenSCAD itself is GPL-2.0-**or-later** (verified in its source headers), so an upstream
  re-grant to "or later" is *consistent with upstream's own stated rationale*; a public request
  is open at `zacharyfmarion/openscad-studio` issue #155. Until/unless granted, the posture is
  GPL-2.0-only. The larger question of independent ownership of the UI layer is an **open
  decision** — see [SAD ADR-7](SAD.md) for the options and the derivation measurement behind
  them. Owner decides; agents do not.

**Bambu ecosystem posture.** Any Bambu integration uses the user-enabled Developer Mode
(LAN-only MQTT/FTP) per the openly documented community protocol (OpenBambuAPI), never material
derived from vendor binaries or cloud-impersonating forks. There is active litigation in this
space (SFC investigation opened May 2026); this rule is about keeping us out of it.

**Resourcing.** One owner + AI agents. The release pipeline (gate → multi-lane audit → publish →
public-surface audit) is designed to run largely unattended with evidence at every step. Long
background work gets a recurring watchdog *in the same turn it starts* — a hung process never
sends a completion notification (learned expensively).

**Distribution.** Windows NSIS installer. Code-signing certificates were acquired 2026-07-10;
wiring signing into the release build is the remaining work item
(see [CODE_SIGNING_POLICY](../../CODE_SIGNING_POLICY.md)).

## 7. Stakeholders & decision rights

| Who | Decides | Does |
|---|---|---|
| **Owner (Scott Converse)** | Tags/releases, licensing posture, roadmap priority, spend, anything irreversible or outward-facing | Final review; field verification on owned printers |
| **AI agents** | Nothing irreversible on their own | Build, test, gate, audit, propose; drive work to "ready"; never self-approve a release; never merge red or bypass checks |
| **Users/contributors** | — | Issues/PRs held to the evidence bar: a change ships with the check that would catch its regression |

## 8. Risk register

| # | Risk | Likelihood | Impact | Trigger to watch | Response |
|---|---|---|---|---|---|
| 1 | Solo-maintainer bus factor | — | High | Any long gap in maintenance | This governance suite + SAD "Start here" exist precisely so a successor can operate; keep them current (they change in the same PR as the behavior they describe) |
| 2 | A funded player ships local/cheap prompt-to-CAD | Medium | High | Autodesk "neural CAD" GA; Zoo pricing/local moves | The moat is gate+catalog+connectors+evidence, not generation; accelerate Roadmap v1.6 reach items |
| 3 | Vendor lockdowns spread beyond Bambu | Medium | Medium | New auth layers on Creality/Elegoo firmware | Keep prioritizing genuinely open machines (Moonraker/PrusaLink first); document tradeoffs per connector |
| 4 | License misstep in a GPL-2.0-only bundle | Low (post-scan) | High | Any new Python/Rust dependency | Gate license-scan job (v1.5-1); the subprocess-isolation rule; THIRD_PARTY_LICENSES updated in the same PR |
| 5 | A print failure gets attributed to our gate | Low | High | Field reports after real-hardware sends | Fail-closed defaults; advisory features labeled in-UI; material thermal limits surfaced (v2.0); the 2025 printed-intake aircraft incident is the canonical cautionary case |
| 6 | Upstream Studio drifts or dies | Medium | Medium | Upstream release cadence | We are a hard fork; we owe it nothing technically, but its fixes are ours to take under the same license — check its changelog each cycle (both directions of that street are healthy) |
| 7 | Print-blocking legislation | Low (pre-2029) | Medium | NY/CA feasibility-study outcomes | Watch item only; our local-first architecture is structurally unaffected today |

## 9. Reading order for a newcomer

1. This charter (you are here) — why and what.
2. [README](../../README.md) + [STATUS](../STATUS.md) — the product's own front door and truth table.
3. [SAD.md](SAD.md) — **start at "§1 Start here"**: environment, build, test, the map of the code.
4. [PRD.md](PRD.md) — what every feature must do and how we know it does.
5. [ROADMAP.md](ROADMAP.md) — what's next and why, with exit proofs.
6. The latest gate report under `docs/audits/` — what "done" looks like here, by example.

## 10. Glossary

| Term | Meaning |
|---|---|
| **Gate / printability gate** | The engine's deterministic checks (dimensions vs plan, watertightness, bodies, printer/material fit) that must pass before slice/send. Fail-closed. |
| **Ready to slice / Ready to print** | Distinct states: readiness checks passed vs a *current* successful slice exists. Any change to source, params, printer, material, or orientation invalidates staleness-sensitive state. |
| **Template family** | One of ~87 parametric part definitions in `templates.py` with declared parameters and an analytic bounding box; the deterministic lane of generation, customization, and reverse import. |
| **Trusted twin** | A CadQuery re-implementation of a template family enabling real STEP export; runs in a separate interpreter. |
| **Reverse import** | Uploading an STL/3MF/OBJ and matching it against template families by envelope + volume/surface signature; unmatched meshes are rejected, never silently accepted. |
| **Evidence panels** | Intent, Properties, Visual Review, Provenance — the UI surfaces that show what the AI assumed and what was measured. |
| **VCL** | Visual Correction Loop: an advisory local vision-model review of rendered views. Labeled advisory; never a gate substitute. |
| **Connector** | A per-protocol job-submission client (`*_connector.py`). "mock" is the built-in simulated connector used by tests and demos. |
| **Zero-skip gate** | The release test run enforces `--strict-no-skips`: a skipped test fails the release (hosted CI smoke lanes may skip env-dependent tests; the release box may not). |
| **GauntletGate** | The release-readiness audit run before tagging: a fast review lane, a first-run installed-app walkthrough, and a five-role deep review, driven to zero findings. Reports live in `docs/audits/`. |
| **Proof-of-record** | `printer_catalog.verified.json`: a content-hash record tying the printer catalog to the last full slice-verification run. |
