# GauntletGate report — TinkerQuarry — v1.4.0 release

**Date:** 2026-07-09 · **Build/commit:** release/v1.4.0-prep (findings fixed through `00ffbce`; evidence commits through this report) · **Run by:** Claude (Cowork session, gauntletgate all)
**Lanes run:** lite + walkthrough + full (5-role fan-out, sonnet workers) · **Lanes NOT run:** none
**How run / environment:** installed NSIS build under verified-isolated profiles (walkthrough); repo static + targeted runtime (lite/full); engine HTTP API probed live (QA role). First-run-clean per attestation below.

---

## Verdict (read first)

> **✅ CLEAR TO ADVANCE** — at the project's fix-to-zero bar.

- **First-run:** reaches core feature ✅ (first-run coverage: VALID, with the data-store caveat noted in the attestation)
- **Severity roll-up (after fix-to-zero):** Blocker 0 · Critical 0 · Major 0 · Minor 0 · Nit 0
  (as found: 0 Blocker / 2 Critical / 11 Major / 7 Minor — every finding fixed and re-verified, except T2, refuted with probe evidence)
- **One-line why:** the found defects (a stale GUI printer block, a reverse-import tie-break that rejected textbook shapes, a silent multi-minute setup download, dev-only recovery copy in the installed app, two dead test guards) are all fixed with regression tests, and the fixed build was re-proven end to end — full gate, native rebuild, both smokes, and a live first-run re-walkthrough of the new installer.

---

## Environment provisioning — verified (attestation)

Carried from the walkthrough lane (`walkthrough-report.md`), plus the post-fix re-walk:

