# TinkerQuarry — Status Matrix (canonical)

**As of:** 2026-06-22 · **Source:** the merged PRD audit
([PRD-GAP-REPORT](audits/PRD-GAP-REPORT.md) + `audits/prd-audit-1…5` + the Codex auditor report).
**This file is the single source of truth for "where we really are."** It supersedes every prior
"done"/"CLEAR TO ADVANCE" claim.

> **One-line truth:** TinkerQuarry's **core flow now works end-to-end** — **describe a part in plain
> English → the local KimCad engine designs it → it renders in Studio's viewer with a readiness verdict →
> "Make it real" slices it to real printable G-code** (all verified live this session, locally, no cloud,
> no provider wall). The engine is forked into `packages/engine`; the **OpenSCAD-Studio front end is
> absorbed** into `tinkerquarry/apps/ui` (branded, telemetry off) — the old "reskinned SPA" gap is
> **closed**. It is **not yet a finished product**: **still to build** — the **Visual Correction Loop**
> (the signature feature; per the vision spike it ships **cloud-optional**, needs a key), the **7 bundled
> libraries** (need a download/security OK), the **manual-orient override**, and the **rich iteration log**.
> **Landed this session (all verified):** the AI **refine** panel (engine-routed, in-context), the
> **Customizer** for template parts + **gate-on-tune live readiness**, **re-render-on-tune** (Make-it-real
> slices the tuned part), and **persisted version history** (Save + My Designs reopen). Recovery
> continues per [TinkerQuarry-Recovery-Plan-v2.md](TinkerQuarry-Recovery-Plan-v2.md).

**Status legend:** `missing` (not built) · `partial` (some of it / engine-only / stub) · `implemented`
(built + wired) · `verified` (built + wired + test/proof). **Tier:** P0 = release-blocking · P1 = v1.

## P0 — release-blocking gaps

