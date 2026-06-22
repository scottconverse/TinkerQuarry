# TinkerQuarry — Status Matrix (canonical)

**As of:** 2026-06-22 · **Source:** the merged PRD audit
([PRD-GAP-REPORT](audits/PRD-GAP-REPORT.md) + `audits/prd-audit-1…5` + the Codex auditor report).
**This file is the single source of truth for "where we really are."** It supersedes every prior
"done"/"CLEAR TO ADVANCE" claim.

> **One-line truth:** TinkerQuarry is **a partial implementation**, not a finished product. There is a
> strong, real **KimCad manufacturing engine** and a convincing **design prototype** — but the product's
> defining front-end (the absorbed OpenSCAD-Studio editor/viewer/customizer and the **Visual Correction
> Loop**) is **not built**, and the shipping UI is KimCad's own SPA reskinned, **not** the supplied
> TinkerQuarry design. Recovery is in progress per
> [TinkerQuarry-Recovery-Plan-v2.md](TinkerQuarry-Recovery-Plan-v2.md).

**Status legend:** `missing` (not built) · `partial` (some of it / engine-only / stub) · `implemented`
(built + wired) · `verified` (built + wired + test/proof). **Tier:** P0 = release-blocking · P1 = v1.

## P0 — release-blocking gaps

| Area (PRD ref) | Status | Notes |
|---|---|---|
| **Visual Correction Loop** (§6.3.1) | **missing** | The signature feature. Not in engine or SPA. PRD acceptance (wrong-face hole flagged) currently **fails**. |
| **OpenSCAD Studio front-end absorbed** (§11, §13) | **in-progress** | **Phase 1 PASS (2026-06-22):** Studio forked into `tinkerquarry/apps/ui`, boots inside the repo and reaches the real engine `/api/health` — its Editor/Customizer/AI/3D-viewer (ortho/wireframe/shadows/pan) now present. Reskin = Phase 3, engine integration = Phase 2. Proof: [audits/phase1-proof.md](audits/phase1-proof.md). |
| **Supplied design interface productized** (design spec) | **in-progress** | **Phase 3:** real app is now the forked Studio (TinkerQuarry-branded, telemetry off, **3-column AI \| preview \| Customize** layout matching the design at desktop width). Pending: the **Make it real** rail (Phase 4 net-new) + full design polish. |
| **"Show me the code" / OpenSCAD editor** (§6.5) | **present (front-end)** | Studio's Monaco editor is in the fork (Editor tab/column) — syntax, diagnostics, edit. Pending: wire user edits to re-enter the **engine** pipeline + expose `.scad` over the engine API (Phase 4/5). |
| **Rich 3D viewer** (§6.4) | **present (front-end)** | The forked Studio viewer brings **preset views, ortho, wireframe, shadows, pan/orbit/zoom, measure, build-plate, offscreen multi-view capture** (the loop's inputs). Pending: feed it from the **engine** render + section-plane/2D-SVG verification (Phase 4). |
| **Right panel = Customize / Make it real** (design) | **partial** | **Customize** is now its own right column (Phase 3). **Make it real** (orient→slice→print rail) is net-new, Phase 4. |
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
| Settings: Appearance, Privacy, **About/Licenses w/ source links** (§6.14) | **missing** | About is a bare "GPL-2.0" string — likely **GPL source-availability compliance gap**. |
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
| Tests: engine **1,590 pass / 0 fail**, frontend **407**, glue **19** | **verified** |

## Proof-bar note

**Mock-API behavior (`backend/mock_api.py`) and the static prototype (`frontend/index.html`) are NOT
product done-proof.** They prove seam shapes and design intent only. Done = real, non-mock behavior in
the canonical app per the recovery plan's Definition of Done.

## Run (today, honest)

- **Engine, real, headless:** from `KimCadClaude/`: `.venv313\Scripts\kimcad.exe design "a 90 mm dish" --slice`
- **Real engine UI (KimCad's SPA, pre-absorption):** from `KimCadClaude/`: `.venv313\Scripts\kimcad.exe web`
- **Offline prototype + mock (design preview only, NOT product):** from `tinkerquarry/`: `python scripts/dev.py`

*(A single canonical `tinkerquarry` run command lands in Phase 1, once the Studio base boots here.)*
