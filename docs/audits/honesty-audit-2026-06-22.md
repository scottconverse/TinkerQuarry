# Independent honesty audit - 2026-06-22

Produced by an adversarial multi-agent workflow (28 agents) tasked with FALSIFYING the recovery's
"done/verified" claims by reading the actual code and test bodies. 20 of 23 gap-findings were
independently re-verified before counting. This is the verbatim synthesis; it supersedes any rosier
wording elsewhere in the docs.

**Path note:** the git repo root is `C:\Users\Scott\Desktop\CODE\tinkerquarry`. Some absolute
citations below read `C:\...\CODE\apps\...` or `C:\...\CODE\packages\...` — they are **missing the
`tinkerquarry\` segment** (the audit agents assumed `CODE` was the root). The **relative paths and
`file:line` references are correct**; prepend `tinkerquarry\` to any absolute path that 404s.

---

I have everything I need in the confirmed findings. Here is the un-spun assessment.

---

## TinkerQuarry Recovery — Real-State Assessment

### 1. Bottom line

**Is that all that's left? No — but less is *truly proven* than the status doc implies, and the one feature that was supposed to make TinkerQuarry special does not exist at all.** What is genuinely built *and* machine-verified: the **engine**. Real in-process HTTP tests stand up a live server with real OpenSCAD and prove design, render-on-tune (80→120mm reshape within 0.1mm), slice→G-code, save→reopen→source round-trip, and inline library resolution (`test_webapp.py:888, 2139, 2455, 2472`; `test_openscad_runner.py:281`). That layer is real engineering and you should trust it. What is **claimed-but-not-truly-verified**: every "live-verified end-to-end" front-end flow. The phrase "verified LIVE" in STATUS.md means *Scott clicked it once and took a screenshot* — there is **no automated front-end integration test anywhere** that POSTs a real `/api/design` and consumes a real response. Every FE test stubs `fetch` or injects canned deps, and there is no `App.test.tsx` at all, so the React glue that turns engine responses into geometry, downloads, and re-gates is structurally untested. This is the *exact* failure mode that let the §6.12 reopen bug ship before. What is **missing**: the **Visual Correction Loop — the signature feature — is not built. Zero code.** No render-view capture, no vision critique, no rounds, no convergence, no logging (`pipeline.py:944` ends at gate). The local vision model failed the PRD acceptance test 0/3, so the team punted to "cloud-optional," but the cloud path doesn't exist either. Also missing: manual orient override, the seven bundled libraries, external-library admission, the tool-using "watch-it-work" agent, real Explain mode, diff-based edits, and the per-iteration "what was tried" log. **Plainly: the Visual Correction Loop is not built — it is a decision, not a feature.**

---

### 2. Confirmed overclaims / stub-hidden risks (worst first)

| Area | Claim | Reality | Severity |
|---|---|---|---|
| §6.3.1 **Visual Correction Loop** | "missing (architecture decided)" — framed as a deferral | **Zero code.** No capture/critique/rounds/convergence/logging. `pipeline.py:944` returns at gate. Local model fails acceptance 0/3 (`vision-spike.md`); cloud path also unbuilt. The signature feature does not exist. | **High** |
| FE↔engine integration (all flows) | "All core flows live-verified per STATUS.md" | **Systematically stubbed.** No msw/supertest/Playwright; no test POSTs real `/api/design` + consumes real response. Same blind spot that hid the prior reopen breakage. | **High** |
| §6.9 Slice / Make-it-real | "switched Bambu→Elegoo Neptune 4 Max → produced G-code" | Engine slice test is real but gated behind `@pytest.mark.live` and uses **bambu_p2s/pla, not the claimed Elegoo switch**. FE `handleMakeReal` + `<a>`-download (`App.tsx:763-795`) has **zero** test coverage. The Elegoo claim is manual-only. | **High** |
| §6.6 Render-on-tune | "Width 80→120 re-rendered live; gate-on-tune verified" | Engine reshape is real. FE re-gate effect (`App.tsx:916`) untested — `engineClient.test.ts` stub returns `{ok:true}` with no status/report; CustomizerPanel mocks the parser. Manual screenshots only. | **High** |
| §6.5 Source / code drawer | "verified LIVE: engine SCAD shown in Monaco" | FE `engine.source` appears in **no** `.test.ts`; `engineClient.test.ts` never even tests the `/source?inline=1` URL shape. Stub-only. | **High** |
| §6.3 "AI tool-using agent" | headline: "AI tool-using agent + refine" | It's **single-shot multi-turn refine**, not an agent. No "drawing it / looking from the back / fixing holes" actions. STATUS body self-admits "single-shot (not a multi-tool agent loop)" — headline overclaims. | **High** |
| §6.12 Reopen round-trip | "live end-to-end, regression test asserts source-after-reopen" | Engine regression is **real** (`test_webapp.py:2472`). But FE `reopenIntoStudio` (`engineDocument.ts:132-149`) has **no** automated coverage. Half-true: engine yes, FE no. | High (partial) |
| §6.13 Export formats | "PNG / SVG / DXF / STL / OBJ / AMF / 3MF" | **PNG is not user-selectable.** `ExportDialog.tsx:29-39` has no PNG in either format list; MenuBar omits it too. Flat overclaim. | Medium |
| §6.13 Export path | "STL export → Exported successfully" | `exportService.test.ts` mocks `exportModel` itself; no test runs real byte generation on a real engine part. gcode download untested. | Medium |
| §6.3 "Explain mode added" | "Lightweight Explain added (live-verified)" | It's a **post-generate readiness toast** that prepends the dimensions line — not the PRD's user-invoked "explain this design." Grep `explain.*mode` → 0. | Medium |
| §6.3 Undo | "Verified LIVE: cube→Undo→restored prior sphere" | Logic is real but **session-only** (no persistence) and `App.tsx` is never rendered in any test — undo orchestration has zero automated coverage. | Medium |
| §6.3 Diff-based edits | "PARTIAL (Undo working)" | Whole-design revert + a dimensional compare card, **not** structural geometry diff with per-edit rollback. Honestly self-classified, but the word "diff" oversells it. | Medium |
| §6.11 External-library "no UI" | "missing — no UI" | Mostly right, but a "Libraries" UI **does** exist (inherited Studio `customPaths`) — it just feeds Studio's WASM renderer, not the engine sandbox, with no consent/copy/sanitization. The "no UI" phrase is slightly off; the feature is still missing. | Medium |

---

### 3. Genuinely-missing PRD capabilities

- **§6.3.1 Visual Correction Loop** — the signature feature. Capture → vision critique → multi-round → best-candidate → convergence → logging. **None exists.** Acceptance criterion (wrong-face hole must be flagged) **cannot even be evaluated** because there's no loop; local model already failed it 0/3.
- **§6.3 Tool-using agent with visible actions** — no "drawing it / looking from the back / fixing the holes" narrative; only fixed phase labels.
- **§6.3 Explain mode** — user-invoked "explain this design" does not exist (only a readiness toast).
- **§6.3 Diff-based edits with undo/rollback** — only whole-design undo + a compare card.
- **§6.8 Manual orient override** — auto-orient only; orientation is a read-only report field.
- **§6.11 Seven bundled OpenSCAD libraries** — BOSL2, Round-Anything, threads.scad, YAPP_Box, Catch'n'Hole, gridfinity-rebuilt, MCAD — **not vendored.**
- **§6.11 External-library admission** — consent → sandbox copy → include-path update → sanitization. Dead JSON registry, no admission path.
- **§6.12 Per-iteration "what was tried" log** — `PrintRecord` stores only coarse data (type/score/gate/material/max_dim); no prompt, geometry, or round narrative. (VCL round logging also missing, downstream of the missing loop.)

---

### 4. The things most threatening your trust — and the cheapest way to settle each

1. **The Visual Correction Loop doesn't exist, but STATUS frames it as a made decision rather than missing code.**
   *Cheapest resolution: admit it.* Change STATUS from "architecture decided" to "**NOT BUILT — 0 lines; signature feature deferred**," and attach the `vision-spike.md` 0/3 result as the honest reason. No code can prove a loop that isn't there. This is a one-line honesty fix that restores credibility for everything else.

2. **Every "verified LIVE" front-end flow rests on one manual click, and the last time that happened a real bug shipped (§6.12).**
   *Cheapest proof: one real integration test.* Stand up the engine in a test (the harness already exists on the Python side) and write **a single FE test that POSTs a real `/api/design` and asserts the real `/api/source` response renders** — using msw against the live engine or a thin node-fetch harness. One genuine end-to-end test kills the entire "systematically stubbed" category. If it's too hard to wire, that itself is the honest answer: it isn't really verified.

3. **The Elegoo Neptune 4 Max slice claim is unsupported — the only real test uses Bambu/PLA and is gated off by default.**
   *Cheapest proof: run it.* Either run the live slice test once with `printer=elegoo_neptune_4_max` and paste the G-code header + estimate, or **strike the Elegoo sentence from STATUS.** Five minutes to prove or retract.

4. **PNG export is listed as supported but is not user-selectable anywhere.**
   *Cheapest fix: delete the word "PNG" from STATUS §6.13* (2 seconds), or add it to `FORMAT_OPTIONS_2D` and wire it (small, but real work). Until then it's a flat falsehood in the status doc.

5. **No `App.tsx` is rendered in any test — undo, make-it-real download, and re-gate-on-tune are all manual-only.**
   *Cheapest proof: one render test.* Mount `App` once with a mocked engine client and assert the undo button restores prior state and the download anchor is created. If you'd rather not, downgrade these from "Verified LIVE" to "**manually verified once, no automated coverage**" so the doc stops implying a safety net that isn't there.

**The pattern in all five:** the engine is real and tested; the *claims* are written as if the front-end were too. The cheapest path to trust is not more code — it's making STATUS.md say exactly what is automated vs. clicked-once, plus **one** real FE integration test to anchor the difference.

---

Key evidence files (absolute paths):
- `C:\Users\Scott\Desktop\CODE\packages\engine\tests\test_webapp.py` (lines 888-943, 2139-2155, 2455-2469, 2472-2509 — real engine HTTP tests)
- `C:\Users\Scott\Desktop\CODE\packages\engine\src\kimcad\pipeline.py` (line 944 — loop ends at gate; no VCL)
- `C:\Users\Scott\Desktop\CODE\apps\ui\src\services\__tests__\engineClient.test.ts` (request-shape-only stubs)
- `C:\Users\Scott\Desktop\CODE\apps\ui\src\services\__tests__\engineDocumentOrchestration.test.ts` (injected stubSource/stubRun)
- `C:\Users\Scott\Desktop\CODE\apps\ui\src\App.tsx` (lines 758-796 make-it-real, 864-876 undo, 909-924 re-gate — all untested; no App.test.tsx)
- `C:\Users\Scott\Desktop\CODE\apps\ui\src\components\ExportDialog.tsx` (lines 29-39 — no PNG)
- `C:\Users\Scott\Desktop\CODE\docs\STATUS.md` (lines 40-49 — the overclaiming source)
- `vision-spike.md` (local vision model 0/3 on planted errors), `prd-audit-1-ai-visual-loop.md` (independent MISSING marks)