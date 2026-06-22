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

## Status
Everything *around* this decision is de-risked and proven (seam, engine, source API, glue + tests).
The next build is the **B core**, verified live. The **A refine layer** and the cloud-optional visual
loop (needs a key) follow. Recorded here so the architecture is grounded + reviewable, per builder≠auditor.
