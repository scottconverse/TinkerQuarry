# PRD Audit 1 — AI Assistant & Visual Correction Loop (§6.2, §6.3, §6.3.1, §7.4, §7.5)

Audited 2026-06-21 against the SHIPPING product: KimCad's reskinned SPA
(`KimCadClaude/frontend/src`) + the KimCad engine (`KimCadClaude/src/kimcad`) +
glue (`tinkerquarry/backend`). openscad-studio is NOT shipped; features that exist
only there are MISSING from the product.

| PRD ref | Requirement (short) | Status | Evidence (file:line) | What's missing |
|---|---|---|---|---|
| §6.2 | Prominent describe surface | **PRESENT** | `frontend/src/components/Landing.tsx:119-153` (hero + textarea + "Design it") | — |
| §6.2 | Example-prompt chips (mechanical + artistic) | **PARTIAL** | `frontend/src/components/Landing.tsx:15-19,164-176` | Only 3 examples, all **mechanical/dimensioned** (project box, cable clip, trinket dish), deliberately mapped to template families (`Landing.tsx:10-14`). No artistic/organic example chips. |
| §6.2 | Image input — paste/drag photo or dimensioned sketch, read by LOCAL vision into editable seed, never persisted | **PARTIAL** | `PhotoOnramp.tsx:117-148` (file-pick + **drag/drop** `:156-160`); `api.ts:472-523` (`uploadPhoto`/`uploadSketch`); `llm_provider.py:459-563` (local `/api/chat`, host pinned loopback `:487-491`, `think:false`); seed editable `PhotoOnramp.tsx:256-264`; "isn't saved" `:250-253` | No **paste** (clipboard) path — only file-pick + drag/drop. "Never persisted" is a UI claim; not verified that the server discards bytes (read endpoint not re-read here). Vision = on-ramp seed only. |
| §6.2 | Clarify-once (clarification_needed, at most one question) | **PRESENT** | `ir.py:159-164` (`first_clarification`, "ask at most one question"); `pipeline.py:476-483`; surfaced as a thread turn `App.tsx:387-392`, answered inline `ChatPanel.tsx:249,278-281` | — |
| §6.2 | Part-family library browser entry | **PRESENT** | `Landing.tsx:178-189` ("Browse the part library →" → `LibraryModal`); `api.ts:451-453` (`getTemplates`) | — |
| §6.3 | Local-first model picker (cloud only if opted in) | **PARTIAL** | `api.ts:363-373` (`cloud_enabled`, `has_cloud_key`); settings POST `:528-538`; engine `llm_provider.py:566-651` FallbackProvider; cloud host allow-list `:245-266` | It's a **settings toggle + optional OpenRouter key**, not a model *picker*. No in-flow chooser to select among local models; the chat model id is fixed server-side. |
| §6.3 | Model health (running / present / vision) | **PRESENT** | `api.ts:383-397` (`running`, `model_present`, `vision_model`, `vision_present`); `ModelHealthPill.tsx:30-40`; engine `webapp.py:1655-1738` | — |
| §6.3 | Conversational multi-turn refine ("thinner walls", "add a lid") | **PRESENT** | `App.tsx:448-457` (`handleRefine` threads `buildHistory()`); `ChatPanel.tsx:243-305` (refine input + chips); engine threads history `pipeline.py:445,458-459`, `llm_provider.py:422-424` | Works, but each turn is a fresh single-shot plan→build with prior turns as context — not a persistent agent. |
| §6.3 | Tool-using agent w/ visible-but-legible actions ("drawing it", "looking at it from the back", "fixing the holes") + dev-expandable detail | **MISSING** | Phases are fixed to `planning/generating/rendering/validating` (`pipeline.py:71-72`; `designPhase.ts:6-15`). No tool loop in engine (`llm_provider.py` has only `generate_design_plan`/`generate_openscad`/`describe_*`). No "looking at it" phase, no dev-expandable tool detail anywhere. | The entire tool-using agent loop. The SPA shows a 4-step progress label, not agent actions. No "looking at the back / fixing the holes" because the visual loop doesn't exist (see §6.3.1). |
| §6.3 | Explain mode ("explain this design") | **MISSING** | No `explain` in SPA (`grep` clean) or engine (`grep` clean across `src/kimcad`) | Not built anywhere. |
| §6.3 | Diff-based edits with undo/rollback | **PARTIAL** | Version snapshots + step-back: `App.tsx:489-499` (`handleSwitchVersion`), `VersionRail.tsx`; compare card computes a bbox/score diff `ChatPanel.tsx:18-89` | This is **version stepping + a dimensional compare card**, not diff-based *edits*. No undo/rollback of an edit operation; "diff" = compare two saved versions' sizes, not a structural geometry diff. |
| §6.3.1 | Visual Correction Loop — the signature feature | **MISSING** | No `visual-correction`/`render_views`/`critique`/`multi-view` anywhere in `KimCadClaude` (repo-wide grep: no files). Pipeline ends at gate+readiness (`pipeline.py:534-549, 890-946`). Vision model used ONLY for photo/sketch seeds (`llm_provider.py:459-563`). | **The whole feature.** No post-render multi-view capture, no vision critique of the generated mesh, no rounds. |
| §6.3.1 | Runs on LLM-codegen path only (templates skip) | **MISSING** | Codegen path is `_run_llm_backend` (`pipeline.py:890-946`) — render+gate retry only, no visual step | n/a — loop doesn't exist. |
| §6.3.1 | Request multiple labeled views (front/back/top/sides/iso) after render | **MISSING** | No multi-view render. Viewport renders one interactive mesh client-side (`KCViewport.ts`); engine renders a single STL (`pipeline.py:580-589`) | No labeled-view rendering of the built part for inspection. |
| §6.3.1 | Separate round budget (default 3, configurable) | **MISSING** | Only `max_render_retries=2` for codegen render/gate (`pipeline.py:386,914`) — a render-error/dimension retry, not a visual round | No visual-round budget. |
| §6.3.1 | Best-candidate retention (keep best by gate+critique; rollback on regression) | **MISSING** | Codegen loop returns last successful render (`pipeline.py:944`); no candidate scoring/retention | Not built. |
| §6.3.1 | Convergence/exit (approved / best-after-max / fatal-render-error) | **MISSING** | n/a | Not built. |
| §6.3.1 | 3 modes labeled in UI (full-visual / text-only / off) | **MISSING** | No such control in SPA (Settings/Workspace grep clean) | Not built. |
| §6.3.1 | Log each round's views/findings/edits/verdict into iteration log | **MISSING** | No iteration log; history store records only coarse `PrintRecord` (type/score/gate/material/dim) `pipeline.py:734-753` | Not built. |
| §6.3.1 | User control (accept / force-round / stop) | **MISSING** | Only design-level Cancel exists (`App.tsx:422-424`) | Not built. |
| §6.3.1 | **Acceptance: planted wrong design (hole on wrong face) that passes math MUST be flagged when vision available** | **MISSING (FAILS)** | Gate is purely geometric/mathematical (`run_gate` over `MeshReport` — watertight/bbox/volume/wall, `pipeline.py:933,988`). No vision inspection of the mesh. A hole on the wrong face passing math validation would NOT be flagged. | The acceptance criterion cannot be met — there is no vision-over-mesh path. |
| §7.4 | AI panel: idle | **PRESENT** | `ChatPanel.tsx:158-162` (empty placeholder) | — |
| §7.4 | AI panel: thinking | **PARTIAL** | `ChatPanel.tsx:187-195` (refine spinner); Viewport overlay phases `designPhase.ts:10-15` | "Thinking" = a generic spinner + 4 fixed phases; not the agent-action narration §6.3 specifies. |
| §7.4 | AI panel: rendering | **PRESENT** | `designPhase.ts:13` ("Building the 3D model") | — |
| §7.4 | AI panel: looking-at-the-model | **MISSING** | No such phase (`pipeline.py:71-72`, `designPhase.ts:6`) | The visual-inspection state doesn't exist (no visual loop). |
| §7.4 | AI panel: issue-found-fixing | **PARTIAL** | Codegen *silently* retries on render/dim failure (`pipeline.py:922-942`) but emits only "generating"; no user-visible "issue found, fixing" state | The dimension/render retry is invisible to the user; no labeled fixing state, and nothing for visual issues. |
| §7.4 | AI panel: done | **PRESENT** | `designStatus.ts:99-100` ("Here you go — …") | — |
| §7.4 | AI panel: error | **PRESENT** | `ChatPanel.tsx:171,234-239`; `designStatus.ts:83-86` (render_failed/plan_failed) | — |
| §7.4 | AI panel: model-unavailable | **PRESENT** | `ChatPanel.tsx:218-228` (model-down wall + Try again); `designStatus.ts:75-82`; engine status `pipeline.py:182,202-205` | — |
| §7.4 | AI panel: clarification-needed | **PRESENT** | `designStatus.ts:69-72`; `ChatPanel.tsx:249,278-281` | — |
| §7.5 | Visual Correction view: full-visual | **MISSING** | No visual-correction view in SPA | View doesn't exist. |
| §7.5 | Visual Correction view: text-only | **MISSING** | — | — |
| §7.5 | Visual Correction view: off | **MISSING** | — | — |
| §7.5 | Visual Correction view: gave-up/best-candidate | **MISSING** | — | — |

## Summary (5 lines)

- Tally (26 distinct requirement rows): **PRESENT 11**, **PARTIAL 6**, **MISSING 9**.
- §6.2 (Create/Describe) is largely shipped (describe surface, image-seed on-ramps, clarify-once, library entry); gaps are no artistic example chips and no clipboard-paste image input.
- §6.3 has real multi-turn refine + model health, but the **tool-using agent loop, explain mode, and true diff-based edits with undo/rollback are absent** — refine is single-shot plan→build with history as context, and "diff" is only a version-compare card.
- §6.3.1 — the **signature Visual Correction Loop — does not exist anywhere in KimCadClaude** (engine or SPA): no multi-view capture, no vision critique of the built mesh, no rounds, modes, logging, or best-candidate retention. The vision model is wired only for photo/sketch seeds.
- **Single most important gap:** the §6.3.1 acceptance criterion FAILS — a planted wrong design (hole on the wrong face) that passes the math gate would NOT be flagged, because the pipeline ends at a purely geometric gate (`pipeline.py:933,988`) with no vision-over-mesh inspection. This was the product's headline differentiator and is entirely unbuilt.
