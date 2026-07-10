# TinkerQuarry — Product Requirements Document

**Version:** 1.0 · **Date:** 2026-07-09 · **Baseline product:** v1.4.0 (engine 0.9.4)
**Reading rule:** requirements are stated so a release gate can check them. "Verified" means an
automated check exists and runs in the gate today; "Implemented" means the feature exists with
partial or manual evidence; "Planned (vX.Y)" targets the [roadmap](ROADMAP.md).

## Personas

- **P1 — The functional-parts tinkerer** (primary). Owns a modern printer; needs brackets,
  mounts, jigs, threaded parts with real dimensions. May never have opened CAD. Judges tools by
  "did the part fit." MakerWorld's data sizes this segment at roughly 3% of 10M MAU — small
  share, absolute numbers large, and it is the segment Bambu built an in-browser OpenSCAD
  runtime (310K users) to court.
- **P2 — The technical maker / IT reader.** Comfortable with OpenSCAD/Python/Klipper; wants
  editable source, verifiable checksums, no cloud coupling, and honest docs. The persona our
  STATUS/evidence culture is written for.
- **P3 — The small print-shop / farm operator** (emerging). Submits jobs to several machines via
  Moonraker/PrusaLink; needs clean job metadata and repeatability more than chat.

## Requirements

### R1 — Prompt-to-part core (P1, P2)

| ID | Requirement | Status |
|---|---|---|
| R1.1 | Plain-English prompt produces an editable OpenSCAD part with parsed intent (plan, assumptions, dimensions, features) surfaced in the UI | Verified (gate e2e + installed-app walkthrough) |
| R1.2 | Generated parts prefer deterministic template families (~87) with customizer sliders over stochastic regeneration | Verified |
| R1.3 | Properties panel reports measured volume, surface area, mass estimate, center of mass, bed contact, bounding box | Verified |
| R1.4 | STEP export via CadQuery trusted twins where a family supports it | Implemented |
| R1.5 | Prompting steers the LLM toward vendored BOSL2 primitives (threads, gears, snap-fits) to cut hallucination surface | Planned (v1.6) |
| R1.6 | Customizer-comment syntax in generated SCAD (MakerWorld-PMM-compatible), enabling publish-anywhere parametric models | Planned (v1.6) |

### R2 — Manufacturing truth (P1, P2, P3)

| ID | Requirement | Status |
|---|---|---|
| R2.1 | Fail-closed gate: stale source/slice/printer/material/orientation blocks download & send server-side, not just in the UI | Verified |
| R2.2 | Slice via bundled OrcaSlicer with per-printer proven profiles; "Ready to print" only after a current successful slice | Verified |
| R2.3 | Printer catalog entries are slice-proven; a content-hash proof-of-record ties the catalog to its verification run | Verified (tripwire test added at the v1.4.0 gate) |
| R2.4 | Advisory features (Visual Correction Loop, inspection cards) are visibly labeled advisory in the UI, not only in docs | Implemented — labeling audit Planned (v1.5) |
| R2.5 | Severity-graded printability findings (overhang classes, thin-wall grades) rather than binary pass/warn | Planned (v2.0; SupportSage-style, MIT prior art) |
| R2.6 | Material thermal/mechanical limits surfaced when a part reads as heat-adjacent or load-bearing (the 2025 printed-intake aircraft incident is the canonical case) | Planned (v2.0) |

### R3 — Reverse import (P1, P2)

| ID | Requirement | Status |
|---|---|---|
| R3.1 | STL/3MF/OBJ import matches against known families by envelope + volume/surface signature across *all* tied candidates; unmatched or unverifiable meshes are rejected, never silently accepted | Verified (v1.4.0 gate fix QA-1) |
| R3.2 | Rejected imports clean up server state and report the tried-candidate count and reasons | Verified |
| R3.3 | ADMesh (GPL-2.0) pre-repair pass for malformed uploads before validation | Planned (v1.6) |

### R4 — Send & printer ecosystem (P1, P3)

