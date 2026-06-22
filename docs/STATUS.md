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
> (the signature feature; per the vision spike it ships **cloud-optional**, needs a key), the AI **refine**
> panel routed to the engine, the code drawer, bundled libraries, and the full Make-it-real rail. Recovery
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
| **Right panel = Customize / Make it real** (design) | **working (slice action)** | **Customize** is its own right column (Phase 3). **Make it real** is wired + verified: a toolbar button slices the current engine design → **real printable G-code + estimate** ("Ready to print / ~11m 1s, 100 layers, 3.12 cm³ filament · Bambu Lab P2S", live toast; 18,335 G-code lines). Pending: the full right-rail layout (orient override, send-to-printer surfaced inline). |
| Real prompt → printable design — from the canonical repo | **verified** | **Phase 2 PASS:** `packages/engine` does design→gate→slice (31k-line G-code) + 38 sandbox tests pass, from `tinkerquarry`. [audits/phase2-proof.md](audits/phase2-proof.md). |

## P1 — required for v1

| Area (PRD ref) | Status | Notes |
|---|---|---|
| AI tool-using agent + Explain mode + diff/undo (§6.3) | **missing/partial** | "Refine" is single-shot, not an agent loop; no Explain mode. |
| Customizer for LLM-codegen parts + clamped-value surfacing (§6.6) | **partial** | Template parts only; engine returns clamps, client drops them. |
| Manual orient override (§6.8) | **missing** | Auto-orient only. |
| Slice profiles shown in plain language before slicing (§6.9) | **partial** | No pre-slice profile line / layer height. |
| First-real-send caution state (§6.10) | **missing** | Confirm dialog identical 1st vs 100th print. |
| "Ready to print" only after a successful slice (§6.7/§6.9) | **needs-fix** | Verdict shows "Ready to print" at gate-pass, before the slice proof. |
| Seven bundled OpenSCAD libraries (BOSL2…) (§6.11) | **missing** | Not vendored. |
| External-library admission (§6.11) | **missing** | Dead registry, no sandbox admission, no UI. |
| Export `.scad` / `.png` / `.svg` / `.dxf` (§6.13) | **missing** | Only STL/STEP/3MF. (CadQuery now installed → STEP testable.) |
| Version history / restore / iteration log (§6.12) | **partial/missing** | In-session only; no persisted history or iteration log. |
| Settings: Appearance, Privacy, **About/Licenses w/ source links** (§6.14) | **implemented** | Appearance + Privacy are Studio's. **About/Licenses added (2026-06-22):** GPL-2.0 source-availability statement + per-component licenses (TinkerQuarry/engine/Studio GPL-2.0, OpenSCAD GPL-2.0, OrcaSlicer AGPL-3.0, Ollama MIT) with source links — **closes the GPL compliance gap**. Verified in the preview; typecheck clean. |
| Offline banner + crash/recovery error boundary (§9) | **missing** | — |
| Accessibility (keyboard/focus/contrast/SR) (§10/§12) | **unverified** | No a11y tests. |

## Genuinely strong (keep — verified real)

| Area | Status |
|---|---|
| KimCad manufacturing engine (gate, auto-orient, real-G-code slice proof, 6 connectors, fail-closed safety) | **verified** |
| Onboarding / managed model download (disk check, per-model progress, retry, done) | **implemented** |
| Security & privacy (per-boot session token, SCAD sandbox + worker, keyring masked secrets, **zero telemetry**) | **verified** |
| Part-family browser + honesty tiers; clarify-once; stale-session reload | **implemented** |
| Photo/sketch on-ramp (local vision seeding — `qwen2.5vl:3b` installed, seeding-only, NOT a visual loop) | **implemented** |
| Tests: engine **1,590+ pass / 0 fail** (full prior run; +new `/api/source` test, webapp/security subsets green this session), **front end 592/592 green this session** (incl. new `engineDesign` 3/3 + `layoutStore` 3/3; 1 pre-existing upstream suite-collection quirk, not ours) | **verified** |

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
