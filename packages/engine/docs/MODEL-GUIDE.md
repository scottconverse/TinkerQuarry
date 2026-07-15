# KimCad model guide — which AI runs, and why

KimCad ships with two local models, both running via [Ollama](https://ollama.com) on your
own machine (CPU-only; no graphics card needed). Neither choice is folklore — each was
measured on the reference hardware, and the benchmark harness ships in the repo so every
number below stays re-checkable.

| Role | Model | Ollama tag | Size | Why this one |
|---|---|---|---|---|
| **Chat / design planning** — your words → a validated design plan, and the (opt-in) experimental geometry | Mellum2 | `JetBrains/mellum2-instruct-q4_k_m` | ~8.1 GB | Won the v1.5-6 bake-off on every axis: 10/10 completed, 6/10 graded, 39.9s mean (below) |
| **Vision** — reads photos and dimensioned sketches into editable seeds | Qwen 2.5 VL 3B | `qwen2.5vl:3b` | ~3 GB | The dedicated vision reader; the chat model's vision path produces empty output on this stack (measured, Stage 9) |

The setup wizard downloads both with live progress; everything afterward runs offline.

## The chat-model decision, round 2 (v1.5-6 bake-off, 2026-07-15)

Roadmap item v1.5-6 asked whether a newer open-weight model beats `qwen2.5:7b` (the round-1
default, below). Five backends ran the real `kimcad design` pipeline — build, render, gate,
slice — on all 10 benchmark prompts:

| Backend | Completed | Graded (3-axis) | Match | Slice | Mean time | Notes |
|---|---|---|---|---|---|---|
| **`cand_mellum2` (new default)** | **10/10** | **6/10** | 10/10 | 10/10 | **39.9s** | MoE 12B/2.5B-active, Apache-2.0; beat the incumbent on every axis |
| `local_qwen2_5` (prior default, `qwen2.5:7b`) | 9/10 | 3/10 | 8/10 | 9/10 | 61.2s | 1 render_failed; still the fallback for smaller boxes |
| `cand_seedcoder` | 7/10 | 4/10 | 8/10 | 7/10 | 135.1s | MIT, dense 8B; 2.2x slower |
| `cand_gemma12` | 2/10 | 2/10 | 2/10 | 2/10 | 238.4s | mostly `plan_failed` |
| `cand_gemma26` | 0/10 | 0/10 | 0/10 | 0/10 | n/a | runtime asterisk — see the full report, not a quality verdict |

**Mellum2 is now the default** — it won on every measured axis (completion, graded quality,
request-match, slice success, *and* speed), is Apache-2.0, and was smoke-tested for runtime
compatibility before the bake. Its footprint is a real step up from qwen2.5:7b (~8.1 GB disk,
~9-10 GB RAM working set vs ~4.7 GB / ~6 GB), so the hardware advisor's RAM floor was raised to
match — a box too small for Mellum2 downshifts to `qwen2.5:7b`, exactly as before. Full report,
per-case failure modes, and the Gemma-4/Ollama-0.32.0 runtime asterisk:
[stage-v156-model-bakeoff.md](benchmarks/stage-v156-model-bakeoff.md).

## The chat-model decision, round 1 (on-machine bake-off, 2026-06-15)

The planner is chosen by **measured merit on the target box, not by origin** — KimCad runs
fully offline through Ollama, so a model's origin carries no data-governance weight (nothing
leaves the machine). Each candidate ran the real `kimcad design` pipeline on the same prompts:

| Backend | Planned (renders + passes the gate) | Notes |
|---|---|---|
| **`qwen2.5:7b`** (the default 2026-06-15 – 2026-07-15; now `local_qwen2_5`) | **4/4** | the strongest on-device planner that fits a typical box |
| `gemma4:e4b` | 1/4 | simple template prompts only; hosts the vision model + non-China fallback |
| `llama3.1:8b` | 0/4 | correct plans wrapped in prose the parser rejected (see the grammar fix) |
| `qwen3:8b` | rejected | thinking mode too slow on CPU; `/no_think` returns empty |
| `gemma4:12b` | flaky / ~2× slower | not a drop-in |

Two findings drove that round's change. **First, the failures were mostly a JSON-*format*
problem, not raw incapability** — `llama3.1:8b` and `gemma4:e4b` produced *correct* plans but
wrapped them in prose, `//` comments, or fences that broke `json.loads`. The fix: design-plan
calls to a local Ollama backend are now **schema-constrained at the token level** (Ollama's
native `format`), which rescues weaker models on simpler prompts and makes the whole path
robust. **Second, the earlier "Qwen rejected 0/10" verdict tested `qwen2.5-coder`** — a
*code-completion* model that echoes the schema instead of planning. The general **instruct**
model (`qwen2.5:7b`) was the right tool and won outright that round — and, as the round-2 table
above shows, still stays selectable as the smaller-footprint fallback (`local_qwen2_5`).
`gemma4:e4b` stays as the non-China fallback (and still hosts the vision reader); the advisor
downshifts smaller boxes to `qwen2.5:3b`. Earlier write-up (superseded twice over for the chat
model — first by round 1, now by round 2 above): [stage-6-model-bakeoff.md](benchmarks/stage-6-model-bakeoff.md).

## The vision-model decision (Stage 9)

`gemma4:e4b` advertises vision, but on this serving stack its image path spends the whole
token budget "thinking" and returns empty content — measured, not assumed. The dedicated
`qwen2.5vl:3b` reads both photos and dimensioned sketches reliably, so vision gets its own
small model. Write-up: [stage-9-vision-onramps.md](benchmarks/stage-9-vision-onramps.md).
Images are **always processed locally** and never leave the machine.

## What to expect, practically

- **Latency:** roughly one to two minutes for the AI planning step of a fresh design on the
  reference hardware (a recent CPU, 32 GB RAM); template parts then re-render from the
  sliders instantly with no model call. The first design after a cold start is the slowest
  (the model is loading).
- **There is no model menu.** KimCad ships THE measured default rather than a picker — a
  trust rule, not a limitation (an untested model choice would silently change quality).
  Power users can still point a different backend via `config/local.yaml` and `--backend`,
  and `local_qwen2_5` (the prior default) plus `local_qwen` stay defined so either comparison
  can be re-run.
- **Cloud (opt-in only):** Settings → Cloud acceleration routes *prompts* (never images) to
  a model you choose via OpenRouter, with your own key, for hard requests. Local always
  works; a wrong cloud slug falls back to local rather than failing the design.

## Re-running the measurements

```
kimcad bench --min-success-rate 0.8     # the 10-prompt done-gate against the current model
kimcad bakeoff --backends local,local_qwen2_5   # v1.5-6 head-to-head, 3-axis graded
kimcad bakeoff --backends local,local_qwen      # Stage-6 head-to-head, 3-axis graded
```

Both write their verdicts under `output/`; the lesson from Stage 6 is institutional now:
**measure on the current model rather than trusting a stale figure.**
