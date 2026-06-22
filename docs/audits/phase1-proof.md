# Phase 1 — fail-fast Studio-boot spike — RESULT: ✅ PASS

**Date:** 2026-06-22 · **Plan:** [TinkerQuarry-Recovery-Plan-v2.md](../TinkerQuarry-Recovery-Plan-v2.md) Phase 1
**Bar:** *prove OpenSCAD Studio can boot inside `tinkerquarry` and call the real engine's `/api/health`* —
not "finish absorption," just the fail-fast gate.

## What was done

1. **Forked OpenSCAD Studio into `tinkerquarry`** (per D2): copied `apps/{ui,web,docs}` + `packages/shared`
   + the root pnpm config (`package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`) from `openscad-studio`
   (source only — node_modules/.git/target excluded). `pnpm install` clean (10 s, warm store).
2. **Wired it to the real engine** (no CORS): added a vite proxy `'/api' → http://127.0.0.1:8765` in
   `apps/ui/vite.config.ts`, and a minimal boot-proof health ping in `apps/ui/src/main.tsx`.
3. **Booted it** (`pnpm --dir apps/ui dev`, vite on :1420) against a live `kimcad web` engine on :8765.

## Evidence (PASS criteria)

- **Studio's app runs inside `tinkerquarry` and renders its real shell** — not a blank/error screen.
  Snapshot shows the live app: **Preview (3D) · Customizer · Editor · AI · Console** tabs, File/Edit/
  Export/Settings menus, a rendered 3D cube with nav-cube + dimension labels, and the viewer controls
  **Fit-to-View · Orthographic · Wireframe · Shadows · Annotate** (orbit/pan/zoom + M/B/S/A inspection
  tools). *These are exactly the editor / customizer / rich-viewer surfaces the audit found MISSING from
  KimCad's reskinned SPA.*
- **The app calls the REAL engine** — console:
  `[TinkerQuarry] engine /api/health OK: {"version":"0.9.3","openscad":true,"orcaslicer":true,"cadquery":false,"external_binaries":["openscad","orcaslicer"]}`
- Studio's own subsystems mounted live: `[useAiAgent] Loaded model … Provider: anthropic`,
  `[AiPromptPanel] Messages updated`, `[Preview] Render: Object`, vite HMR connected.
- Screenshot saved alongside this run (preview).

## Verdict
The Phase 1 fail-fast gate **passes**: the Studio absorption is real on this machine — the front-end
base boots inside `tinkerquarry` and reaches the real engine. **Cleared to proceed to Phase 2** (fork
the KimCad engine into `packages/engine`, prove the SCAD sandbox, real design→gate→slice from the
canonical repo). Still pending and explicitly out of Phase 1 scope: TinkerQuarry reskin (Phase 3),
session-token on POSTs + full sandbox proof (Phase 2), telemetry strip (analytics/sentry/posthog present
in the fork — Phase 2/3), dropping share-links/web-app (Phase 3).
