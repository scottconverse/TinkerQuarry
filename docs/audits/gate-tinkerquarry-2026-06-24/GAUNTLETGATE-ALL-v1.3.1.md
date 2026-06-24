# GauntletGate ALL - TinkerQuarry v1.3.1 Release

**Date:** 2026-06-24 · **Build/commit:** release candidate working tree, final clean-commit gate required before tag · **Run by:** Codex
**Lanes run:** lite, walkthrough, full · **Lanes NOT run:** none
**How run / environment:** local Windows repo, Playwright with explicit isolated profile, full release command, native Tauri build and installed-app smoke.

## Verdict

> **CLEAR TO ADVANCE**

- **First-run:** reaches core feature ✅ - first-run coverage: VALID
- **Severity roll-up:** Blocker 0 · Critical 0 · Major 0 · Minor 0 · Nit 0
- **One-line why:** v1.3.1 closes the remaining release-critical product gaps in Explain/VCL evidence/browser proof and passes the full local release gate plus a fresh-profile GauntletGate walkthrough.

## Environment Provisioning - Verified

| What                                | State used                                                   | How VERIFIED - not assumed                                                                                                                                       |
| ----------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Profile / HOME / app-data isolation | `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/profile` | Playwright was run with `TQ_E2E_PROFILE_ROOT` set to that path; artifacts show `UserProfile/.kimcad/history.json` and `engine-output/web/*` written under it.    |
| First-run flags                     | unset at start                                               | `test.beforeEach` clears browser `localStorage`; isolated profile directory was created by the gate run.                                                         |
| External dependency: engine         | local demo engine launched by Playwright                     | `playwright.config.ts` webServer launches `.venv\Scripts\kimcad.exe web --demo --out <isolated>\engine-output`; health URL must be reachable before tests begin. |
| External dependency: UI             | local Vite app launched by Playwright                        | `playwright.config.ts` webServer launches the app on isolated test ports with the same profile env.                                                              |
| Data store                          | empty at start, populated by run                             | Evidence artifacts include generated SCAD, 3MF, oriented STL, G-code 3MF, and `.kimcad/history.json` under the isolated profile.                                 |
| Network                             | online/local loopback                                        | Browser and engine communicate over `127.0.0.1`; no cloud model/API key was required for the release-critical path.                                              |

**Isolation verified?** YES · **First-run coverage:** VALID

**Evidence artifacts:**

- `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/profile-root.txt`
- `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/profile/UserProfile/.kimcad/history.json`
- `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/profile/engine-output/web/1/part.scad`
- `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/profile/engine-output/web/1/part_bambu_p2s_pla.gcode.3mf`
- `docs/audits/gate-tinkerquarry-2026-06-24/artifacts/playwright-report/index.html`

## Lane Results

### Lite

**Verdict:** ship.

Reviewed the diff scope: VCL visual evidence state/UI, Explain trust panel, Playwright browser coverage for explain/stale edit/mobile/export/workflow, version/doc consistency, and release packaging version bump.

Findings: none.

What's working:

- The visual evidence rail now has a real before/after image pair when a correction diff exists.
- The right rail explicitly tells users what was generated, what checks ran, and why Send is enabled or disabled.
- Stale manual code edits are refused in a durable browser test.
- Product `v1.3.1` and engine `0.9.3` are clearly separated across release surfaces.

### Walkthrough

**First-run verdict:** reaches core feature.

Command:

```powershell
$env:TQ_E2E_RUN_ID='gauntlet-v131'
$env:TQ_E2E_PROFILE_ROOT='docs\audits\gate-tinkerquarry-2026-06-24\artifacts\profile'
pnpm.cmd exec playwright test --project=system-chrome
```

Result: 4 passed.

Coverage:

- Fresh browser storage and isolated app-data/profile roots.
- Build prompt -> generated design -> Studio preview.
- Right-rail Customize / Explain / Make it real surfaces.
- First-real caution.
- Slice -> Ready to print.
- Mock Send -> simulated outcome dialog -> outcome recorded.
- Settings/menu/viewer/orient/export controls.
- Stale manual source edit refusal.
- Mobile/narrow first screen without horizontal overflow.

Findings: none.

### Full

**Mode:** DEGRADED - sequential five-role audit in-context. The available multi-agent tool could spawn agents but did not expose a result/wait tool in this turn, so the full lane was run sequentially per the skill's degraded-mode rule. Severity bar unchanged.

#### Principal Engineering

Findings: none.

Confirmed the release-critical flow is backed by durable app state, engine APIs, and explicit readiness transitions. The stale-code guard is now browser-proven. Version bump touches product package, app version constant, Tauri config, Cargo metadata, installed-app smoke path, and public docs. The release command passed through the engine suite, native build, and installed-app smoke.

#### UI/UX

Findings: none.

The right rail now matches the intended user journey more honestly: Customize, Explain, Make it real, and iteration log. The Explain panel removes ambiguity around "ready" vs "ready to print", and the visual rail can show before/after correction evidence rather than only text.

#### Technical Writing

Findings: none.

The root README, manual, architecture doc, landing page, status matrix, discussion seeds, install guide, and engine README have been reconciled for v1.3.1. Product release `v1.3.1` and KimCad engine `0.9.3` are not conflated.

#### Test Engineering

Findings: none.

Release proof includes `pnpm test:release` passing. New deterministic browser coverage pins Explain semantics and stale edit refusal. Existing browser coverage already proves build/slice/send/outcome, workspace controls, export dialog, and mobile boot. Focused unit checks for Settings library admission and visual diff remain green.

#### QA

Findings: none.

Runtime proof includes Playwright against the local engine, Tauri native runtime smoke, and installed NSIS smoke. The gate-created isolated profile contains generated source, meshes, G-code, and history under the expected temp profile rather than the user's real app data.

## Release Candidate Proof

`pnpm test:release` passed before this report was written:

- `pnpm -r lint`
- `pnpm -r type-check`
- UI Jest suite
- web Jest suite
- engine pytest suite: 1627 passed, 111 skipped
- Playwright web e2e: 4 passed
- Rust/Tauri tests: 10 passed
- native Tauri build
- release executable smoke
- installed NSIS smoke

Release artifacts:

| Artifact                                                                        | SHA-256                                                            |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `apps/ui/src-tauri/target/release/bundle/nsis/TinkerQuarry_1.3.1_x64-setup.exe` | `66B57545F1A8EE24FFA08DCBC53C0317996C7C9647565F05C6F57D6D5DA140EC` |
| `apps/ui/src-tauri/target/release/bundle/msi/TinkerQuarry_1.3.1_x64_en-US.msi`  | `AA23DD19A7921F40BE0EB26D562063378AB5B963B4DCE69C518843FAB559C6C9` |

## Blocking Punch List

None.

## Next-Stage Watchlist

None for this release gate.

## What's Working

- Local-first plain-English design to printable output.
- OpenSCAD source visibility and stale-edit protection.
- Readiness wording remains honest: "Ready to print" is only earned after slice.
- Explain/trust surface clarifies design, VCL, gate, slice, and send states.
- VCL correction evidence is visible when before/after captures exist.
- Browser, engine, native runtime, installed-app, and packaging paths are all release-tested.

## Sign-Off Checklist

- [x] The verdict matches the lanes actually run.
- [x] Environment attestation filled with verified facts and linked to on-disk evidence artifacts.
- [x] First-run reachability for a brand-new user is stated.
- [x] Full lane ran in documented degraded sequential mode.
- [x] Every Blocker/Critical has evidence, blast radius, and a fix path; none were found.
- [x] What's-working is present.
