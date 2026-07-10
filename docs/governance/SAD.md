# TinkerQuarry — Software Architecture Document

**Version:** 2.0 · **Date:** 2026-07-09 · **Supersedes:** v1.0 (same day; rewritten at takeover
depth) · **Baseline:** v1.4.0, engine KimCad 0.9.4
**Companion:** [ARCHITECTURE.md](../ARCHITECTURE.md) holds the system/sequence/state diagrams.
This document is the operating blueprint: how to run it, where everything lives, why it's shaped
this way, and what to watch out for. Written for a maintainer who has never seen the project.

---

## 1. Start here — from clone to green tests

Supported dev platform: **Windows** (the product target). Prereqs: Node 22 + Corepack
(pnpm 10.12.4), Python 3.13, Rust/MSVC build tools (only for native builds).

```powershell
git clone https://github.com/scottconverse/TinkerQuarry.git
cd TinkerQuarry
corepack enable
pnpm install
cd packages\engine
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
# Bundled tools (OpenSCAD/OrcaSlicer/PrintProof3D, SHA-pinned) — needed for real_tool/live tests:
.\.venv\Scripts\python.exe scripts\fetch_tools.py
```

Run the app in dev (two terminals):

```powershell
# 1 — engine (loopback HTTP; --demo serves a deterministic fake AI for UI work)
cd packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765
# 2 — UI
cd apps\ui
pnpm dev        # http://localhost:1420
```

First checks to run (fast → slow):

| Command (repo root) | What it proves | Needs | Time |
|---|---|---|---|
| `pnpm -r lint && pnpm -r type-check` | JS/TS hygiene | node_modules | ~2 min |
| engine: `pytest tests -m "not live and not real_tool and not needs_cadquery and not needs_browser" -q` | the tool-independent engine lane (what hosted CI runs) | venv only | ~3.5 min |
| `pnpm test:unit` / `pnpm test:web:unit` | UI (94 suites/670 tests) and web Jest | node_modules | ~1–2 min |
| engine: `pytest tests -q --strict-no-skips` | the FULL engine suite, zero skips (1,755 at v1.4.0) | fetched tools, Playwright Chromium | ~16 min |
| `pnpm test:gate` | everything above + Rust tests/audit + coverage lanes + share-deploy dry-run + Playwright e2e | all of it | ~35 min |
| `pnpm test:release` | gate + native NSIS build + release-exe smoke + installed-app smoke | + MSVC toolchain | ~1 h |

Test markers (declared in `packages/engine/pyproject.toml`): `live` (invokes real OrcaSlicer),
`real_tool` (needs fetched binaries), `needs_manifold`, `needs_cadquery`, `needs_browser`,
`windows_only`. Env-dependent tests **skip cleanly** off their environment; the release gate
passes `--strict-no-skips` so on the provisioned box nothing may skip (a skip fails the
release). Hosted CI (`.github/workflows/ci.yml`) runs a smoke: focused UI tests + web build +
the engine non-live lane with `-rs` so any skip is visible in the log.

Useful env vars: `TINKERQUARRY_DEV_TOKEN` (session header value in dev),
`TINKERQUARRY_ENGINE_DEMO=1` (demo provider), `TINKERQUARRY_APPDATA_DIR` (redirect app data —
used by smokes/walkthroughs for isolation), `TINKERQUARRY_ENGINE_BIN`/`_ENGINE_PYTHON`
(override engine resolution in the shell), `TINKERQUARRY_TAURI_DEBUG_PORT` (WebView2 CDP for
UI automation; smokes default 9337).

## 2. System context

One desktop process tree, three trust domains:

- **Tauri 2 shell** (Rust, WebView2): window, menus, file dialogs, engine lifecycle
  (`ensure_engine` finds/starts the bundled engine and returns `apiBaseUrl` + session token),
  render/history commands, an MCP-style tool surface for external agent tooling (`mcp.rs`).
- **Studio UI** (React 18 + TypeScript + Vite): everything the user sees. Talks only to the
  engine's loopback HTTP API (dev: Vite proxies `/api` → `127.0.0.1:8765` and injects the dev
  token).
