# GauntletGate — Round 2 — Technical Writer re-audit — TinkerQuarry docs (real runtime)

**Date:** 2026-06-21 · **Role:** Technical Writer (docs / README / manual / API / marketing accuracy + honesty)
**Mode:** audit-only (READ, no modify). **Baseline:** round-1 deep-dive `03-docs.md`; fixes committed `KimCadClaude@da65bc8`, `tinkerquarry@fdd73d1`.
**Scope read:** `tinkerquarry/README.md`, `docs/{MANUAL,STATUS,TinkerQuarry-PRD-v0.3,gauntletgate-slice1-lite-v0.1}.md`, `docs/discussions/*`, `gate-report.md`; `KimCadClaude/{README.md,docs/api.md,THIRD_PARTY_LICENSES.md}`, `src/kimcad/webapp.py`; `CODE/STRATEGY-RECON.md`. Verified counts: `pytest --collect-only` (1691 collected); code cross-check of print-outcome + health.

## Severity counts

| Severity | Count |
|---|---|
| Blocker | 0 |
| Critical | 0 |
| Major | 0 |
| Minor | 1 |
| Nit | 1 |

**Verdict:** Round-1's 3 Major / 4 Minor / 3 Nit are **all fixed**. The doc set is honest, internally consistent, and the licensing/naming reconciliations are clean. The single remaining issue: **STATUS.md and the PRD's superseded-note now ship a *new* stale test count** (the round-1 fix replaced "243" with "~1,554 / ~1,667 / 9 failures" — but the latest run is 1590 pass / 0 fail / 101 skip of 1691 collected). One Nit: PRD §1 still reads the visual-correction loop present-tense (acceptable as a target-doc, flagged for completeness). Not a 0/0/0/0/0, but the residual is low-severity and self-inflicted by the round-1 edit.

---

## Prior findings — verification

| ID | Sev | Round-1 issue | Status |
|---|---|---|---|
| **D-1** | Major | STATUS test count wrong ("243") | **FIXED** — STATUS now states a real figure; m-2 superseded-note added. *But see N-1 below: the replacement number is itself now stale.* |
| **D-2** | Major | License Apache-vs-GPL contradiction | **VERIFIED-FIXED** — all docs say GPL-2.0 uniformly; engine relicensed Apache→GPL-2.0; THIRD_PARTY_LICENSES.md present + linked from README/STATUS. No split remains. |
| **D-3** | Major | KimCad↔TinkerQuarry naming unexplained | **VERIFIED-FIXED** — STATUS naming box (l.15-30), README §Naming (l.126-133), MANUAL note (l.15-17) + FAQ (l.132). |
| **D-4** | Minor | "remaining" vs "rebrand done" conflict | **VERIFIED-FIXED** — STATUS "Done (landed this build)" (l.104-109) credits the reskin; no longer listed under "remaining." |
| **D-5** | Minor | Run instructions non-reproducible | **VERIFIED-FIXED** — STATUS "Two-repo layout" (l.67-77) + working-dir anchors ("from `C:\…\KimCadClaude`" / "`…\tinkerquarry`"); `..\_tools` wiring noted. |
| **D-6** | Minor | Stale xrefs (lite m-2; PRD "not executed") | **VERIFIED-FIXED** — lite m-2 (l.61-63) and PRD foundation-confidence (l.500-506) both carry superseded notes. |
| **D-7** | Minor | "full functional SPA" overread as tested | **VERIFIED-FIXED** — STATUS l.59-62 distinguishes "rebranded SPA = visual composition, screenshot-verified" vs "engine's React SPA = unit-tested (405/405)." |
| **D-8** | Nit | `.kimcad` portable-file naming | **VERIFIED-FIXED** — STATUS l.26-28, MANUAL l.114-115/235, README naming §. |
| **D-9** | Nit | README hero promises visual loop | **VERIFIED-FIXED (README)** — hero SVG = "Describe a part in plain words. Get a checked, print-ready file" / "describe→design→gate→slice→print"; no correction claim. README body, STATUS, MANUAL, discussions all clean. *PRD §1 still present-tense — see N-1b.* |
| **D-10** | Nit | STRATEGY-RECON.md "missing" | **VERIFIED-FIXED** — file exists at `CODE/STRATEGY-RECON.md` (repo-parent). Links `../../STRATEGY-RECON.md` (from `tinkerquarry/docs/`) and `../STRATEGY-RECON.md` (from `KimCadClaude/`) both resolve correctly. |
| **QA-2** | api.md | print-outcome 404-vs-409 | **VERIFIED-FIXED** — matches `webapp.py:1960-1987`: `snap is None`→404 "That design is no longer available." (checked first); `not can_record`→409 "Record an outcome after a real printer send." api.md:131-141 is exact. |
| **QA-3** | api.md | health-recheck wording | **VERIFIED-FIXED** — matches `webapp.py:990-1007`: cross-site caller skips the CadQuery re-probe but still answers 200 with cached health. api.md:262-264 is exact. |

---

## Residual / new findings

