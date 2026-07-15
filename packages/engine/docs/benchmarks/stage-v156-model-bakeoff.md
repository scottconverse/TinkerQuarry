# v1.5-6 model bake-off — full report (v2.0, 2026-07-15)

**Self-contained: written so a session or reviewer with zero prior context can evaluate it.**
This is a **revision** of the same-day v1.0 report. v1.0 recommended flipping the default to
Mellum2 on the strength of the bake-off below. That flip shipped, then was **reversed the same
day** once a review of the bake-off's own evidence, a corroborating detail in JetBrains' own
technical report, and follow-up research all pointed the other way. This report tells the whole
arc honestly, in the order it actually happened — including the part where the first call was
wrong.

## What this is

TinkerQuarry (local-first text→3D-print app, repo `Desktop/CODE/tinkerquarry`) runs a local
LLM as its "planner": the user's plain-English request is turned into a structured JSON design
plan, which the engine then builds into geometry, hardens, gates for printability, and slices
with a bundled OrcaSlicer. The planner model is the single biggest quality lever in the product.
Roadmap item v1.5-6 asked whether newer open-weight models beat the incumbent default
(`qwen2.5:7b`, chosen 2026-06-15).

## Bottom line

**Decision taken (owner, 2026-07-15): the default chat model is Qwen3.5-9B (`qwen3.5:9b`) —
NOT Mellum2, the bake-off's own measured winner.** The flip ships in this PR —
`config/default.yaml`'s `local` backend, `kimcad.config.DEFAULT_CHAT_MODEL`, the model
advisor's catalog, and every user-facing surface that names the default. Four things happened,
in this order, and every one of them is documented below with evidence:

1. **The bake-off ran.** A 10-case harness measured Mellum2 beating the prior default on every
   axis this harness checked (Part 1).
2. **An independent review found the harness's own grader feature-blind.** It scored plans
   "completed" that were missing requested features or had dimensions declared outside their
   own stated bounding box. A fidelity re-grade — checking actual *values*, not just that valid
   JSON came back — tied Mellum2 to the incumbent on feature-fidelity (Part 2).
3. **JetBrains' own technical report corroborated the miss**, from a completely independent
   angle: Mellum2 is measurably weak at catching false-premise/contradictory requests — exactly
   the failure mode the reviewer caught by hand (Part 3).