- **KimCad engine** (Python 3.13, stdlib `ThreadingHTTPServer`): planning, geometry, gating,
  slicing, connectors, saved designs. Binds loopback; in the installed app it's spawned by the
  shell from the bundled payload (`resources/engine`, staged from `packages/engine/dist/staging`).

Separate processes the engine shells out to (never linked): **OpenSCAD 2026.03.16** snapshot
(GPL-2.0-or-later; Manifold backend), **OrcaSlicer 2.4.0-alpha** (AGPL-3.0), **PrintProof3D
0.6.2** (MIT), optional **CadQuery** worker interpreter (Apache-2.0), **Ollama** (MIT) at
`127.0.0.1:11434` for local models. All binaries SHA-256-pinned by `scripts/fetch_tools.py` /
`build_installer.py`.

Versioned surfaces: product 1.4.0 · engine 0.9.4 (single-sourced from `pyproject.toml`,
enforced by `tests/test_version_single_source.py` — bump requires `pip install -e . --no-deps`
to refresh metadata) · `apps/web` share surface 0.6.0 · `packages/shared` 0.4.0.

## 3. Component catalog (what lives where, with sizes at v1.4.0)

### Engine — `packages/engine/src/kimcad/`

| Module | Size | Responsibility |
|---|---|---|
| `webapp.py` | 186 KB / 3,227 ln | HTTP layer: routes, session auth, CORS, body caps, design registry (rids, snapshots, caps), slice cache, reverse-import endpoint, saved designs. **Largest debt item.** Route truth: `_GET_ONLY_PATHS` / `_POST_ONLY_PATHS`. |
| `templates.py` + `cadquery_templates.py` | 168 + 105 KB | ~87 template families: params, clamps, analytic bboxes, SCAD emitters; CadQuery twins for STEP. The deterministic lane's capability ceiling. |
| `pipeline.py` | 48 KB | Orchestration: plan → generate → render → measure → gate; retries; `PrintReport`; status taxonomy (`completed/clarification_needed/render_failed/gate_failed/plan_failed`). |
| `llm_provider.py` | 31 KB | Provider abstraction: Ollama local, OpenAI-compatible cloud (BYOK), demo provider. |
| `cli.py` | 29 KB | `kimcad design|web|bench|bakeoff|models|shell`; stable exit codes (0/2/3/4/5/6); friendly error mapping. |
| `visual_loop.py` | 24 KB | Advisory VCL: multi-view captures → local vision model probes → findings; keeps/restores best candidate. |
| `config.py` | 24 KB | Config loading, printer/material catalog objects, binary path resolution (raises typed errors when tools absent). |
| `openscad_runner.py` / `slicer.py` / `cadquery_runner.py` | 20/19/20 KB | Subprocess drivers: render (Manifold backend flag), slice (+G-code proof parsing), CadQuery worker discovery/execution (240 s per-candidate, 300 s total probe deadlines). |
| `model_pull.py` | 19 KB | One-click local-AI setup: ensure runtime (adopt system or fetch portable), pull models; per-row progress snapshots (`{running, models:{row:{status,completed,total,error}}}`). |
| `reverse_import.py`, `validation.py`, `hardening.py`, `printability.py` | small | Family matching (ranked candidates), mesh measurement, manifold hardening (**in-process Apache-2.0 dep — being isolated, ADR-3**), printability checks. |
| `connectors.py` + `{octoprint,moonraker,prusalink,duet,marlin,bambu}_connector.py` | small | Job submission per protocol + the built-in `mock`. |

Engine scripts (`packages/engine/scripts/`): `fetch_tools.py` (SHA-pinned tool fetch),
`build_installer.py` (stages the payload), `build_printer_catalog.py --verify` (all-printer
slice proof → `printer_catalog.verified.json`), `verify_install.py`, `check_diff_coverage.py`,
`check_geometry_backends.py`, `check_binary_advisories.py`, `prepare_release_assets.py`,
`bench_vision.py`, `ollama_watchdog.py`.

### UI — `apps/ui/src/`

