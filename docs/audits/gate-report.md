# GauntletGate report — TinkerQuarry — real-runtime integration slice

**Date:** 2026-06-21 · **Build:** KimCadClaude@7e762d9 (engine 0.9.3) · tinkerquarry@c3e7fb0
**Run by:** Claude (Opus 4.8) · **Lanes run:** walkthrough + full (5-role panel) · **Lanes NOT run:** lite
**Environment:** real `kimcad web` on http://127.0.0.1:8765, Python 3.13, this machine (SER8) — provisioned box, first-run constructed deliberately (see attestation).

---

## ROUND 2 (re-run after fixes) — verdict: ✅ CLEAR TO ADVANCE at **0/0/0/0/0**

**Date:** 2026-06-21 (later) · **Build:** KimCadClaude@HEAD · tinkerquarry@HEAD · **Lanes:** walkthrough + full (5-role re-audit)

> **✅ CLEAR TO ADVANCE — 0 Blocker / 0 Critical / 0 Major / 0 Minor / 0 Nit.**

After round 1's findings were fixed and committed, the full 5-role panel **re-audited the
committed code**. Every round-1 finding was confirmed genuinely fixed; the re-audit surfaced a
short tail of residuals (mostly *second copies* round 1 missed), all now fixed:

| Round-2 finding | Sev | Fix |
|---|---|---|
| ENG-R2-MIN-1 — user-facing license still "Apache-2.0" (About panel + bundle + USER-MANUAL) | Minor | → GPL-2.0; SPA rebuilt |
| UIUX-R2-01 — `.kc-tone-pass` "Passed" badge 3.95:1 | Minor | → `--kc-pass-text` (5.40:1) |
| N-1 — stale engine test count ("9 failures") in STATUS/README/PRD | Minor | → 1,590 pass / 0 fail / 101 skip |
| ENG-R2-NIT-1 — engine `connector.py` still read `gate.messages` | Nit | → `gate.findings` (the round-1 fix had only touched the glue copy) |
| ENG-R2-NIT-2 — mock `_is_loopback("")` treated bind-all as loopback | Nit | → removed `""` |
| TST-8 — KCViewport measurement overlay still Zen gold | Nit | → forge amber `0xe0a667` |
| TST-9 — `health.external_binaries` / `model_status.model_loading` not asserted | Nit | → assertions added |
| flaky-405 — Windows socket-teardown race in a test client | (test) | → idempotent retry; 405 routing was already correct |

**Tests (verified):** engine **1,590 passed · 0 failed · 101 skipped**; frontend **407**; glue **19/19**.
**By-design note (not a finding):** the PRD §1 describes the visual-correction loop in present tense
as a *requirements/design* doc; §13 honestly flags it as not-yet-live, and all user-facing surfaces
(README/STATUS/MANUAL/app) frame it as planned. Round-2 deep-dives: `0X-*-round2.md`.

---

## Verdict — Round 1 (historical; see Round 2 above for the current state)

> **✅ CLEAR TO ADVANCE** — both required lanes ran; 0 Blocker / 0 Critical; a brand-new user reaches the core feature.