| Area (PRD ref) | Status | Notes |
|---|---|---|
| **Visual Correction Loop** (§6.3.1) | **missing (architecture decided)** | The signature feature; not built yet. **Vision spike done (2026-06-22):** local `qwen2.5vl:3b` **fails** spatial critique — 0/3 planted errors caught (it confirms features that aren't there), failing the PRD wrong-face acceptance → **v1 loop must ship cloud-optional** (PRD §14 #1). Proof: [audits/vision-spike.md](audits/vision-spike.md). |
| **OpenSCAD Studio front-end absorbed** (§11, §13) | **working (B core)** | Studio forked into `tinkerquarry/apps/ui` (Phase 1 PASS). **Phase 4 B core wired + verified live:** the **describe surface → local engine → geometry in Studio's viewer**. `describeIntoStudio` runs `/api/design`, pulls the engine's **self-contained** SCAD (`/api/source?inline=1` resolves library `use<>`), sets it as the document, and **auto-renders** it (proven: a 55/70 mm coaster rendered in the viewer, screenshots). The **"Configure an AI provider" wall is removed** (local-first, PRD §6.1). Pending: AI-panel (refine) routing, readiness UI polish, Make-it-real rail. Proof: [audits/phase4-architecture-decision.md](audits/phase4-architecture-decision.md). |
| **Supplied design interface productized** (design spec) | **in-progress** | **Phase 3:** real app is now the forked Studio (TinkerQuarry-branded, telemetry off, **3-column AI \| preview \| Customize** layout matching the design at desktop width). Pending: the **Make it real** rail (Phase 4 net-new) + full design polish. |
| **"Show me the code" / OpenSCAD editor** (§6.5) | **working (view/edit)** | A described part's **engine-generated SCAD is shown in Studio's Monaco editor** (verified live: the 20 mm cube → `width=20.0; … difference(){ cube(...) }`) — readable + editable for self-contained parts (templates show the inlined form). Engine source endpoint `GET /api/source/<rid>` (+`?inline=1`) backs it. Pending: a readable-source/render split for templates, and wiring **edits** back through the engine's re-gate (behind the SCAD sandbox). |
| **Rich 3D viewer** (§6.4) | **present + engine-fed** | The forked Studio viewer brings **preset views, ortho, wireframe, shadows, pan/orbit/zoom, measure, build-plate, offscreen multi-view capture**. **Now fed from the engine:** a described part's engine SCAD renders in this viewer (proven live, both LLM-codegen + template parts). Pending: section-plane/2D-SVG verification inputs (Phase 6 loop). |
| **Right panel = Customize / Make it real** (design) | **working (slice + download)** | **Customize** is its own right column (Phase 3). **Make it real** is wired + verified: a toolbar button (disabled until a design exists) slices the current engine design → **real printable G-code + estimate** ("Ready to print / ~11m 1s, 100 layers, 3.12 cm³ filament · Bambu Lab P2S") **and downloads the printable file** (verified: 52 KB `.gcode.3mf` attachment). The loop closes: plain English → printable file. Pending: the full right-rail layout (orient override, send-to-printer inline). |
| Real prompt → printable design — from the canonical repo | **verified** | **Phase 2 PASS:** `packages/engine` does design→gate→slice (31k-line G-code) + 38 sandbox tests pass, from `tinkerquarry`. [audits/phase2-proof.md](audits/phase2-proof.md). |

## P1 — required for v1

| Area (PRD ref) | Status | Notes |
|---|---|---|
| AI tool-using agent + Explain mode + diff/undo (§6.3) | **refine working (live-verified)** | The workspace AI panel routes to the **local engine as a refine-in-context turn** (`onAiSubmit` → `handleEngineDescribe({refine:true})`; engine `history` carries context). **Verified LIVE:** an 80×60×40 box → refine "make it 80mm tall" → the engine produced a box with **height = 80** (rid 4, gate pass, rendered), using the conversation history. In-progress "Refining…" toast. Still: single-shot (not a multi-tool agent loop), no Explain mode, no diff/undo, no conversation-bubble transcript. |
| Customizer for LLM-codegen + template parts (§6.6) | **working (live-verified)** | The engine emits **Customizer sliders for template parts** (`emit_scad` hoists each param to `name = value; // [min:step:max]`; 584 engine tests; mesh/gate/slice unchanged). **Verified LIVE end-to-end:** described an 80×60×40 box → the Customizer panel rendered Width/Depth/Height (10–170) + Wall (0.8–8) sliders, and **changing Width 80→120 re-rendered the box to 120mm** (screenshots). **Gate-on-tune now done (2026-06-22):** a debounced (700ms) `engine.render(rid, tunedValues)` **re-gates tuned values live** — the Make-it-real button title shows the current readiness verdict as you tune (verified: title reads "Ready to print (92/100) — slice to make it real" after a describe; the re-gate reuses the live-verified `engine.render`), and the engine geometry stays in sync so Make-it-real slices exactly what's shown. |
| Manual orient override (§6.8) | **missing** | Auto-orient only. |
| Slice profiles shown in plain language before slicing (§6.9) | **addressed (printer · material)** | **Pre-slice profile line added + live-verified (2026-06-22):** a visible toolbar line shows the engine's default profile in plain language ("Bambu Lab P2S · PLA", from `/api/options`) right before **Make it real**, so the user knows what the slice produces before committing (screenshot proof; full suite green). Layer-height/nozzle line still pending (not exposed by `/api/options` — it's in the slicer's profile JSON); a printer/material **picker** is the remaining net-new. |
| First-real-send caution state (§6.10) | **missing** | Confirm dialog identical 1st vs 100th print. |
| "Ready to print" only after a successful slice (§6.7/§6.9) | **addressed (UI)** | Design-time toast now reframes the gate verdict as a **pre-slice check** ("Looks printable (92/100) · Make it real to slice"); **"Ready to print" appears only on the Make-it-real slice toast.** The deeper engine `smart_mesh` verdict rename (wide test impact) remains optional. |
| Seven bundled OpenSCAD libraries (BOSL2…) (§6.11) | **missing** | Not vendored. |
| External-library admission (§6.11) | **missing** | Dead registry, no sandbox admission, no UI. |
| Export `.scad` / `.png` / `.svg` / `.dxf` (§6.13) | **missing** | Only STL/STEP/3MF. (CadQuery now installed → STEP testable.) |
| Version history / restore / iteration log (§6.12) | **working (live-verified)** | **Persisted save/restore built + verified (2026-06-22):** engine `POST /api/designs/save` (auto-names from object_type) + `GET /api/designs` (list) + `GET /api/designs/<id>` (reopen) round-trip proven via curl; a **Save** toolbar button (disabled until a design exists) stores the current engine design; the Welcome screen's **"My Designs"** gallery lists saved designs and **reopens** one on click (`reopenIntoStudio` → engine re-renders it into the viewer). Verified at every layer: backend round-trip (curl), `reopenIntoStudio` (orchestration test), client request shapes (engineClient test), Save button live, and the My Designs section + reopen click (WelcomeScreen test). Still: no per-iteration "what was tried" log (the rich Explain transcript). |
| Settings: Appearance, Privacy, **About/Licenses w/ source links** (§6.14) | **implemented** | Appearance + Privacy are Studio's. **About/Licenses added (2026-06-22):** GPL-2.0 source-availability statement + per-component licenses (TinkerQuarry/engine/Studio GPL-2.0, OpenSCAD GPL-2.0, OrcaSlicer AGPL-3.0, Ollama MIT) with source links — **closes the GPL compliance gap**. Verified in the preview; typecheck clean. |
| Offline banner + crash/recovery error boundary (§9) | **implemented (banner live-verified)** | **Crash/recovery** already covered: a top-level `ErrorBoundary` wraps the app (`main.tsx`) + per-panel boundaries, with a branded recovery UI ("TinkerQuarry hit an unexpected error" / Reload). **Offline banner built + live-verified (2026-06-22):** `EngineStatusBanner` polls `/api/health`, shows a fixed alert after **two** consecutive failures (no flapping), clears on recovery. Proven by **actually stopping the engine** (banner appeared) and **restarting it** (banner cleared); + a deterministic unit test. |
| Accessibility (keyboard/focus/contrast/SR) (§10/§12) | **unverified** | No a11y tests. |

## Genuinely strong (keep — verified real)

| Area | Status |
|---|---|
| KimCad manufacturing engine (gate, auto-orient, real-G-code slice proof, 6 connectors, fail-closed safety) | **verified** |
| Onboarding / managed model download (disk check, per-model progress, retry, done) | **implemented** |
| Security & privacy (per-boot session token, SCAD sandbox + worker, keyring masked secrets, **zero telemetry**) | **verified** |
| Part-family browser + honesty tiers; clarify-once; stale-session reload | **implemented** |
| Photo/sketch on-ramp (local vision seeding — `qwen2.5vl:3b` installed, seeding-only, NOT a visual loop) | **implemented** |
| Tests: engine **1559 functional pass** this session (full run, e2e/playwright excluded; + new `/api/source`, `inline_library_includes`, Customizer-`emit_scad` tests; **fixed 2 hygiene fails** — added SECURITY.md + gitignore audit patterns). The **3 remaining fails are fork-policy, not product**: lockfile pins KimCad's numpy 2.2.6 (the fork uses 2.5.0), and two check the engine's **legacy standalone SPA** (`packages/engine/frontend/`), deliberately not forked (Studio is the product front end) — flagged for review, not hidden. **Front end 621/621 — ALL suites green.** | **verified (product); 3 fork-policy fails flagged** |

## Proof-bar note

**Mock-API behavior (`backend/mock_api.py`) and the static prototype (`frontend/index.html`) are NOT
product done-proof.** They prove seam shapes and design intent only. Done = real, non-mock behavior in
the canonical app per the recovery plan's Definition of Done.

## Run (today, honest)

- **The real app (forked Studio + forked engine), dev:**
  1. Engine: from `tinkerquarry/packages/engine/`: `TINKERQUARRY_DEV_TOKEN=tq-dev-token .venv\Scripts\kimcad.exe web --port 8765`
  2. Front end: from `tinkerquarry/apps/ui/`: `pnpm dev` (vite :1420; proxies `/api`→engine with the dev token).
  - The page boots TinkerQuarry-branded, pings `/api/health`, shows the 3-column layout; `describe→/api/design→mesh` and `/api/source` work over the proxy. **Not yet wired:** Studio's surfaces onto the engine (Phase 4 body).
- **Engine, real, headless (canonical repo):** from `tinkerquarry/packages/engine/`: `.venv\Scripts\kimcad.exe design "a 90 mm dish" --slice`