| Area | Contents |
|---|---|
| `App.tsx` | **5,077 lines; 41 useState / 29 useEffect / 57 useCallback.** The workflow god-component: engine lifecycle, design state, make-it-real rail wiring, reverse-import flow, dialogs. Decomposition is Roadmap v1.5-5; the v1.4.0 UI defects all lived here. |
| `stores/` | Well-factored, tested: `workspaceStore` (+`workspaceSelectors`/`Factories`/`Types`), `projectStore`, `layoutStore`, `settingsStore`, `apiKeyStore` (BYOK), `renderRequestStore`/`renderArtifactStore`, `shareEntryStore`. New state goes HERE, not App.tsx. |
| `hooks/` | `useOpenScad` (render orchestration), `useAiAgent` (chat/tool loop), `useRenderOrchestrator`, `useModels` (BYOK model lists), `useHistory`, `useMobileLayout`, share hooks. |
| `components/` | `WelcomeScreen` (first-run + local-AI setup UX), `ProductEvidencePanels` (Intent/Properties/Visual/Provenance), `ThreeViewer` (2,038 ln), `SvgViewer`, `Editor` (Monaco), `CustomizerPanel`, `AiPromptPanel`, `ModelSelector`, `panels/PanelComponents` (dockview registry), `settings/*`, `ui/*` primitives. |
| `services/` | `engineClient.ts` (typed API client + session header; model-pull snapshot helpers), `renderService`, `engineDocument`, `desktopMcp`, export services. |
| `platform/` | Tauri-vs-browser capability shim (`getPlatform()`): file dialogs, native menu detection (`hasNativeMenu` gates native-only UX like installed-app error copy). |

### Shell — `apps/ui/src-tauri/src/`

`lib.rs` (bootstrap, launch intent injection), `mcp.rs` (1,439 ln tool surface),
`cmd/engine.rs` (ensure_engine: staged-payload resolution → `resource_dir/engine`,
kimcad_launcher.py, port + session token), `cmd/render.rs` (project-path-safe render workspace),
`history.rs`. Config: `tauri.conf.json` (window 1400×900 min 900×600; bundle resources map
`packages/engine/dist/staging → engine`; NSIS target).

### Everything else

`apps/web` — optional share surface (Cloudflare Pages + KV/R2 + a Durable Object rate limiter;
`pnpm test:web:share-deploy` dry-runs the packaging). `packages/shared` — small TS helpers.
`docs/` — the published site (Jekyll; `_layouts/default.html` wraps every converted page and
renders mermaid client-side; **`theme: null` without that layout ships bare HTML fragments** —
it happened; the layout is the fix). `scripts/` — repo-level release/smoke drivers (see §8).
`frontend/`, `backend/` — historical prototypes, not product (README labeling is Roadmap
v1.5-7).

## 4. Runtime flows (as implemented)

**Prompt → part:** UI `POST /api/design` (session header; ≤1 MiB body; 2 concurrent designs
max, else 429+Retry-After; client `job_id` enables `GET /api/design/progress/<id>` polling) →
pipeline: provider plans (DesignPlan: object_type, dimensions, features, assumptions,
open_questions) → template match or freeform SCAD → OpenSCAD render (Manifold) → `validate_mesh`
measurements → printability gate → optional VCL pass → response carries rid, report, mesh/source
URLs; registry stores mesh path, gate status, snapshot, template state (LRU-capped).

**Customize / re-render:** `POST /api/render/<rid>` re-emits SCAD deterministically from new
values; **invalidates any cached slice for that rid** (staleness rule).

**Reverse import:** `POST /api/reverse-import` (≤64 MiB; single-slot semaphore; filename
sanitized; suffix allowlist) → mesh load + measure → ranked family candidates by envelope →
rebuild-and-signature-check loop (volume ±8%, surface ±18%) → accept first agreement or reject
with reasons/count. Registry entry marked so manufacturing still requires the normal gate.

**Make it real:** `POST /api/orient/<rid>` → `POST /api/slice/<rid>` (printer+material; refuses
gate-failed or GUI-blocked printers server-side; caches by rid+printer+material, LRU 16) →
`GET /api/gcode/<id>` or `POST /api/send/<rid>` (connector; provenance recorded) →
`POST /api/print-outcome/<rid>`.