- **First-run:** reaches core feature ✅ (AI killed → KimCad self-heals; honest progress, no dead-end) — first-run coverage **VALID** (caveat: the model-on-disk "never-downloaded" cell was not torn down; covered by the tested setup flow).
- **Severity roll-up (after fixing the self-inflicted regressions this run):** Blocker **0** · Critical **0** · Major **5** · Minor ~13 · Nit ~10. *(Started at 10 Major; 5 were regressions I introduced and fixed in-run.)*
- **One-line why:** The integrated describe→LLM→geometry→gate→slice pipeline, the session-token security, and the safety invariants are genuinely sound; the remaining Majors are documentation and pre-existing environment drift — none block advancement. *(Update 2026-06-21: the licensing-reconciliation Major is now **RESOLVED** — the engine was relicensed GPL-2.0, so the combined work is uniformly GPL-2.0; see watchlist #1.)*

---

## Environment provisioning — attestation

| What | State | How VERIFIED |
|---|---|---|
| Profile / first-run | fresh; `kc-first-run-done` unset | `preview_eval` → localStorage empty; first-run wizard rendered |
| Dependency: Ollama (AI) | torn down → **self-healed** | killed all `ollama` procs (11434 refused); KimCad re-spawned it (pid 19052) on design |
| Dependency: OpenSCAD | present | `/api/health` → `openscad:true` (`artifacts/health-absent-ai.json`) |
| Dependency: OrcaSlicer | present | `/api/health` → `orcaslicer:true` |
| AI models | on disk | `ollama list` (4.7+3.2 GB; not torn down) |
| Network | loopback only | bound 127.0.0.1; session-token enforced |

**Isolation verified?** PARTIAL (first-run UI + dependency-absent server path verified by teardown; model-on-disk cell not torn down). **First-run coverage:** VALID for reachability.
**Artifacts:** `artifacts/health-absent-ai.json`, `artifacts/model-status-absent-ai.json`, `artifacts/qa-probe-matrix.txt` + QA `*.json`, in-run screenshots (first-run wizard; "Designing… 1:49 elapsed").

---

## Lane results

### Walkthrough — first-run verdict: reaches core feature ✅
Wizard guides (Welcome · Set up AI · Printer · Direct printing · Ready); "Set up your AI" is one-click (no "go install Ollama yourself"); adversarial Skip→Design-it with AI killed did **not** dead-end — honest progress + **managed-engine self-heal**. Findings: W-1 (Minor, status `running:true`+`model_present:false` during cold load), W-2 (Nit, cold-start latency).

### Full — 5-role panel (deep-dives `01-engineering`…`05-qa`)
- **Engineering** (0B/0C/2 Maj/4 Min/3 Nit): security model, gate, and untrusted-codegen boundary well-built. Majors: licensing inconsistency (no NOTICE/THIRD_PARTY) — **now RESOLVED** (relicensed GPL-2.0 + `THIRD_PARTY_LICENSES.md` added); mock_api.py strips hardening. Credits: constant-time token, gate fails-closed at slice+send, SCAD sanitizer blocks dangerous ops, zip-slip/bomb-safe import, vision always local.
- **UI/UX** (0B/0C/2 Maj/4 Min/3 Nit): **dark theme contrast-clean** (retheme preserved the AA fill-vs-text splits). Majors were **light-theme** AA dips (primary button 4.31:1, warn/fail) — **FIXED this run**. Minors: "Kim" persona never introduced; theme-default doc stale (fixed).
- **Technical Writer** (0B/0C/3 Maj/4 Min/3 Nit): api.md is a **drift-free contract**; real end-to-end claim substantially true. Majors: STATUS test-count wrong (**FIXED**); license contradiction (**RESOLVED** — relicensed GPL-2.0, docs now state GPL-2.0 uniformly + link `THIRD_PARTY_LICENSES.md`/`STRATEGY-RECON.md`); KimCad↔TinkerQuarry relationship undocumented (**FIXED** — naming box added to STATUS).
- **Test Engineer** (0B/0C/2 Maj/3 Min/2 Nit): verified **frontend 405/405, glue 19/19**, engine **1552 passed / 11 failed / 104 skip**. 2 failures were rebrand/retheme regressions (**FIXED → green**); 9 are pre-existing env/profile drift. Safety invariants well covered (gate reject on real geometry, slice-requires-pass, send forces confirm).
- **QA** (0B/0C/1 Maj/1 Min/1 Nit): session token solid (8 state-changing POSTs → 403 without it; accepted with the page-shell token); safety invariants hold (no-design→404, gate-failed→refused, simulated send never unlocks outcome, oversize→413). Major: `/api/settings` accepts unknown fields (silent config loss). Mock↔real parity confirmed.

**Cross-role finding:** the **licensing inconsistency** (engine Apache-2.0 vs glue GPL-2.0, both bundling GPL OpenSCAD/OrcaSlicer, no NOTICE) was independently raised by Engineering **and** Docs — a high-leverage Major. **Resolved 2026-06-21:** the engine was relicensed Apache-2.0 → GPL-2.0 and `THIRD_PARTY_LICENSES.md` added, so the combined work is uniformly GPL-2.0 (watchlist #1).

---

## Blocking punch list (must clear to advance)
**None.** 0 Blocker / 0 Critical.

## Next-stage watchlist (Majors — none block, but fix before ship)
1. **Licensing reconciliation (Option-B premise). — ✅ RESOLVED (relicensed GPL-2.0).** The combined-work license question is settled: per `STRATEGY-RECON.md` (Option B), the engine `KimCadClaude` was **relicensed Apache-2.0 → GPL-2.0** (LICENSE swapped, `pyproject` `license = "GPL-2.0-only"`, README updated) and `KimCadClaude/THIRD_PARTY_LICENSES.md` was added. TinkerQuarry is now **uniformly GPL-2.0**: the v2 lock comes from the absorbed OpenSCAD-Studio front-end (GPL-2.0-only) the product embeds; OpenSCAD/OrcaSlicer are invoked as arm's-length subprocesses. There is no remaining Apache-vs-GPL split. *(Original finding, for history: engine repo was Apache-2.0 with a subprocess-isolation argument while glue/PRD asserted GPL-2.0; both bundle GPL OpenSCAD + GPL/AGPL OrcaSlicer as fetched binaries.)*
2. **Document the KimCad↔TinkerQuarry relationship.** Product is TinkerQuarry; repo/CLI/`.kimcad`/`X-KimCad-Session` are `kimcad` (correct to keep) — but a one-paragraph orientation is needed so it doesn't read as an unfinished rebrand.
3. **`mock_api.py` hardening note** — it's the dev mock and intentionally permissive, but add a header banner that it must never be the production server (the real one's session-token model is the pattern).
4. **`/api/settings` unknown-field validation** — return 400 on typo'd fields like `/api/connections` does, so the `saved:true` flag can't be a false positive.
5. **9 pre-existing engine test failures** — env/profile drift (Orca Elegoo profiles, `_tools` path, stale catalog verify-record, connector overlay), not product bugs; clean up the cloned-repo test fixtures.

## What's working (credited, specific)
Full real pipeline end-to-end (prompt→qwen2.5:7b→OpenSCAD→trimesh→manifold3d→Gate PASS→OrcaSlicer→G-code); **safety fails closed** (bad parts blocked at slice AND send; re-gated on reopen/import; send forces confirm); **session-token CSRF** enforced on all 8 state-changing POSTs, constant-time, both ends; SCAD sanitizer + zip-slip/bomb-safe import; **dark theme AA-clean**; rebrand complete (no stray user-facing "KimCad", protocol IDs preserved); api.md is a drift-free contract; frontend 405/405 + glue 19/19; managed-engine self-heal (no first-run dead-end).

## Sign-off checklist
- [x] Verdict matches lanes run (walkthrough + full → CLEAR eligible).
- [x] Attestation filled with verified facts + linked artifacts (model-on-disk caveat stated).
- [x] First-run reachability stated (✅ reaches core feature; no dead-end).
- [x] All 5 roles ran; deep-dives exist; cross-role licensing finding noted.
- [x] 0 Blocker/Critical; every Major has evidence + fix path.
- [x] What's-working present.