### N-1 (Minor) — STATUS.md ships a *new* stale test count (round-1 fix is already out of date)
**Evidence:** `STATUS.md:38` — "**~1,554 engine tests pass** (full suite ~1,667 collected; 9 pre-existing env/profile failures … 104 skips)". Ground truth this audit: `pytest --collect-only` collects **1691** (not ~1,667); the latest authoritative run is **1590 passed / 0 failed / 101 skipped** (the 9 failures the round-1 Test-Engineer lane saw were fixed/cleared). So every cell in STATUS's parenthetical is now stale: pass count low by ~36, collected low by ~24, **failures stated as 9 when the suite is now green (0)**, skips 104 vs 101.
The stale figure is echoed in two more places that quote the same era:
- `TinkerQuarry-PRD-v0.3.md:504` superseded-note: "engine ~1,554 passing of ~1,667 collected (the handful of remaining failures…)".
- `tinkerquarry/README.md:111`: "**~1,554** engine … tests pass" (no failure claim — softer, but still understated).
- `MANUAL.md:250`: "~1,554 pass" (tilde-hedged; least wrong).
**Why it matters:** This is exactly the round-1 D-1 failure mode — a *specific* wrong number undermines a true claim — re-introduced by the round-1 fix. The "9 pre-existing failures" line is the sharpest problem: it advertises a non-green suite when the suite is now green, which *under*-claims quality but still reads as an inaccuracy a cross-checking reader will catch. Minor (not Major) because every instance is tilde-hedged ("~") and directionally honest about scale, unlike the 5–7× "243" error.
**Fix:** Update STATUS.md:38 to the current run (e.g. "1590 passed / 0 failed / 101 skipped of 1691 collected"), drop the "9 failures" clause, and refresh the PRD:504 and README:111 echoes. Or de-precision them ("~1,600 engine tests pass, suite green") so they don't drift each run.

### N-1b (Nit) — PRD §1 still states the visual-correction loop in present tense
**Evidence:** `TinkerQuarry-PRD-v0.3.md:32-33` "TinkerQuarry generates the geometry, *looks at what it built and fixes it*, checks it …, slices it, and sends it"; `:38` one-liner "Watch it get built, checked, **and corrected**." The loop is **not live** (STATUS:118-120 "being wired into the codegen path … not a present-tense capability"; PRD §13 Table C l.493 agrees).
**Why it matters / why only a Nit:** The user-facing surfaces that round-1 flagged — README hero, README body, STATUS, MANUAL, discussions — are all now correctly target-state or silent on the loop. The PRD is explicitly a **requirements / design-handoff doc** (header l.3-5, l.18-23) whose §13 Reality Map tells the reader what exists vs net-new, so present-tense in §1 is requirements framing, not a shipped-product overclaim. Left as a Nit only because §1's summary is the one spot a casual reader could misread before reaching §13.
**Fix (optional):** Add "(target v1)" to the §1 one-liner or a one-line pointer to §13, mirroring the README hero's softening.

---

## api.md vs code (cross-check)

`KimCadClaude/docs/api.md` remains a **drift-free contract**. The two round-1 QA items now match the implementation line-for-line (print-outcome 404/409 ordering at `webapp.py:1982-1987`; health recheck cross-site skip at `webapp.py:1002-1007`). One immaterial nuance not worth flagging: a *non-integer* `<rid>` to print-outcome returns 404 "Not found." (`webapp.py:1967`), which api.md folds into its unknown-id 404 case — correct outcome, slightly different body string.

## Licensing (D-2) — reconciliation is clean and consistent

GPL-2.0 stated uniformly across README (both repos), STATUS, THIRD_PARTY_LICENSES, gate-report watchlist #1, STRATEGY-RECON, and the FAQ. The rationale (engine relicensed Apache→GPL-2.0; v2 lock from the absorbed OpenSCAD-Studio front-end; OpenSCAD/OrcaSlicer arm's-length subprocesses; permissive SCAD/py deps as aggregation) is identical wherever stated. THIRD_PARTY_LICENSES.md is thorough and self-consistent (the manifold3d/openai Apache-2.0 "aggregation, revisit if vendored" caveat is honest). No residual contradiction.

## What's working (docs)

- **Naming, license, two-repo run, SPA-coverage distinctions** all landed cleanly — round-1's substantive Majors/Minors are genuinely resolved, not papered over.
- **api.md + MANUAL Part III** are accurate against `webapp.py` and the architecture.
- **Honesty posture holds:** physical-printer deferral, vision-model-not-pulled, visual-loop-not-live, mock-vs-real, partial isolation — all caveated consistently across README/STATUS/MANUAL/PRD/gate-report.
- **STRATEGY-RECON.md** is now discoverable and the relative links resolve.

## Couldn't fully verify
- The full engine `pytest` run was launched this audit but the live OrcaSlicer/OpenSCAD cases are slow and the run had not emitted its summary line by report time; the **collected** count (1691) is confirmed directly, and the 1590/0/101 pass figure is taken from the prompt's authoritative latest-run statement. The N-1 staleness conclusion does not depend on the exact pass count — STATUS is already wrong on *collected* (1691 vs ~1,667) and on *failures* (0 vs 9).
- Did not re-run the frontend Vitest (405) or the glue suite (19); relied on gate-report evidence.