**Local-AI setup:** Welcome polls `GET /api/model-status` (typed statuses, never 500) → "Set up
local AI" `POST /api/model-pull` → engine ensures a runtime (adopt running system Ollama, else
fetch the portable build with disk-space pre-check) then pulls chat+vision models → UI polls
`/api/model-pull/progress` and renders per-row byte progress. Demo mode refuses model-pull with
a typed 400.

## 5. External interfaces

**HTTP API** (loopback; state-changing POSTs require `X-KimCad-Session`): GET-only —
`/api/health`, `/api/options`, `/api/model-status`, `/api/model-pull/progress`,
`/api/connectors`, `/api/connector-status/<name>`, `/api/designs`, `/api/design/progress/<id>`,
`/api/templates`, `/api/mesh|gcode|source|step/<id>`, `/api/libraries`. POST-only —
`/api/design`, `/api/reverse-import`, `/api/model-pull`, `/api/libraries/admit|remove`,
`/api/render|orient|slice|send|print-outcome|visual-review/<rid>`, `/api/designs/save|import`,
`/api/photo-seed`, `/api/sketch-seed`, `/api/settings`, `/api/connections`. Wrong verb → 405
with truthful `Allow` **and** the JSON error envelope (both directions tested — the GET→POST
direction regressed once and is now pinned).

**CLI:** `kimcad design "prompt" [--slice] [--send <connector>] [--out DIR]` (exit codes:
0 ok, 2 config/usage, 3 clarification, 4 render_failed, 5 gate_failed, 6 plan_failed) ·
`kimcad web [--port N] [--demo] [--out DIR]` · `bench` / `bakeoff` (prompt-set evaluation) ·
`models` · `shell`.

**Storage:** designs default under `Documents\TinkerQuarry\<name>`; app data (engine log,
managed Ollama, settings) under `%LOCALAPPDATA%`/`TINKERQUARRY_APPDATA_DIR`. Saved-design
format: portable `.kimcad`.

## 6. Architecture decision records

Format: Context → Decision → Alternatives → Consequences → Status.

