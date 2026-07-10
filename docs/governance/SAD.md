# TinkerQuarry — Software Architecture Document

**Version:** 1.0 · **Date:** 2026-07-09 · **Baseline:** v1.4.0 (engine 0.9.4)
**Scope note:** [ARCHITECTURE.md](../ARCHITECTURE.md) holds the system/sequence/state diagrams and
remains the component-level reference. This document adds what a contributor can't read off the
diagrams: the decision records, the trust and license boundaries, quality attributes, and the
current-vs-target structure.

## 1. System overview (one paragraph)

A Tauri 2 shell (Rust/WebView2) hosts a React/TypeScript Studio UI that speaks loopback HTTP to a
Python 3.13 engine (KimCad). The engine plans a part (local LLM via Ollama, or opt-in cloud),
emits editable OpenSCAD, renders through the bundled OpenSCAD/Manifold binary, validates
printability (own gate + PrintProof3D), slices through the bundled OrcaSlicer, and exposes
download/connector-send — all gated by deterministic state. Product, engine, share-web, and
shared-helpers version independently (1.4.0 / 0.9.4 / 0.6.0 / 0.4.0).

## 2. Architecture decision records (ADRs)

**ADR-1 — AI proposes, deterministic state disposes.** LLM output is never trusted into
manufacturing: rendered geometry is measured, gated, and only a current successful slice enables
send/download — enforced server-side (`webapp.py` registry gate), not just by button state.
*Why:* every 2026 manufacturability benchmark (BenchCAD, MUSE) shows LLM-CAD failure cascades;
the gate converts an open research problem into a product guarantee. *Status:* implemented,
gate-verified each release.

**ADR-2 — Editable code as the artifact.** The product of generation is OpenSCAD source (with
CadQuery twins for STEP), never an opaque mesh. *Why:* dimensioned, diffable, user-owned;
independently converged on by the 2025-26 research line. *Consequence:* capability is bounded by
the template registry (~87 families in `templates.py`) for the deterministic lane — registry
growth is product growth (see PRD R1).

**ADR-3 — Process isolation is the license boundary.** GPL-2.0-only (inherited from the absorbed
OpenSCAD-Studio front-end — upstream `zacharyfmarion/openscad-studio`, stated GPL-2.0, no
or-later grant, verified 2026-07-09). All AGPL-3.0/GPL-3.0/Apache-2.0 components run as separate
processes or network peers: OpenSCAD (GPL-2.0-or-later binary), OrcaSlicer (AGPL-3.0 CLI),
CadQuery (Apache-2.0, separate interpreter per `cadquery_runner.py`), Ollama (MIT, HTTP), printer
firmwares (network peers). **Known deviations to remediate (v1.5):** `manifold3d` (Apache-2.0)
imported in-process in `hardening.py`; `openai`+`distro` (Apache-2.0) in the bundled venv —
replace with direct HTTP over the already-bundled `httpx` (BSD-3) and a manifold worker process.
A release-gate license scan will enforce this boundary mechanically.

**ADR-4 — Loopback security model.** State-changing POSTs require a per-boot session header
(constant-time compare); CORS allowlist restricted to Tauri shell origins; exclusive socket bind
(Windows `SO_REUSEADDR` off) so a second instance fails loudly; body-size caps per route; typed
errors, never tracebacks. Full CSRF machinery deliberately out of scope for a single-user
loopback app — the threat model is documented inline in `webapp.py`.

**ADR-5 — Evidence or it didn't happen.** The release gate (`pnpm test:release`) runs zero-skip
engine tests (`--strict-no-skips`), full UI/web suites, Playwright e2e, native build, and
installed-app smokes; releases publish SHA256SUMS + a commit-pinned manifest; docs distinguish
Verified from Implemented. The first-run state (dependency-absent) is constructed and walked at
release gates — the v1.4.0 gate did so with the local AI runtime absent, not-installed, and
present.

**ADR-6 — Bambu integration posture.** Developer-Mode LAN MQTT/FTP per openly documented
protocol only; no derivation from vendor binaries or GUI-emulating forks (active SFC/AGPL
litigation climate as of May 2026). Connector honesty: mock-verified families are labeled so in
the UI until field-verified (PRD R4.2).

## 3. Component inventory & health (measured 2026-07-09)

| Component | Size | Health | Target |
|---|---|---|---|
| `apps/ui/src/App.tsx` | 5,077 lines; 41 useState / 29 useEffect / 57 useCallback | The god-component; source of this release's UI wiring defects (UX-2, UX-5, W-4) | Extract workflow state machine + effect clusters into the existing store/hook layer (stores are already well-factored and tested); 2-3 mechanical, test-locked PRs |
| `packages/engine/src/kimcad/webapp.py` | 3,227 lines, one request-handler class | Functional; route table already single-sourced | Split handlers along the route-table seams |
| `packages/engine/src/kimcad/templates.py` + `cadquery_templates.py` | ~87 families | The deterministic lane's capability ceiling | Family-authoring guide + validation harness; community contribution path |
| Engine test suite | 74 files, 1,755 cases at last gate, 0 skipped | Strong; env-dependent tests presence-guarded | Move tool-independent lane to per-commit CI (R6.6) |
| Stores/hooks (`apps/ui/src/stores`, `hooks`) | — | Well-factored, tested | Receive the App.tsx extraction |

## 4. Quality attributes

- **Correctness-over-availability:** the gate fails closed; a refused send is correct behavior.
- **Determinism:** template re-renders are deterministic; the flakiness evidence for the gate
  itself (N-run stability) is a v1.5 deliverable (R6.6).
- **Privacy:** no network egress without an explicit user-configured key; verified by the
  telemetry-code removal in v1.4.0 and the loopback-only engine default.
- **Recoverability:** installer + checksums + manifest pin the exact source commit; rollback
  procedure documented per release.
- **Auditability:** release gates leave committed evidence
  (`docs/audits/gate-tinkerquarry-<date>/` with walkthrough JSONs, screenshots, role reports).

## 5. Deployment view

Windows NSIS installer (unsigned; SmartScreen documented; SignPath planned) bundles: UI+shell,
engine venv (license-scanned set, see ADR-3), OpenSCAD 2026.03.16 snapshot (SHA-pinned),
OrcaSlicer (SHA-pinned), PrintProof3D (MIT, SHA-pinned). Local AI runtime (Ollama) is *not*
bundled: first-run one-click setup fetches a portable runtime + models with live progress, or
adopts a system install. The optional share-web surface deploys separately (Cloudflare Pages +
Durable Object rate limiter) and is not part of the desktop trust boundary.

## 6. Target-architecture deltas (mapped to the roadmap)

v1.5: license-clean bundle (ADR-3 remediation) · App.tsx extraction phase 1 · per-commit CI +
flakiness/coverage publishing · connector honesty states. v1.6: connector wave on open-protocol
machines · Bambu Developer-Mode connector · 3MF-first pipeline · customizer-comment SCAD ·
webapp.py split. v2.0: in-webview slice estimation (Kiri:Moto, MIT — runs inside the UI, no AGPL
contact) · severity-graded printability · per-body multi-material generation → AMS/CFS mapping ·
Linux target · signed installers.