| What | State used | How VERIFIED |
|---|---|---|
| Profile / app-data isolation | fresh temp dirs per phase | app wrote `TinkerQuarryAppData\engine-output\engine.log` inside each phase's profile (paths inside each `artifacts/walkthrough-*.json`) |
| First-run flags | unset (fresh profiles) | profile dirs created empty pre-launch |
| External dependency: Ollama | ABSENT / NOT INSTALLED / PRESENT v0.31.1 — one phase each | HTTP probe of `127.0.0.1:11434` before/after each phase, recorded per JSON |
| Data store | PARTIALLY clean (engine-side designs read the real `Documents\TinkerQuarry`; env isolation doesn't cover it) | observed in captures; caveat recorded — a true new machine has no such data |
| Network | online | downloads observed progressing (byte timelines in JSONs) |

**Isolation verified?** YES (profile/app-data; data-store caveat stated) · **First-run coverage:** VALID
**Evidence artifacts:** `artifacts/walkthrough-{absent,notinstalled,notinstalled2,notinstalled3,notinstalled4,present,rewalk-fixed}.json`, `artifacts/first-run-*.png`, `artifacts/after-setup-click-*.png`, `artifacts/after-submit-present.png`, `walkthrough-harness.mjs` (the runnable harness).

---

## Lane results

### Lite
Reviewed the v1.3.1→HEAD delta inline (reverse_import.py, webapp reverse-import endpoint, validation/pipeline/cadquery deltas, release scripts, CI). Endpoint hardening credited (size caps, filename sanitization, suffix allowlist, bounded concurrency, no traceback leaks). No Blocker/Critical from this lane; fed scope to Full.

### Walkthrough (first-run truth)
**Verdict: reaches core feature ✅.** Guided (not dead-ended) with Ollama absent AND not-installed — one-click setup downloads the portable runtime into the correct isolated profile (0→953 MB observed); with the model present, a real prompt produced a real design in the installed app (dimensions verified, printability 68/100, Send correctly gated on slice). Cells NOT walked, stated honestly: model download to completion (bounded stop), returning-user (covered by the Playwright suite), offline (the audit agent runs on this machine's network). Findings W-1..W-4 — all fixed (below).

### Full (5 roles, parallel)
Deep-dives: `01-engineering.md` … `05-qa.md`. As-found per role: Engineering 0/0/2/2, UI/UX 0/0/3/3, Docs 0/0/1/1, Tests 0/1/4/1, QA 0/1/1/0.

## Findings — fix-to-zero disposition (all verified in this session's tool results)

| ID | Sev (as found) | What | Disposition |
|---|---|---|---|
| T1 | Critical | `KNOWN_UNSLICEABLE_PRINTERS` still GUI-blocked the Neptune 4 Max though the live per-vendor slice test passes | FIXED `0f5134c`: entry removed (dict empty, mechanism kept + synthetic-entry tests); new tripwire fails if a slice-proven printer is ever blocked. Re-verified: live slice 1 passed; options/catalog lanes 10 passed |
| QA-1 | Critical | Reverse-import tried only the first bbox-tie candidate (registration order) — rejected a solid cylinder (dowel_pin's own shape) | FIXED `0f5134c`: ranked candidate list + bounded rebuild-and-signature loop. Re-verified: HTTP regression imports the cylinder as dowel_pin through the REAL renderer; reject branches + 64 MiB 413 + bad-suffix 400 all tested (9 passed) |
| W-1/T4 | Major | Model-setup progress: UI read flat fields the engine never sends → silent multi-minute "Setting up...", poll never cleared | FIXED `00ffbce`: UI consumes the real nested snapshot (describeModelPull/modelPullFinished + tests with the exact server shape). **Proven live post-rebuild:** status streamed "AI engine: 8→229 of 1462 MB" on the new installer (`walkthrough-rewalk-fixed.json`) |
| T3/Eng-2 | Major | Duplicate `pytest_collection_modifyitems` silently disabled the browser-skip guard | FIXED `00ffbce`: hooks merged; guard also detects a disabled plugin. Re-verified: `tests/e2e -p no:playwright` 21 errors → 21 clean skips |
| T2 | Major (claimed) | Jest no-skips reporter "has zero effect on exit code" | **REFUTED:** probe skip-tests in BOTH apps/ui and apps/web exit 1 via the gate's exact invocation. No change |
| W-2 | Major | Installed app showed source-checkout venv/pip steps on engine errors | FIXED `00ffbce`: platform-gated copy (native → restart guidance); both branches Jest-locked; no dev copy in any post-fix capture |
| UX-1 | Major | Disabled buttons visually identical to enabled (opacity removed) | FIXED `00ffbce`: disabled opacity restored |
| UX-2 | Major | Reverse-import error/Retry hidden <640 px; no window minimum | FIXED `00ffbce`: visible at all widths; window minWidth/minHeight 900×600 |
| UX-3 | Major | Evidence panels had zero semantic headings | FIXED `00ffbce`: h3/h4 headings; asserted by role in tests |
| TW-1 | Major | Discussion seeds still announced v1.3.1 with the misattributed feature list | FIXED `00ffbce`: refreshed to v1.4.0 |
| T5 | Major | Reverse-import HTTP reject branches + own size cap untested | FIXED `0f5134c` (tests; see QA-1) |
| QA-2 | Major | GET on POST-only routes returned an empty 405 (no JSON envelope) | FIXED `00ffbce`: routes through `_method_not_allowed`; mirror test across all five POST-only routes (3 passed) |
| W-4 | Minor | Workspace selector claimed "not connected" while the local model served | FIXED: fallback scoped + names the serving engine model (ModelSelector 7 passed) |
| Eng-4 | Minor | CQ interpreter discovery unbounded across candidates | FIXED: overall 300 s deadline |
| UX-4 | Minor | Intent/Provenance shared one icon | FIXED: distinct icon |
| UX-5 | Minor | Panel Import buttons lacked re-entry guard | FIXED: guarded in the shared handler |
| UX-6 | Minor | SmartScreen walkthrough prose-only | FIXED: labeled step illustrations embedded in the manual |
| TW-2 | Minor | Stale "Last updated" stamps | FIXED: 2026-07-09 |
| W-3 | Minor | Harness could silently reuse a surviving engine process | FIXED: smoke + harness kill strays before/after |

## Post-fix re-verification (the receipt)

- `pnpm test:gate` end-to-end, exit 0: engine **1755 passed, 0 skipped (`--strict-no-skips`)**; UI Jest **94 suites / 670 tests**; web 4/20; coverage lanes 7/69 + 3/17; Playwright e2e **7/7**; Rust tests + audit green (`test-gate-reverify` log).
- Native rebuild green (`TinkerQuarry_1.4.0_x64-setup.exe`); runtime smoke + installed-NSIS smoke both `ok: true`, engine health **0.9.4**.
- Live first-run re-walkthrough of the rebuilt installer (Ollama not installed): guided setup with REAL byte progress; no dev copy (`artifacts/walkthrough-rewalk-fixed.json`).

## Blocking punch list

**Empty — the bar (fix-to-zero) is met.**

## Next-stage watchlist (not blocking; carried forward honestly)

- Model download walked to steady progress, not to completion (~7 GB) — first full-completion report will come from beta users or a longer soak.
- Offline cell never walked (audit agent shares the machine's network).
- Full lane's couldNotAssess items: build_installer.py deletion delta reviewed only shallowly; Cargo dependency churn not CVE-audited line-by-line; UI color-contrast ratios not measured at runtime.
- SignPath onboarding (signed installers) — planned, post-beta.

## What's working (credited)

The core promise held under every construction this gate threw at it: a brand-new machine with nothing installed gets a guided, working one-click local-AI setup; the real engine designs a real part in the installed app; the manufacturing rail refuses everything it should. The engine's HTTP surface took malformed uploads, hostile filenames, oversize bodies, wrong verbs, and concurrent load without leaking a traceback or an inconsistent error shape (one 405 mismatch, now uniform). The test culture is real: 1755 engine tests run with zero skips enforced at the release gate.

## Sign-off checklist

- [x] Verdict matches lanes actually run (all three).
- [x] Attestation filled with verified facts, linked to on-disk artifacts.
- [x] First-run reachability stated (✅, VALID coverage).
- [x] All 5 roles ran; deep-dives exist; cross-role findings noted (W-1 = Eng+Test+Walkthrough; reverse-import = QA+Test).
- [x] Every Blocker/Critical has evidence, impact scope, and a fix path (and a fix, and a re-verification).
- [x] What's-working present.