**ADR-1 — AI proposes; deterministic state disposes.** *Context:* LLM CAD output fails
manufacturability benchmarks across the board (BenchCAD, MUSE 2026). *Decision:* server-side
staleness/gate registry; manufacturing endpoints refuse anything unverified; UI state is a
convenience, never the guard. *Alternatives:* trust-the-model with warnings (rejected: the
product IS the guarantee); human-review-only (rejected: doesn't scale to P1). *Consequences:*
every new manufacturing-adjacent endpoint must consult the registry; tests drive refusal paths
over HTTP. *Status:* accepted, enforced, gate-verified.

**ADR-2 — Editable code artifact (OpenSCAD + CadQuery twins).** *Context:* mesh output is
uneditable and undimensioned; parametric code is diffable and user-owned. *Decision:* SCAD as
the product artifact; ~87-family registry for the deterministic lane; CadQuery twins where STEP
matters. *Alternatives:* direct B-Rep generation (immature), mesh+repair (loses intent).
*Consequences:* registry size caps deterministic capability → registry growth is a product
workstream (v2.0-8); LLM freeform output still passes the same gate. *Status:* accepted;
independently validated by the 2025-26 research line converging on the same shape.

**ADR-3 — Process isolation is the license boundary.** *Context:* distribution is GPL-2.0-only
(inherited — see ADR-7); OrcaSlicer is AGPL-3.0, Klipper-stack peers GPL-3.0, CadQuery/Manifold
Apache-2.0; GPLv2-only cannot link any of those. *Decision:* external engines run as separate
processes (mere aggregation) or network peers; the bundle may contain only GPLv2-compatible
packages. *Alternatives:* relicense (blocked today — ADR-7); ship without tools (kills UX).
*Consequences:* subprocess drivers everywhere (`openscad_runner`, `slicer`, `cadquery_runner`);
**known deviations at v1.4.0:** `manifold3d` imported in-process by `hardening.py`, `openai`
(+`distro`) in the bundled venv — all three Apache-2.0. Remediation v1.5-1: direct HTTP via
bundled `httpx` (BSD-3) for cloud calls; a manifold worker process on the CadQuery pattern; a
gate license-scan to prevent regression. *Status:* accepted; deviations tracked, dated,
scheduled.

**ADR-4 — Loopback security model.** *Context:* single-user desktop app exposing a local HTTP
engine. *Decision:* per-boot session token required on state-changing POSTs (constant-time
compare; injected into the served shell; never in URLs); CORS allowlist = Tauri shell origins
only; per-route body caps (1 MiB JSON / 32 MiB design import / 64 MiB reverse import / 12 MiB
photo); bounded concurrency (2 designs, 1 reverse import); exclusive socket bind on Windows
(second instance fails loudly); socket read timeouts; typed JSON errors, no tracebacks.
*Alternatives:* full CSRF/cookie machinery (rejected as disproportionate — documented inline),
no auth (rejected: drive-by localhost POSTs). *Consequences:* any new POST route must join the
token check and the route tables; tests enforce 403/405 behavior. *Status:* accepted.

**ADR-5 — Evidence or it didn't happen.** *Context:* solo maintainer + AI agents; claims rot
fast. *Decision:* zero-skip release gate; Verified/Implemented split in STATUS; committed audit
artifacts (`docs/audits/gate-*/`); checksummed releases with commit-pinned manifests; docs
updated in the same PR as behavior. *Consequences:* release cost is real (~half a day of
machine time); trust is the product. *Status:* accepted; two releases run through it.

**ADR-6 — Bambu integration posture.** *Context:* vendor authorization layer (2025) +
cease-and-desist against community tooling + SFC investigation (May 2026). *Decision:*
Developer-Mode LAN protocol only, from open community documentation; the in-product copy states
the user tradeoff; no derivation from vendor binaries. *Consequences:* no vendor-cloud
features; H2C toolchanger unsupported until stable OrcaSlicer support lands. *Status:* accepted.

**ADR-7 — Licensing posture and UI ownership.** ***Open decision — owner's call.*** *Context:*
the Studio front end is absorbed from `zacharyfmarion/openscad-studio` (GPL-2.0, no or-later
grant; author currently unresponsive by email; public or-later request open as upstream issue
#155 — his own README rationale, matching OpenSCAD, is satisfied by or-later since OpenSCAD's
headers grant "version 2 or any later version"). A derivation measurement (2026-07-09, difflib
line-similarity, LOC-weighted, against upstream HEAD `285da7d`) found **81% of UI LOC and 90%
of shell LOC in files ≥0.60 similarity to upstream; ~1% fully original.** So the UI layer is a
hard fork of a live project, not a divergent descendant. *Options:* **(A)** remain GPL-2.0-only
permanently (fix the three bundle deps and move on — zero further cost; forfeits relicensing
options); **(B)** commission an independent implementation of the UI layer from a functional
specification, built by fresh implementers who have not read the original, with a provenance
ledger (a ~50k-LOC program; only pays if license ownership matters strategically); **(C)** take
A now and fold B into a future product-driven "UI 2.0". *Status:* **open**; posture is
GPL-2.0-only until decided; agents proceed under A's obligations either way.

**ADR-8 — Test taxonomy with strict-no-skips at the gate.** *Context:* env-dependent tests
(tools, browsers, CadQuery) must not fail contributor machines, but skips hide rot at release.
*Decision:* marker taxonomy + presence guards for developer/CI environments; the release gate
runs `--strict-no-skips` where a skip = failure; hosted CI prints skip reasons (`-rs`).
*Consequence:* the provisioned release box must have every tool; conftest hooks are
load-bearing (a duplicated hook name silently disabled one — merged, tripwired). *Status:*
accepted.

## 7. Quality attributes (current measurements)

**Correctness-first:** fail-closed gate (ADR-1). **Determinism:** template re-renders
deterministic by test; gate-run N=5 stability table is v1.5-3. **Privacy:** no telemetry code;
loopback-only engine; egress only via user BYOK. **Performance:** boolean-heavy render 0.41 s
under Manifold (vs 4.08 s CGAL 2021); design route bounded at 2 concurrent; slice cache LRU 16.
**Recoverability:** checksummed releases, rollback plan per release, `.kimcad` portable saves.
**Auditability:** committed gate/visitor-audit artifacts per release. **Accessibility:** axe
scans + keyboard traversal in e2e; evidence panels carry real heading semantics (fixed v1.4.0).

## 8. Release engineering (the runbook that shipped v1.3.1 and v1.4.0)

1. **Branch + goals.** Work on a release branch; PRs merge to `main` only on green required
   checks (never red, never bypass).
2. **Full local gate:** `pnpm test:release` — lint/type-check → Rust tests + `cargo audit`
   (two scoped `plist→quick-xml` ignores documented in STATUS) → UI/web Jest (+ coverage
   lanes) → share-deploy dry-run → engine pytest `--strict-no-skips` → Playwright e2e →
   `scripts/native-release.cmd` (VsDevCmd; builds NSIS; **refreshes `target/release/engine`
   from staging** so the runtime smoke can't test a stale payload) → `test:e2e:tauri`
   (release-exe smoke; resets its isolated profile; kills stray engine processes) →
   `test:e2e:tauri:installed` (installs the real NSIS into a temp dir; drives build→slice→send
   on the mock connector; version derived from `tauri.conf.json`).
3. **GauntletGate** (release-readiness audit): fast review lane + first-run installed-app
   walkthrough with the local-AI runtime absent/not-installed/present (the harness lives in
   `docs/audits/gate-tinkerquarry-2026-07-09/walkthrough-harness.mjs`) + five-role deep review.
   Findings driven to zero; report + artifacts committed.
4. **Tag** at the merge commit (verify `git rev-parse "v<X>^{tree}"` equals the smoked build's
   tree — v1.4.0's matched byte-for-byte). Annotated tag, pushed.
5. **Publish:** `SHA256SUMS.txt` (from the smoked artifact), `release-manifest.json`
   (product/engine/tag/commit/unsigned_build/artifact hashes), release notes from CHANGELOG;
   `gh release create --latest`.
6. **Visitor audit** of every public surface (README/release page/Pages site/manual/changelog/
   discussion seeds), links followed and counted, checksums re-derived from the downloaded
   asset; findings fixed to zero and re-verified against the LIVE deploy.
7. **Rollback plan** named before the tag (owner, trigger, exact commands — see
   `tinkerquarry-v1.4.0-rollback-plan` pattern: release → draft, repoint Latest, note why).

## 9. Operational traps (each cost real time; don't rediscover them)

| Trap | Symptom | Rule |
|---|---|---|
| VS `LaunchDevCmd.bat` | native build "hangs" forever unattended (it opens an interactive prompt) | `native-release.cmd` uses `VsDevCmd.bat`; keep it that way |
| `%ProgramFiles(x86)%` in cmd blocks | `\Microsoft was unexpected at this time` | no parenthesized cmd blocks around expansions; single-line `if` chains |
| PowerShell 5.1 + git messages | quotes silently split args | write the message to a file, `git commit -F` |
| PS 5.1 `-Encoding UTF8` | BOM breaks JSON/CI; reading UTF-8 as ANSI mojibakes em-dashes | `[System.Text.UTF8Encoding]::new($false)` for writes; read with explicit UTF8 |
| Engine process survival | a prior engine gets silently adopted → stale payload/state under test | smokes/walkthroughs kill stray `kimcad_launcher`/`TinkerQuarryAppData` pythons before/after; check for survivors when numbers look impossible |
| Tauri resource dir | `target/release/engine` is NOT refreshed on rebuild | the release script robocopy-mirrors staging after bundling |
| Jekyll `theme: null` | docs pages ship as unstyled fragments; mermaid as raw text | `docs/_layouts/default.html` + config defaults; verify the LIVE page after deploy |
| Long background jobs | a hung process never notifies | pair every launch with a recurring check in the same turn |

## 10. Current debt → target (measured, prioritized)

1. `App.tsx` 5,077 ln → **<3,000** via store/hook extraction (v1.5-5); the stores are ready.
2. Bundle license deviations (3 packages) → zero + gate scan (v1.5-1).
3. Release-time-only full testing → per-commit tool-independent lane + nightly flakiness table
   (v1.5-2/3).
4. `webapp.py` 3,227 ln → handler modules along the route-table seams (v1.6-8).
5. Mock-only hardware evidence → field-verification program with UI honesty labels
   (v1.5-4, v1.6-9).
6. Windows-only, unsigned → Linux build + SignPath (v2.0-7).
