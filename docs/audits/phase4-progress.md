# Phase 4 — wire the front end to the engine — PROGRESS (foundation ✅)

**Date:** 2026-06-22 · **Plan:** [Recovery Plan v2](../TinkerQuarry-Recovery-Plan-v2.md) Phase 4

## Done + proven (foundation)
1. **Typed engine client** — `apps/ui/src/services/engineClient.ts`: the single door from the forked
   Studio front end to the KimCad engine API (design/render/slice/send/outcome + health/model-status/
   options/templates/settings), with session-token handling.
2. **Authenticated dev wiring** — the engine accepts a fixed `TINKERQUARRY_DEV_TOKEN` (env) so the vite
   proxy can inject `X-KimCad-Session` on POSTs (prod keeps the per-boot random token). Proven:
   `POST /api/design` from the page → vite proxy → forked engine is **403 without the token, reaches the
   handler with it**.
3. **Full describe→engine→mesh data path proven** end-to-end through the web API the front end uses:
   `POST /api/design "a 40mm round coaster, 3mm thick"` → **status `completed`, gate `pass`, readiness
   `92`, `mesh_url: /api/mesh/1`** → the mesh fetches as a real **38 KB STL**. (Engine geometry itself
   proven in Phase 2; this proves it over the HTTP path, authenticated, from `tinkerquarry`.)

## Next in Phase 4 (UI-surface wiring — the larger remaining work)
- **AI/describe panel** → call `engineClient.design(prompt)` instead of Studio's cloud AI SDK; render the
  engine's status states (completed / gate_failed / clarification_needed / model_unavailable …).
- **3D viewer** → load the engine's returned `mesh_url` STL (replace Studio's WASM render output).
- **Customizer** → bind to the engine's `params` + `engineClient.render(rid, values)` (live, no model call).
- **Readiness / Make-it-real rail** → the engine's gate report + `slice`/`send` (net-new right rail).
- Remove the "Configure an AI provider" wall (local engine is the default brain; PRD §6.1).
- Note: `/api/design` returns the id via `mesh_url` (`/api/mesh/1`), not a top-level `rid` — engineClient
  will read the id from there / the response; minor shape adaptation when wiring.

## Honest status
The **seam is real and proven** (authenticated front-end ↔ engine, describe→geometry over HTTP). What
remains is rewiring Studio's existing UI surfaces (AI panel, viewer, customizer) onto `engineClient`,
which is the substantial body of Phase 4.
