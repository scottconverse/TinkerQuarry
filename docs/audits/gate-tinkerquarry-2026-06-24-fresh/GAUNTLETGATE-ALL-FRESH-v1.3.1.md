# GauntletGate Report - TinkerQuarry v1.3.1 Fresh Re-Audit

**Date:** 2026-06-24 · **Build/commit:** `4e159c2a189e4b388204baf636acd46ac430a1c0` · **Run by:** Codex  
**Lanes run:** lite, walkthrough, full · **Lanes NOT run:** none  
**How run / environment:** local Windows repo, tagged `v1.3.1`; fresh native packaging/test proof plus installed NSIS smoke with isolated profile.

---

## Verdict

> **DO NOT ADVANCE**

- **First-run:** reaches core feature in the installed/bundled Windows product, but dependency-absent web/dev/broken-engine path dead-ends a new user.
- **First-run coverage:** VALID for installed-product isolated-profile smoke; dependency-absent coverage found a blocker.
- **Consolidated severity roll-up:** Blocker 1 · Critical 1 · Major 19 · Minor 7 · Nit 0
- **One-line why:** the shipped Windows product can install, launch, build, slice, and mock-send, but the fresh audit found one first-run dead-end and one active production dependency critical advisory.

---

## Environment Provisioning - Verified

| What | State used | How VERIFIED |
|---|---|---|
| Profile / app-data isolation | `C:\Users\Scott\AppData\Local\Temp\TQSmokeWorkflowProfileRelease` | `pnpm.cmd test:e2e:tauri:installed` passed and the smoke script verified the isolated profile received engine/app state; artifact lists `engine.log`, generated `part.scad`, `part.3mf`, oriented STL, and sliced `.gcode.3mf`. |
| First-run flags | fresh isolated installed profile | Smoke script launched the installed app with isolated `LOCALAPPDATA`, `APPDATA`, and `TINKERQUARRY_APPDATA_DIR`; no existing user profile was reused. |
| External dependency: bundled engine/toolchain | present in installed app | Installed smoke reported engine health `ok: true`, `version: 0.9.3`, `openscad: true`, `orcaslicer: true`. |
| External dependency: cloud AI / hardware printer | absent / not required for release gate | Core build/slice/send proof used demo/local mode and mock connector. Physical-printer verification is intentionally beta scope, not a pre-release blocker. |
| External dependency: local engine absent | absent in UI/UX role walkthrough | Web/dev first-run with no engine returned API 500s, disabled Build/examples, and exposed only "Could not reach the local engine. Is it running?" / "Check again." |
| Data store | empty isolated profile for installed smoke | Isolated profile tree showed generated engine output written under `TinkerQuarryAppData\engine-output`. |
| Network | online | GitHub release and Pages checks returned successfully; release metadata and Pages status were captured. |

**Isolation verified?** YES · **First-run coverage:** VALID  
**Evidence artifacts:**

- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/test-release.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/nsis-wait.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/tauri-runtime-smoke.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/installed-nsis-smoke.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/isolated-profile-tree.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/pnpm-audit-prod.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/pages-check.log`
- `docs/audits/gate-tinkerquarry-2026-06-24-fresh/artifacts/release-view.log`

---

## Runtime And Release Proof

- `pnpm.cmd test:release` reached and passed lint/type/unit/web/engine/Playwright/Rust/native app build; the parent process timed out after 30 minutes while NSIS was still actively packaging.
- A bounded follow-up wait showed `makensis` exited successfully.
- `pnpm.cmd test:e2e:tauri` passed against the native executable.
- `pnpm.cmd test:e2e:tauri:installed` passed against the silent-installed NSIS build with isolated profile and workflow mode.
- `pnpm.cmd audit --prod` reported `35 vulnerabilities`: 1 critical, 10 high, 20 moderate, 4 low.
- GitHub Pages returned 200 and contained `TinkerQuarry` and `v1.3.1`.
- GitHub release `v1.3.1` is published with NSIS, MSI, `SHA256SUMS.txt`, and `release-manifest.json`.

---

## Lane Results

### Lite

The repo was clean at `main...origin/main`, commit `4e159c2`, tag `v1.3.1`. The existing release/test surface is substantial and the installed app smoke passed. Lite escalates because the production dependency audit found a Critical advisory and Full-role reviews found a first-run dead-end.

### Walkthrough

The installed Windows product first-run path is functional: installed app launched, bundled engine answered health, the describe/build surface rendered, demo workflow built/sliced, mock send opened the outcome dialog, and engine output was written into the isolated profile.

The dependency-absent web/dev path is not first-run safe: with the local engine absent, `/api/health`, `/api/model-status`, `/api/options`, `/api/connectors`, and `/api/designs` failed through the dev proxy; Build/examples were disabled; recovery copy was generic.

### Full

Full ran with five role subagents:

- Principal Engineer: 0 Blocker · 1 Critical · 5 Major · 2 Minor
- UI/UX Designer: 1 Blocker · 0 Critical · 5 Major · 1 Minor
- Technical Writer: 0 Blocker · 0 Critical · 4 Major · 1 Minor
- Test Engineer: 0 Blocker · 0 Critical · 5 Major · 1 Minor
- QA Engineer: 0 Blocker · 0 Critical · 2 Major · 2 Minor

---

## Blocking Punch List

1. **GG-001 - Blocker - Local engine absent / broken engine startup dead-ends the core first-run flow.**  
   Evidence: `apps/ui/src/components/WelcomeScreen.tsx` disables Build/examples behind readiness; `apps/ui/src/services/engineClient.ts` maps engine failures to generic "Could not reach the local engine. Is it running?"; UI/UX runtime evidence saw API 500s and disabled core action.  
   Fix: preserve and surface native `ensure_engine` startup errors; provide an in-product setup/repair/start path; test fresh profile with engine stopped/absent.

2. **GG-002 - Critical - Production dependency tree has active critical/high advisories.**  
   Evidence: `pnpm.cmd audit --prod` reported 1 critical and 10 high advisories, including `protobufjs` via the former web telemetry dependency tree (`GHSA-xq3m-2v4x-88gg`).  
   Fix: remove the telemetry dependency path or override transitive OpenTelemetry/protobuf dependencies; rerun `pnpm.cmd audit --prod` until no critical/high production advisories remain or documented non-reachability exceptions exist.

---

## Major Watchlist

- Tauri desktop filesystem capability grants broad `$HOME/**` read/write/remove/watch authority; scope to selected workspaces/app data.
- OpenSCAD render timeout returns an error but leaves the child process running; make render timeout/cancel killable.
- Unsaved auxiliary file paths are not normalized through the same escape guard as saved project-root paths.
- Public share rate limit is KV read/modify/write and not atomic under concurrency.
- BYOK AI keys are stored with reversible localStorage obfuscation instead of OS credential storage.
- Empty workspace can say "Successful slice proved this candidate" when no design/slice exists.
- Light theme tertiary/disabled text contrast is below accessible thresholds.
- First screen identity/value copy is too generic for a product named TinkerQuarry.
- Empty-project route drops users into a generic Studio/OpenSCAD surface instead of a guided TinkerQuarry journey.
- Release docs still contain pre-tag/pre-publish phrasing after publication.
- Public docs link to `docs/audits/**`, but GitHub Pages excludes `audits/`.
- Installer docs still say "when available/published" despite the release asset existing.
- Source-build docs assume `.venv` and dependencies already exist.
- `pnpm.cmd test:unit:coverage` fails and is outside the release gate.
- Coverage output can poison later lint unless ignored/configured outside lint roots.
- `validate:changes` is mostly static validation and does not run meaningful product tests.
- Browser e2e is narrow, demo-mode, and mock-printer centered.
- Engine suite reports 111 skipped tests without a strict release skip budget by marker.
- Desktop `ensure_engine` failures are swallowed into generic "engine unreachable" UI copy.

## Minor Watchlist

- Share record parser can 500 on corrupt KV data.
- Rust advisory scan tooling (`cargo audit`/`cargo-deny`) was not available in the release gate.
- Status docs and final gate docs have slightly different engine pass counts.
- Workspace copy says "No AI provider configured", which conflicts with local-first positioning.
- Share thumbnail upload trusts `Content-Type: image/png` without validating PNG bytes.
- CSRF/session tests assert 403 status but not the JSON recovery contract.
- UI unit tests emit React `act(...)` warnings without failing.

---

## What's Working

- The repo, tag, GitHub release, and Pages site are coherent at `v1.3.1`.
- The installed Windows product launches, renders the start surface, starts the bundled engine, verifies OpenSCAD/OrcaSlicer, builds/slices a demo design, mock-sends it, and records isolated profile output.
- The release gate is broad: UI unit, web unit, engine pytest, Playwright, Rust tests, native Tauri build, executable smoke, and installed smoke all produced useful evidence.
- Privacy defaults are conservative: telemetry is off by default, MCP is disabled by default, and share/analytics paths have meaningful validation/sanitization.
- The docs correctly separate product `1.3.1` from engine `0.9.3` in the core version surfaces.

---

## Sign-Off Checklist

- [x] Verdict matches lanes actually run.
- [x] Environment attestation is linked to on-disk evidence artifacts.
- [x] First-run reachability is stated.
- [x] Full lane ran all 5 roles.
- [x] Every Blocker/Critical has evidence and fix path.
- [x] What's-working is present.