| ID | Requirement | Status |
|---|---|---|
| R4.1 | Connectors: OctoPrint, Moonraker, PrusaLink, Duet, Marlin serial, Bambu — contract-tested against mocks | Verified (mock level) |
| R4.2 | Connector UI states "simulated-tested only" until a family has field-verified send evidence; first real send requires explicit confirmation | Planned (v1.5) — the honesty gap the external audit correctly flagged |
| R4.3 | Wave-1 catalog adds: Snapmaker U1, Prusa CORE One / CORE One L / MK4S, Qidi Plus 4 / Q2, FLSUN S1/T1 (all open Moonraker/PrusaLink machines with official Orca profiles) | Planned (v1.6) |
| R4.4 | Bambu H2-series/X2D support via user-enabled Developer Mode LAN MQTT/FTP only, with the tradeoff documented in-product; no vendor-binary derivation | Planned (v1.6) |
| R4.5 | Catalog hygiene: X1C marked EOL; re-run catalog `--verify` on every wave | Planned (v1.6) |
| R4.6 | Jobs carry farm-friendly metadata (part name, copies, material) | Planned (v2.0) |
| R4.7 | Optional in-print failure feedback (Obico/OctoPrint webhook → iteration log); REST integration only, no AGPL code linkage | Planned (v2.0) |

### R5 — Local AI (P1, P2)

| ID | Requirement | Status |
|---|---|---|
| R5.1 | Local-first: no account, no telemetry, no cloud calls unless a user configures a key | Verified (v1.4.0 removed all telemetry code) |
| R5.2 | One-click local AI setup with live byte progress; engine errors show user-appropriate recovery (never dev commands in the installed app) | Verified (v1.4.0 gate fixes W-1/W-2) |
| R5.3 | Model refresh: bake-off current small code models (Qwen3-Coder family, Apache-2.0) as default chat; Moondream2 (Apache-2.0, <4 GB) as low-VRAM vision floor; avoid Gemma-3's non-OSI terms | Planned (v1.5) |
| R5.4 | Cloud quick-start path (existing OpenRouter support) surfaced at welcome for users who won't download ~7 GB | Planned (v1.6) |
| R5.5 | Lazy vision-model pull — download only when the visual loop is first used | Planned (v1.6) |

### R6 — Distribution, trust & compliance (P2)

| ID | Requirement | Status |
|---|---|---|
| R6.1 | Every release ships SHA256SUMS + commit-pinned manifest; docs never quote a second copy of the hash | Verified (v1.4.0; manual fixed at visitor audit) |
| R6.2 | License cleanliness: remove `openai`+`distro` from the bundle (direct HTTP via already-bundled BSD `httpx`) and worker-process-isolate `manifold3d`, matching the CadQuery isolation pattern; add a license scan to the release gate | Planned (v1.5) — the GPL-2.0-only/Apache-2.0 conflict verified 2026-07-09 |
| R6.3 | Signed Windows installer (SignPath Foundation) | Planned (v2.0, external dependency) |
| R6.4 | Linux build | Planned (v2.0) |
| R6.5 | 3MF as primary export/handoff everywhere (ISO/IEC 25422:2025); STL as legacy fallback | Planned (v1.6) |
| R6.6 | Per-commit CI runs the full tool-independent test lane; nightly N-run flakiness table; diff-coverage published | Planned (v1.5) |

### R7 — Multi-material (P1) — design phase

| ID | Requirement | Status |
|---|---|---|
| R7.1 | Per-body material/color assignment in generated models, mapped through slicing (AMS/CFS/toolchanger aware) — 2026 is "the year of the toolchanger" and this is becoming table stakes | Planned (v2.0, design starts v1.6) |

## Non-goals (restated from the Charter)

Mesh-gen art, metrology claims, slicer forks, farm-queue management, resin, safety-critical
certification.

## Acceptance discipline

A requirement moves to **Verified** only when a gate-runnable check exists that fails if the
behavior regresses, and the release-gate walkthrough can observe it in the installed product.
This document must be updated in the same PR that changes a requirement's status.
