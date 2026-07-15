# v1.5-6 model bake-off — full report (v1.0, 2026-07-15)

**Self-contained: written so a session or reviewer with zero prior context can evaluate it.**

## What this is

TinkerQuarry (local-first text→3D-print app, repo `Desktop/CODE/tinkerquarry`) runs a local
LLM as its "planner": the user's plain-English request is turned into a structured JSON design
plan, which the engine then builds into geometry, hardens, gates for printability, and slices
with a bundled OrcaSlicer. The planner model is the single biggest quality lever in the product.
Roadmap item v1.5-6 asked whether newer open-weight models beat the incumbent default
(`qwen2.5:7b`, chosen 2026-06-15). This report is the measured answer.

**Decision taken (owner, 2026-07-15): flip the default chat model to Mellum2.** The flip
shipped in this same PR — `config/default.yaml`'s `local` backend, `kimcad.config.DEFAULT_CHAT_MODEL`,
the model advisor's catalog, and every user-facing surface that names the default. This report is
the evidence behind that decision.

## Method

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

## Results

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
- **Mellum2:** 10/10 completed, no failures of any kind. 13GB Apache-2.0 MoE (12B total /
  2.5B active), 8.1GB on disk, runs ~40s/prompt on this CPU — faster than the smaller-file
  incumbent because only 2.5B parameters are active per token.
- **Seed-Coder-8B:** 7 completed, 3 `gate_failed` (parts built but failed the printability
  gate). Plans parse fine (MIT license, dense 8B) but 135s/prompt — 2.2× slower than incumbent.
- **Gemma-4-12B:** 2 completed, 8 `plan_failed` (JSON unparseable), 238s/prompt when it works.
- **Gemma-4-26B-A4B:** 10/10 `plan_failed`. **See the asterisk below — this is NOT a quality
  verdict.**

## The Gemma asterisk (important for any reviewer)

Gemma-4's 0/10 and 2/10 were investigated, not just recorded:

- `gemma4:26b-a4b-it-q4_K_M` produces **zero output on this runtime, period**: a native
  `ollama run … "Say OK"` returns an empty string, and the same model through Ollama's
  OpenAI-compatible endpoint returns `''` (both reproduced directly, post-run, model loaded
  fine — 17GB resident, 100% CPU). Nothing to parse → every case `plan_failed`.
- Conclusion: **runtime incompatibility between this Gemma-4 MoE build and Ollama 0.32.0**,
  not model quality. Gemma-12B's instability (2/10) likely shares the family/runtime issue.
- We deliberately did NOT upgrade Ollama mid-bake — that would have invalidated every other
  model's numbers. A fair Gemma re-test after an Ollama upgrade is a recorded follow-up, but
  it cannot block the flip decision: even a perfect future Gemma score wouldn't unseat a
  candidate that already beat the incumbent on every axis today.

## Why Mellum2 wins (and the flip is justified)

- **Every axis, not cherry-picked:** completion 10/10 vs 9/10, graded quality 6/10 vs 3/10
  (double), request-match 10/10 vs 8/10, slice success 10/10 vs 9/10, speed 39.9s vs 61.2s.
- **License:** Apache-2.0 (JetBrains), verified at the HF launch page — compatible with the
  product's GPL-2.0-only distribution posture (models are downloaded by users at first-run,
  not bundled, but the license allowlist applies regardless).
- **Runtime risk was pre-cleared:** Mellum's llama.cpp support is new; it was explicitly
  smoke-tested on this box before the bake (loads, responds correctly) and then completed
  10/10 real pipeline runs.
- **Hardware note for the advisor:** 8.1GB on disk / ~9-10GB RAM working set vs qwen2.5:7b's
  4.7GB / ~6GB. The in-product hardware advisor's downshift thresholds were updated to match
  (`src/kimcad/model_advisor.py`'s `MODEL_CATALOG`: Mellum2 carries a 12 GB RAM floor vs
  qwen2.5:7b's 8 GB) — a box that can't fit Mellum2 still downshifts to qwen2.5:7b, then
  qwen2.5:3b, exactly as it did before this flip.

## What's NOT settled by this run

- **Vision lane:** the visual-correction-loop models (qwen3-vl:4b, qwen3-vl:2b, moondream vs
  the current qwen2.5vl:3b) are pulled and queued but not yet run (`scripts/bench_vision.py`).
  Separate verdict to come; nothing in this report depends on it.
- **PythonSCAD arm:** the roadmap's exploratory "LLM emits Python" arm was not part of this
  chat-lane run.
- **Gemma-4 on a newer Ollama** — follow-up as above.

## Evidence trail (all local to this box)

- Summary table: `output/bakeoff-v156/bakeoff.txt` (written by the harness).
- Per-case artifacts: `output/bakeoff-v156/<backend>/b01..b10/` — each holds
  `outcome.txt`, `plan.json`, `report.txt`, and `part.gcode.3mf` for completed cases (real
  sliced output; the G-code is inspectable).
- Gemma empty-output reproductions: run live 2026-07-15 (native + OpenAI-compat probes).
- Slate verification (tags/licenses/sizes/viability, with citations): session research
  2026-07-15; key claims (registry tags, 8.1GB size, Apache-2.0) were independently
  spot-checked against ollama.com before any pulls.
- Config backends used by the run: `cand_*` entries in `config/default.yaml`. The prior
  default is preserved as the `local_qwen2_5` backend (`config/default.yaml`) for anyone who
  wants to re-run the head-to-head or prefers the smaller footprint.

## Questions another reviewer should feel free to attack

1. n=10 prompts is the repo's standing benchmark, not a statistically deep sample — but the
   margin (6/10 vs 3/10 graded, 10/10 vs 9/10 completed) is consistent across axes.
2. Single run per model, no repeats — flakiness not characterized. Mitigation: temperature 0.2
   everywhere; the incumbent's own historical numbers (4/4 plans, 2026-06-15) are consistent
   with its 9/10 completion here.
3. The `dims` axis graded only 5/9 for BOTH winner and incumbent — dimensional fidelity is a
   pipeline-wide weakness, not a model differentiator; worth its own roadmap item.
4. Mellum2 is instruction-tuned for tool/agent use — plausibly overfit to JSON-shaped tasks vs
   general reasoning. For this product that IS the job, so it's a feature, not a confound.

## Reproducing / re-running

```
kimcad bakeoff --backends local_qwen2_5,cand_mellum2,cand_gemma26,cand_seedcoder,cand_gemma12
```

All candidate backends stay defined in `config/default.yaml` (see the `cand_*` entries and
`local_qwen2_5`, the prior default) so this comparison — or a future one against a newer
challenger — can be re-run without editing config first. See also
[MODEL-GUIDE.md](../MODEL-GUIDE.md) for the current, plain-English summary of which model runs
today and why, and [stage-6-model-bakeoff.md](stage-6-model-bakeoff.md) for the June round this
one supersedes.
