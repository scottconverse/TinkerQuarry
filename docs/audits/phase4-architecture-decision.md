# Phase 4 body — the architecture fork, and the PRD-grounded decision

**Date:** 2026-06-22 · **Plan:** [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md) Phase 4

## The impedance (why this is a real decision, not a mechanical wiring)
- **Studio's AI panel** is a **streaming chat agent**: cloud providers (`anthropic | openai |
  openai-compatible`), tool-calling, conversation history, proposed diffs. It expects a chat **LLM**.
- **The KimCad engine** is a **design pipeline**, not a chat model: `describe → plan (qwen) → SCAD →
  render → readiness gate → slice`. One shot, structured result (mesh + gate + params), not a token
  stream.

Forcing the engine into Studio's chat-provider slot is a category error. **This fork is exactly the
kind of architecture call whose ungrounded version caused the original failure** (reskinning KimCad's
SPA instead of absorbing Studio). So it must be **grounded in the PRD**, not guessed.

## The options
- **A — Engine as a tool of Studio's chat agent.** Keep the chat loop; the LLM calls engine
  design/render/slice tools. Pro: reuses Studio's refine/diff/explain. Con: still needs a chat LLM to
  drive it (cloud, or local Ollama via `openai-compatible`) → keeps a provider dependency at the core.
- **B — Direct design-action flow.** The describe box submits straight to `/api/design`; the result
  (mesh + readiness) lands in the viewer. The engine's qwen planner **is** the brain. Local-first by
  default, **no provider wall**. Con: the rich conversational refine isn't automatic.
- **C — Hybrid (recommended).** **B for the core** (describe → engine → viewer + readiness, local-first,
  no wall) **+ A as an optional layer** (conversational refine/explain, driven by local Ollama as an
  `openai-compatible` provider when present, or a cloud key if the user adds one).

## Decision — **C**, because the PRD already grounds it
- §6.1 **local-first; no "configure a provider" wall** → the local engine must be the default brain →
  the *core* path cannot depend on a cloud provider → **B is the core** (rules A-as-core out).
- §6.3 **refine / explain** is required → keep the conversational layer → **A on top** (local Ollama).
- §6.3.1 the **Visual Correction Loop** wraps the *design* result (the engine's), reinforcing that the
  geometry-producing path is the engine (B), with critique/refine layered above.

This is **following the spec**, not an ungrounded call — the exact discipline the recovery is about.

## What B (the core, build now) requires — and the one real risk
1. `describe → runEngineDesign(prompt) → engine /api/design` (the seam, already proven).
2. The engine's `mesh_url` into Studio's **viewer** via the workspace render store
   (`beginTabRender → commitTabRenderResult`, mirroring App.tsx:396/458) — and the gate/readiness via
   `engineGateSummary`.
3. Remove the **provider wall** for the core describe (local engine is always available).
4. **Risk to manage:** App.tsx's render path has artifact precedence + blob-url lifecycle
   (`activeRenderArtifact ?? renderTargetRender`, revokeBlobUrl). The engine path must be **additive**
   and **verified live** (describe → engine mesh actually appears in the viewer) so it can't regress
   Studio's existing WASM render. Build it behind that verification, not blind.

## Mechanism VERIFIED LIVE (2026-06-22) — the key de-risking
The decisive uncertain question — *can the engine actually drive Studio's viewer?* — is answered **yes**,
in the running app, and it's even lower-risk than Option B's render-store path:

- The engine produces **valid OpenSCAD** (NL→plan→SCAD). Fed the engine's generated SCAD
  (`GET /api/source/1`, the "50×30×10 mm name tag") into Studio's **own renderer**
  (`__TEST_OPENSCAD__.renderCode`) → **the viewer rendered it**: model version changed, `maxDim` = **50**
  (matches the engine's part), and the screenshot shows the exact part in Studio's 3D viewer.
- **So the seam is the SCAD itself**, not a mesh hand-off: engine = brain (NL→**SCAD**+gate+slice),
  Studio = IDE that **renders + edits** that SCAD through its existing, unchanged pipeline. **No
  render-store surgery, no blob-url lifecycle risk** — the integration rides Studio's proven render path.

**Revised production path for the B core (now low-risk):** describe → `/api/design` → take the engine's
SCAD (`/api/source/<rid>`) → **set Studio's active document content to it** (Studio renders it normally) →
surface the engine's gate/readiness (`engineGateSummary`) + drop the provider wall for the core describe.

## B-core production wiring — BUILT + verified end-to-end (2026-06-22)
`apps/ui/src/services/engineDocument.ts` → `describeIntoStudio(prompt)`: describe → `/api/design` →
pull the engine's SCAD (`/api/source/<rid>`) → set Studio's active document via the documented
`updateFileContent` store action (NO render-store surgery). Returns `{ ok, gate, rid, path }`.
**Verified live in the running app:** `describeIntoStudio('a 60mm hexagonal coaster, 4mm thick')` →
`{ ok:true, gate:"Ready to print (92/100)", rid:2, path:"main.scad" }`, and **Studio's editor now holds
the engine's generated SCAD** (`use <library/dishes.scad>; coaster_with_rim(od=60, h=4, ...)`). Unit
tests: `engineDocument` 4/4, `engineClient` 3/3, `engineDesign` 3/3; typecheck clean.

### Template-library rendering — SOLVED + visually verified (2026-06-22)
The engine's **template** parts emit `use <library/dishes.scad>;`, which Studio's WASM renderer lacks.
Fixed via **self-contained SCAD (option a)**: `openscad_runner.inline_library_includes` resolves
`use/include <library/*.scad>` by inlining the trusted library files (recursive, deduped,
traversal-checked — same sandbox discipline), exposed as `GET /api/source/<rid>?inline=1`;
`describeIntoStudio` fetches the inlined form. **Proven live:** the coaster's source goes 87 B →
**69,966 B self-contained (no `use <library>`, contains `module coaster_with_rim`)**, and feeding it to
Studio's renderer yields **`maxDim=70`** — the **screenshot shows the 70 mm rimmed coaster in Studio's
viewer**. So BOTH LLM-codegen parts (name-tag) AND template parts (coaster) now render through the
engine. Tests: `inline_library_includes` 2/2, source endpoint 3/3, services 7/7.

## Status
De-risked AND partly built: the seam, engine, source API, glue+tests, the live proof the engine's SCAD
renders in Studio's viewer, **and the B-core `describeIntoStudio` wiring verified end-to-end**. Next:
resolve template-library rendering (above), add the shipping UI trigger + readiness display, drop the
provider wall, then the A refine layer + cloud-optional visual loop (needs a key). Per builder≠auditor.