4. **Deep, adversarially-verified research across the published record** ranked Qwen3.5-9B
   first for this task profile and found no published benchmark measures the one property this
   product cares about most (Part 4). The owner chose to switch on that record — **Option B** in
   the research report's decision menu — rather than spend the ~1 hour a local confirmation run
   (Option A) would have cost, accepting the residual unknowns that implies (see "What's still
   not settled," below).

---

## Part 1 — The 10-case bake-off (2026-07-15, morning)

### Method

- Harness: the repo's own `kimcad bakeoff` (`src/kimcad/bakeoff.py`), unchanged.
  10 fixed benchmark prompts (`bench/prompts.yaml` — the spec's Appendix-B set:
  hooks, brackets, dishes, enclosures, etc.), run end-to-end per model **including real
  OpenSCAD builds and real OrcaSlicer slicing**.
- Graded axes per case: **completed** (pipeline reached the printability gate), **match**
  (planned object type matches the request), **dims** (built part matches its own plan and the
  requested envelope), **slice** (real, motion-bearing G-code produced). Headline metric =
  3-axis graded rate, not bare completion.
- Environment: Beelink SER8 (16-thread CPU inference, no usable GPU for this), 27.8GB RAM,
  Ollama **0.32.0**, engine venv Python 3.13, all models Q4-class quants pulled 2026-07-15.
  All five backends ran in one sequential session (same box, same load conditions), total
  wall time ≈ 1.5h.
- Candidate selection: from a verified slate (licenses + registry tags + CPU-viability checked
  against this box's measured RAM). Pre-excluded with reasons: Qwen3-Coder-Next (52GB weights >
  27.8GB RAM), Devstral-Small-2-24B and Qwen3.6-27B (est. 1h+/case dense CPU — cannot be a
  user-hardware default), Ovis2.5 (no llama.cpp/Ollama runtime support exists at all).

### Results

```
backend         model                                 completed  graded  match   dims  slice  mean_s
local (default) qwen2.5:7b                                 9/10    3/10   8/10    5/9   9/10    61.2
cand_mellum2    JetBrains/mellum2-instruct-q4_k_m         10/10    6/10  10/10    5/9  10/10    39.9
cand_gemma26    gemma4:26b-a4b-it-q4_K_M                   0/10    0/10   0/10    n/a   0/10     n/a
cand_seedcoder  hf.co/unsloth/Seed-Coder-8B-...:Q4_K_M     7/10    4/10   8/10   5/10   7/10   135.1
cand_gemma12    gemma4:12b-it-q4_K_M                       2/10    2/10   2/10    2/2   2/10   238.4
```

Per-case failure modes (from each case's `outcome.txt`):

- **qwen2.5:7b (incumbent):** 9 completed; 1 `render_failed` (b08 — geometry stage, not planning).
- **Mellum2:** 10/10 completed, no failures of any kind *by this harness's grading*. 13GB
  Apache-2.0 MoE (12B total / 2.5B active), 8.1GB on disk, runs ~40s/prompt on this CPU — faster
  than the smaller-file incumbent because only 2.5B parameters are active per token. **This
  "no failures" verdict is exactly what Part 2 below overturns.**
- **Seed-Coder-8B:** 7 completed, 3 `gate_failed` (parts built but failed the printability
  gate). Plans parse fine (MIT license, dense 8B) but 135s/prompt — 2.2× slower than incumbent.
- **Gemma-4-12B:** 2 completed, 8 `plan_failed` (JSON unparseable), 238s/prompt when it works.
- **Gemma-4-26B-A4B:** 10/10 `plan_failed`. **See the asterisk below — this is NOT a quality
  verdict.**

### The Gemma asterisk (important for any reviewer)

Gemma-4's 0/10 and 2/10 were investigated, not just recorded:

- `gemma4:26b-a4b-it-q4_K_M` produces **zero output on this runtime, period**: a native
  `ollama run … "Say OK"` returns an empty string, and the same model through Ollama's
  OpenAI-compatible endpoint returns `''` (both reproduced directly, post-run, model loaded
  fine — 17GB resident, 100% CPU). Nothing to parse → every case `plan_failed`.
- Conclusion: **runtime incompatibility between this Gemma-4 MoE build and Ollama 0.32.0**,
  not model quality. Gemma-12B's instability (2/10) likely shares the family/runtime issue.
- We deliberately did NOT upgrade Ollama mid-bake — that would have invalidated every other
  model's numbers. A fair Gemma re-test after an Ollama upgrade remains a recorded follow-up.

### Why the v1.0 report called this decisive (and why that call didn't hold)

At the time, Mellum2 looked like a clean sweep: completion 10/10 vs 9/10, graded quality 6/10
vs 3/10 (double), request-match 10/10 vs 8/10, slice success 10/10 vs 9/10, speed 39.9s vs
61.2s — Apache-2.0, runtime-risk pre-cleared by a smoke test. On the numbers this harness
produced, flipping the default was the right call. **The numbers this harness produced were the
problem.**

---

## Part 2 — The independent review: the grader was feature-blind

A reviewer read the bake-off's own per-case artifacts (`plan.json` / `report.txt` /
`outcome.txt` under `output/bakeoff-v156/cand_mellum2/`) by hand instead of trusting the
harness's `completed`/`graded` columns, and found the grader was checking the wrong thing.

- **Case b02 (a box with holes):** the request asked for **4 holes**; Mellum2's plan specified
  **8**. The harness's `match` and `completed` checks both passed — they check that an
  *object_type* was produced and that the pipeline reached the printability gate, not that the
  *feature count* in the plan matches the request. A part with double the requested holes
  scored identically to one with the right count.
- **Case with 60mm legs:** Mellum2's plan declared leg dimensions of 60mm while the plan's own
  stated bounding box was 40mm — an internally *self-contradictory* plan (the part cannot
  physically fit its own declared envelope). The harness's `dims` axis checks the **built
  part** against the **plan**, and the **plan** against the **requested envelope** — but never
  cross-checks a plan's own internal fields against each other. A geometrically impossible plan
  can pass every axis the harness measures.
- **The pattern:** both misses share a root cause. The harness (like most benchmark graders, see
  Part 4's "most important finding") checks **structural validity and shallow existence** —
  did a plan of the right shape come back — not **value fidelity**: are the *numbers inside*
  the plan correct and mutually consistent. Mellum2 is very good at the first thing and no
  better than the incumbent at the second.
- **Fidelity re-grade:** re-scoring the same cases on feature-count and cross-field dimensional
  consistency (not just "a plan of the right shape came back") **tied Mellum2 to the incumbent
  `qwen2.5:7b`** on feature-fidelity axes — the double-digit "graded" gap in Part 1's table
  (6/10 vs 3/10) does not survive checking the values inside the JSON, only the shape of it.

This is the finding that triggered the same-day reversal: a model that looks like a clean
harness-measured winner can be systematically wrong in exactly the way this product cannot
tolerate (a planner that must reject contradictory dimensions, not comply with them), while
still scoring "completed" on every case.

---

## Part 3 — JetBrains' own technical report corroborates the miss

The reviewer's hand-caught failure mode — a model that complies with a request rather than
catching that the request is internally contradictory — turns out to be independently
documented by **JetBrains' own published technical report for Mellum2**
(arXiv 2605.31268), in numbers that run *against* the vendor's own interest:

- **Table 9** of that report scores Mellum2 on **BS-Bench**, a benchmark specifically measuring
  false-premise / contradictory-request detection: Mellum2 scores **14–24**, against
  **Qwen3.5's 56–70** on the same benchmark — a 3-4x gap, not a close call.
- The report's own authors state, in their own words, that Mellum2's **"SFT/RL signal leans
  toward compliance."** That is the precise, named version of the failure the reviewer caught
  by hand in Part 2: a model tuned to comply with what it's asked, not to notice when what it's
  asked is self-contradictory (60mm legs in a 40mm box; 8 holes where 4 were requested and the
  plan says 4).
- For a **planner** role specifically — where the job is sometimes to catch that a request
  doesn't add up, not to produce *a* plausible-looking plan regardless — this is disqualifying,
  independent of the bake-off entirely. Mellum2 remains a fine candidate for other roles (code
  completion/editing) where compliance-leaning behavior is not a liability; it is not a fit for
  this one.

---

## Part 4 — The published-record research verdict

Following the review and the JetBrains corroboration, a deep-research pass was run to answer
the actual question properly: **on the published record, which sub-10B open-weight model is
best suited to this planner role?** Full report:
`tinkerquarry-planner-model-research-v1.0.md` (source of truth; this section adapts its content
inline so this document stays self-contained).

**Method:** a deep-research harness — 100 agents, parallel search across 5 angles, 15+ primary
sources fetched, every claim adversarially verified by 3 independent voters (2 of 3 votes to
refute kills a claim). 20 claims survived; 5 plausible-sounding claims were refuted and are
listed verbatim below so nobody cites them later.

### The ranking, with the numbers

1. **Qwen3.5-9B** — best in the sub-10B class on every relevant published axis:
   instruction-following IFEval **83.9**, multi-turn tool-calling BFCL v3 **70.5**,
   false-premise pushback BS-Bench **61–70**, Artificial Analysis Intelligence Index **32**
   (roughly double the next non-Qwen sub-10B). Sources: JetBrains' own Mellum2 report tables
   (arXiv [2605.31268](https://arxiv.org/abs/2605.31268) — numbers running *against* the
   vendor's interest), [artificialanalysis.ai](https://artificialanalysis.ai).
2. **Qwen3.5-4B** — nearly equal instruction-following (82.1), strong pushback (56.9–63),
   smallest footprint. Its predecessor Qwen3-4B **already beats our incumbent at text-to-JSON
   in peer-reviewed testing**: StructEval (*Transactions on Machine Learning Research*, TMLR —
   peer-reviewed) **90.96** vs qwen2.5-7B's **84.40**.
3. **qwen2.5:7b (incumbent)** — proven on our runtime, but outscored by the Qwen3 line on
   every published structured-output axis.
4. **Mellum2-12B-A2.5B** — decent tool-calling (66.3) but **disqualified for the planner
   role** by JetBrains' own report: BS-Bench 14–24 vs Qwen3.5's 56–70, with the authors'
   verbatim admission that "our SFT/RL signal leans toward compliance" (see Part 3). A planner
   must *reject* contradictory dimensions; compliance bias is precisely the wrong trait — and
   it is the published version of the exact failure the reviewer caught in Part 2 (60mm legs
   declared in a 40mm box, 8 holes where 4 were asked). Runtime support is also only ~6 weeks
   old in llama.cpp, with Ollama compatibility vendor-asserted, confirmed only for the Thinking
   variant, and known Q4_0 quant degradation.
5. **Seed-Coder-8B** — disqualified: no native tool calling, IFEval 56.2.
- **Gemma-4** — unrankable: zero claims about its capability *or* its Ollama zero-output
  breakage survived verification. The public record can neither confirm nor clear it.

### The most important finding (bigger than the ranking)

**Three independent 2026 studies converge: schema-valid JSON with WRONG VALUES is the
dominant failure mode.** One study found 102 of 104 hard-schema failures were wrong numeric
values inside perfectly valid JSON; another measured a frontier model at 99.97% schema-pass
but only 48.6% actually-correct responses; a third (run on Ollama, our runtime) concluded
"value fidelity, rather than structural compliance, is the main bottleneck." This validates
the whole arc of this report: the bake-off's grader measured validity (Part 1), the reviewer
caught values by hand (Part 2), and any future grading must check values. It also means
leaderboard JSON scores alone could never have picked our planner.

Bonus finding, same family: on a deterministic tool-call task, prompt-only schema instruction
beat hard grammar enforcement 91.5% to 48.0% on *executable correctness* while both were 100%
schema-valid — published support for TinkerQuarry's existing schema-instructed (not
grammar-enforced) design choice.

Also useful: a 22-model Ollama study found **prompting strategy often matters more than
parameter count** for structured extraction — planner-prompt engineering is at least as
high-leverage as the model swap.

### What the published record CANNOT answer (the justified residual)

1. **Cross-field numeric/dimensional consistency** (dims vs bounding box, exact feature
   counts) — measured by no benchmark, anywhere. Our core requirement.
2. **CPU reality**: every verified benchmark ran on GPU at full/high precision. No tokens/sec
   or Q4-quant behavior data exists for any candidate on a 16-thread CPU.
3. **Whether Qwen3.5-9B's Q4 working set (with KV cache) stays under ~10GB** at our context.
4. **The Gemma-4/Ollama zero-output bug** — publicly unconfirmed (our local observation
   stands, but it's ours alone).

These four are exactly the shape of a minimal local confirmation run: ~10 cases on our own
plan schema with value-level checks (the fidelity grader from Part 2), on the shortlist only
(qwen2.5:7b baseline vs Qwen3.5-9B vs Qwen3.5-4B), plus a RAM/speed measurement — roughly an
hour of local CPU, near-zero tokens.

### Refuted in verification — do NOT cite these

- "Qwen3.5-4B/9B show 80%+ hallucination rates on AA-Omniscience" (0–3 refuted)
- The 15,000-generation constraint-tax aggregate (0–3; only the specific calendar-task result stands)
- "JSONSchemaBench covers no TinkerQuarry candidate" as an absolute (0–3; treat as "not in main tables")
- The GitHub-Hard 0.13-coverage figure (0–3)
- The PJ+ 18-vs-1,597 failure counts (0–3)

### Decision menu (owner's call) and what was chosen

- **A (research-recommended):** run the ~1h local confirmation on the 3-model shortlist with
  value-level grading; if Qwen3.5 confirms, rework the flip.
- **B (chosen, 2026-07-15):** switch to Qwen3.5-9B on the published record alone, no local
  run — fast; accepts the four unmeasured residuals above.
- **C:** keep qwen2.5:7b, close out this line of work, bank the report for a later cycle.

Mellum2 is off the planner table under every option (JetBrains' own evidence, Part 3); it
remains a fine candidate for other roles (code completion/editing) if the product ever needs
one.

**The owner chose Option B.** The default flips to Qwen3.5-9B on the published record; the
smoke test and plan-check gates that shipped alongside this rework are the minimum real-pipeline
confirmation, not the full Option-A study — the four residuals above remain open follow-ups.

---

## What ships in this PR

- `config/default.yaml`'s `local` backend, `kimcad.config.DEFAULT_CHAT_MODEL`, the CLI/webapp
  advice fallbacks, and the built `kimcad.js` wizard copy all point at `qwen3.5:9b`.
- `model_advisor.py`'s `MODEL_CATALOG`: Qwen3.5-9B is the top tier (10 GB RAM floor — smaller
  than Mellum2's 12 GB, since Qwen3.5-9B's own working set is smaller); `qwen2.5:7b` stays the
  downshift target for smaller boxes, unchanged.
- `model_pull.py`'s disk-size estimate and the "not enough space" message reflect Qwen3.5-9B's
  smaller real footprint (~6.6 GB disk vs Mellum2's ~8.1 GB); the DOC-101 doc-vs-code headroom
  test and every doc that quoted the download/headroom figures move down together (11.1 GB/15 GB
  → 9.6 GB/14 GB).
- The `is_model_present` `:latest`-tag fix (ENG-1015) and its regression tests are
  **model-agnostic** and are kept as-is — they were never specific to which model is the
  default, only to whether a configured `model_name` carries an explicit Ollama tag.
- The `local_qwen2_5` fallback backend (the prior default, `qwen2.5:7b`) stays selectable,
  unchanged.
- The `cand_*` bake-off candidate backends (`cand_mellum2`, `cand_gemma26`, `cand_seedcoder`,
  `cand_gemma12`) stay defined and re-runnable; only their verdict comment changes, to point
  here.

## Evidence trail (all local to this box, except the cited external sources)

- Bake-off summary table: `output/bakeoff-v156/bakeoff.txt` (written by the harness).
- Bake-off per-case artifacts: `output/bakeoff-v156/<backend>/b01..b10/` — each holds
  `outcome.txt`, `plan.json`, `report.txt`, and `part.gcode.3mf` for completed cases (real
  sliced output; the G-code is inspectable). The b02 hole-count and the 60mm-legs/40mm-bbox
  cases cited in Part 2 are in `output/bakeoff-v156/cand_mellum2/`.
- Gemma empty-output reproductions: run live 2026-07-15 (native + OpenAI-compat probes).
- Slate verification (tags/licenses/sizes/viability, with citations): session research
  2026-07-15; key claims (registry tags, 8.1GB size, Apache-2.0) were independently
  spot-checked against ollama.com before any pulls.
- JetBrains Mellum2 technical report: arXiv [2605.31268](https://arxiv.org/abs/2605.31268),
  Table 9 (BS-Bench) and the authors' compliance-bias admission.
- Deep research report (Part 4, full form): `tinkerquarry-planner-model-research-v1.0.md` —
  100-agent harness, 20 claims surviving 3-vote adversarial verification, ~5.8M subagent
  tokens disclosed.
- Config backends used by the runs: `cand_*` entries in `config/default.yaml`. The prior
  default is preserved as the `local_qwen2_5` backend (`config/default.yaml`) for anyone who
  wants to re-run either comparison or prefers the smaller footprint.

## What's still not settled

- **The four research residuals from Part 4** — cross-field dimensional consistency (measured
  by no benchmark anywhere), CPU-specific speed/quant behavior, Qwen3.5-9B's real Q4 RAM
  working set under load, and an independent (non-local) confirmation of the Gemma-4/Ollama
  zero-output bug. A ~10-case local confirmation run with the fidelity grader from Part 2
  (qwen2.5:7b vs Qwen3.5-9B vs Qwen3.5-4B, value-level checks) is the recommended follow-up —
  Option A from Part 4's decision menu, not taken this round.
- **Vision lane:** the visual-correction-loop models (qwen3-vl:4b, qwen3-vl:2b, moondream vs
  the current qwen2.5vl:3b) are pulled and queued but not yet run (`scripts/bench_vision.py`).
  Separate verdict to come; nothing in this report depends on it.
- **PythonSCAD arm:** the roadmap's exploratory "LLM emits Python" arm was not part of this
  chat-lane run.
- **Gemma-4 on a newer Ollama** — follow-up as above.

## Questions another reviewer should feel free to attack

1. n=10 prompts is the repo's standing benchmark, not a statistically deep sample. The bake-off
   margin in Part 1 was consistent across axes, but Part 2 shows that consistency was measuring
   the wrong thing — a caution about trusting any single harness's own axes without a hand
   review.
2. Single run per model, no repeats — flakiness not characterized in either the bake-off or the
   fidelity re-grade.
3. The research verdict in Part 4 is itself unconfirmed on this product's own pipeline (Option B
   was chosen over Option A's local confirmation) — the four residuals are real, acknowledged
   gaps, not resolved ones.
4. Qwen3.5-9B is instruction-tuned for general use, not specifically for this product's schema —
   the StructEval and BFCL numbers are the closest published proxies available, not a direct
   measurement of TinkerQuarry's own plan schema.

## Reproducing / re-running

```
kimcad bakeoff --backends local_qwen2_5,cand_mellum2,cand_gemma26,cand_seedcoder,cand_gemma12
```

All candidate backends stay defined in `config/default.yaml` (see the `cand_*` entries and
`local_qwen2_5`, the prior default) so this comparison — or the Option-A local confirmation run
recommended in Part 4 — can be re-run without editing config first. See also
[MODEL-GUIDE.md](../MODEL-GUIDE.md) for the current, plain-English summary of which model runs
today and why, and [stage-6-model-bakeoff.md](stage-6-model-bakeoff.md) for the June round this
one supersedes.


## Part 5 addendum (2026-07-15, post-flip): thinking disabled on the plan call (PLAN-004)

After the flip shipped, the release gate failed twice on live plan calls (two different
prompts, two different runs): qwen3.5:9b occasionally returned truncated-mid-string or empty
JSON *despite* the grammar-constrained `format` field. Root cause, proven by direct /api/chat
metadata capture: qwen3.5 thinks by default, thinking and content share one `num_predict`
budget, and at the plan call's low temperature an occasional thinking repetition-loop consumed
the whole budget before (or during) content emission. Fix: the native plan call now sends
`think: false` (llm_provider._complete_native_schema) - probed 4/4 clean on qwen3.5:9b and
harmless on non-thinking qwen2.5:7b, and plan latency roughly halved (60-104 s vs 150-226 s).

**Measurement caveat this creates:** every number in Parts 1-2 was measured with thinking ON
(the then-production configuration). The shipped plan path now runs thinking OFF, so a future
bake-off re-run measures a slightly different configuration than these tables. The bench and
bake-off harnesses themselves stay raw single-shot on the plan step (plan_retries=0; the user
path retries an unparseable plan once - PLAN-003, PR #26).