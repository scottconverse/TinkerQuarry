# TinkerQuarry — Handoff to Codex (2026-06-22)

A single, reproducible handoff so the next agent can recreate state from a fresh terminal **without
chat history**. Written to be accurate over flattering. Cross-references:
[STATUS.md](STATUS.md) · [EVALUATE.md](EVALUATE.md) ·
[audits/honesty-audit-2026-06-22.md](audits/honesty-audit-2026-06-22.md) ·
[audits/v1-coverage-2026-06-22.md](audits/v1-coverage-2026-06-22.md).

- **Repo root:** `C:\Users\Scott\Desktop\CODE\tinkerquarry` (a git repo; it sits one level *under*
  `…\CODE`, which is NOT the repo root — beware relative-doc-link resolution).
- **This run:** 100 commits, `git log --grep Recovery` — from `22a283e` ("Recovery Phase 0: honest
  canonical repo") to the latest. The honesty/coverage audits are the most reliable state docs.
- **The one-sentence truth:** a **real, automated-tested manufacturing engine** wearing a
  **manually-checked-only v0.6 front end**, **missing its signature feature** (the Visual Correction
  Loop is 0 lines). See §1.

---

## 1. Current state summary

### What changed in this run
- Forked KimCad engine into `packages/engine`; absorbed OpenSCAD-Studio into `apps/ui` (branded,
  telemetry off). Wired the describe→engine→Studio-viewer loop; added Customizer-for-templates,
  refine-in-context, version history (save/list/reopen/delete/rename/duplicate), undo, live-readiness, offline banner
  (§9), first-real-print caution (§6.10 partial), printer/material picker (§6.9), a lightweight
  Explain toast, an accessibility sweep (jest-axe, 8 surfaces).
- **Fixed a real shipped bug:** the §6.12 reopen dropped the SCAD on the engine → `/api/source` 404 →
  silent FE failure. Now persisted + restored + regression-tested.
- **Honesty pass:** an adversarial audit found the FE "verified LIVE" claims were manual-only; corrected
  STATUS/EVALUATE; added the first real live-API integration test; corrected the false PNG-export claim;
  added the missing send-to-printer row.

### What is genuinely working (engine = automated-tested; FE = manual unless noted)
- **Engine (trust this layer — real automated HTTP tests):** describe→plan→geometry→gate→slice→G-code;
  render-on-tune; save→reopen→**source** round-trip; inline library resolution; per-boot CSRF token;
  SCAD sandbox; fail-closed gate; 6 connectors defined.
- **Front end (works, manually verified, mostly NOT automated):** describe surface → engine → viewer;
  Customizer slider tune + re-render; AI refine ("make it 80mm tall"); Make-it-real slices + downloads
  `.gcode.3mf`; printer/material picker (11/12 sampled printers slice; see §7); save/reopen/delete;
  Undo; offline banner; first-real-print caution; export (STL/OBJ/AMF/3MF/SVG/DXF + File▸Save `.scad`);
  the generated SCAD **is** shown in the Editor tab (verified live — a coverage-map claim to the
  contrary was wrong).

### What is still missing (measured against the PRD — see v1-coverage-2026-06-22.md for the full table)
- **The Visual Correction Loop (§6.3.1) — 0 lines.** The signature feature. Not "blocked on a key" —
  unbuilt. Acceptance test (wrong-face hole) cannot be run. (§5 documents the intended build.)
- **Send-to-printer UI + post-print outcome (§6.10):** `engine.send`/`engine.outcome` exist in
  `engineClient.ts`, **0 callers**. "Make it real" only downloads a file.
- **Manual orient override (§6.8); external-library admission (§6.11);
  per-iteration "what was tried" log (§6.12); tool-using "watch-it-work" agent (§6.3).**
- **Partial:** user-invoked Explain mode (only a toast); model picker (a toggle); diff/rollback
  (whole-design undo only, session-only); printer status/progress UI;
  first-run tool-health gate (unverified — no `FirstRunWizard` exists; managed model-download onboarding
  does).

### Manually verified vs automatically tested
- **Automatically tested:** the engine suite (real in-process HTTP + OpenSCAD), the front-end unit
  suite (`643` tests — but these **stub the network**), and **one** live-API integration test
  (`engineLive.integration.test.ts` — real HTTP to a running engine, NOT a browser flow).
- **Manual-only (one click + screenshot in-session, NO automated test):** every FE user flow above —
  describe→viewer, tune, make-it-real download, refine, save/reopen, undo, caution, offline banner,
  picker. **There is no `App.test.tsx` and no Playwright/browser test.** This is the precise gap that
  let the reopen bug ship green; treat FE "works" as "worked once when clicked."

---

## 2. Exact commands

> Shell: PowerShell on Windows. `pnpm` 10.12.4, Node v24.17.0. The engine venv is uv-managed (see §3).

### Run the engine (terminal 1)
```powershell
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"      # lets the vite proxy's fixed token authenticate POSTs
.\.venv\Scripts\kimcad.exe web --port 8765
# health: GET http://127.0.0.1:8765/api/health
```

### Run the front end (terminal 2)
```powershell
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev                                           # vite on :1420, proxies /api -> 127.0.0.1:8765
# open http://localhost:1420
```

### Commands that PASS (verified this run; logs in docs/handoff/proof/)
```powershell
# Front-end unit suite (network stubbed) -> 643 passed / 643
cd apps\ui ; node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js

# Front-end typecheck -> clean
cd apps\ui ; .\node_modules\.bin\tsc --noEmit

# LIVE API integration test (REQUIRES the engine running on :8765 with a saved design) -> 2 passed
#   it.skip's cleanly (shows SKIPPED, never a false green) when the engine is down
cd apps\ui ; node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js engineLive.integration

# Engine suite, e2e excluded (playwright not installed in the venv) -> see §7 for the exact pass/fail
cd packages\engine ; .\.venv\Scripts\python.exe -m pytest tests\ --ignore=tests\e2e -q
```

### Commands that FAIL / cannot run as-is
```powershell
# Engine FULL suite (without excluding e2e) -> COLLECTION ERROR: "No module named 'playwright'"
cd packages\engine ; .\.venv\Scripts\python.exe -m pytest tests\ -q
#   Fix: install dev extras + the browser, OR keep using --ignore=tests\e2e (see §3, §7).

# The 3 fork-policy engine tests FAIL by design (not product regressions) — see §7.
```

---

## 3. Engine environment setup

**The checked-out `.venv` is uv-managed and machine-specific — recreate it on any other machine.**

- **`.venv\pyvenv.cfg`** points at `home = C:\Users\Scott\AppData\Roaming\uv\python\cpython-3.13.14-windows-x86_64-none`
  (`uv = 0.11.23`, `version_info = 3.13.14`). It works on THIS box because that uv Python exists; it will
  break anywhere that path is absent. **`.venv` is gitignored (NOT committed)** — so "the checked-in
  venv is broken" really means "there is no portable venv; build one."

- **Python version:** **3.13+** required (`pyproject.toml: requires-python = ">=3.13"`; the working venv
  is 3.13.14).
- **Is `uv` required?** It's what was used and is the easy path (`uv 0.11.23` on PATH here). Not strictly
  required — any Python 3.13 + `pip` works.

**Recreate the venv (from `packages/engine`):**
```powershell
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
# Option A (uv — matches this machine):
uv venv --python 3.13
uv pip install -e ".[dev]"          # base deps + pytest/ruff; add the engine ('kimcad') console script
# Option B (stock Python 3.13):
py -3.13 -m venv .venv
.\.venv\Scripts\python -m pip install -e ".[dev]"

# For the e2e/browser tests (otherwise tests\e2e cannot collect):
.\.venv\Scripts\python -m playwright install chromium
```
- **Runtime deps** (`pyproject.toml`): `trimesh>=4.4`, `numpy>=2.0`, `scipy>=1.13`, `lxml>=5.0`.
  Optional extras: `bambu` (`bambulabs-api`), `serial` (`pyserial`), `dev` (pytest/ruff/playwright…).
  *(Note: the installed venv has newer pins — numpy 2.5.0, scipy 1.18.0 — than the fork-policy test
  expects; see §7.)*

**OpenSCAD & OrcaSlicer binary paths:**
- Resolution: `config/default.yaml` ships **relative** defaults (`tools/openscad/openscad.exe`,
  `tools/orcaslicer/orca-slicer.exe`) and is **overridden** by `config/local.yaml` (gitignored,
  machine-specific). On this machine `config/local.yaml` sets the absolute paths:
  ```yaml
  binaries:
    openscad: C:/Users/Scott/Desktop/CODE/_tools/openscad/openscad-2021.01/openscad.exe
    orcaslicer: C:/Users/Scott/Desktop/CODE/_tools/orcaslicer/orca-slicer.exe
  ```
  Both binaries exist under `C:\Users\Scott\Desktop\CODE\_tools\`. **On a fresh machine, create
  `config/local.yaml` with the real OpenSCAD/OrcaSlicer paths** (macOS/Linux examples are in the
  comments of `config/default.yaml`). The engine emits a UserWarning when a binary resolves outside the
  install root (harmless on this layout).
- The dev token: the engine reads `TINKERQUARRY_DEV_TOKEN` (`webapp.py`) and the vite proxy injects the
  same value (`apps/ui/vite.config.ts`), default `tq-dev-token`. Keep them equal.

---

## 4. Proof artifacts

> Honest framing: the **only automated, reproducible proofs** are the test logs below. The UI-flow
> "proofs" from this run were **live screenshots in the chat session — they were NOT saved to files.**
> To reproduce them, follow [EVALUATE.md](EVALUATE.md) step-by-step with both servers running.

**Saved logs (this run) — `docs/handoff/proof/`:**
- `frontend-suite.txt` — front-end unit suite, **643 passed**.
- `integration-test.txt` — live-API integration, **2 passed** (reopen→`/api/source` serves real SCAD;
  Prusa MK4 slice returns real G-code with the printer honoured).
- `engine-suite.txt` — engine pytest (e2e excluded); pass/fail in §7.

**Reproduce each UI flow (manual; from EVALUATE.md, both servers up):**
| Flow | How to reproduce |
|---|---|
| describe → viewer | prompt `a 70 mm round coaster, 4 mm tall`; part renders in the 3D viewer (~minute) |
| Make it real → download | toolbar **Make it real** → confirm caution → a `.gcode.3mf` downloads |
| Customizer tune | **Customizer** tab → drag a slider → geometry re-renders |
| save / reopen | **Save** → it appears under **My Designs** on the welcome screen → click to reopen |
| first-real-print caution | clear `localStorage['tq-printed-real']`, then **Make it real** → caution dialog |
| offline banner | stop the engine process → within ~25 s a red "engine isn't responding" banner appears |
| live integration test | run the integration command in §2 (engine must be up + a saved design exists) |

*(There is no screenshot directory because none was saved. If Codex wants durable visual proof, the
cheapest real artifact is the integration test log plus the engine pytest log — both automated.)*

---

## 5. Visual Correction Loop — intended cloud implementation (UNBUILT; this is the plan, not code)

Grounded in **PRD §6.3.1**, the spike result ([audits/vision-spike.md](audits/vision-spike.md)), and
the working reference script `packages/engine/spike-vision/critique.py` + fixtures. **Decision:** ship
**cloud-optional** — local `qwen2.5vl:3b` failed the critique 0/3 (always-"MATCHES" hallucination);
keep it only for the photo/sketch seeding on-ramp, not render critique. The *loop design* is identical
for local vs cloud; only the critique model + the honest mode label differ.

- **Provider/API/model (intended):** reuse the existing Vercel AI SDK plumbing already in
  `apps/ui/src/services/aiService.ts` (`@ai-sdk/anthropic`, `@ai-sdk/openai`) with a **vision-capable**
  model — e.g. Anthropic `claude-3-5-sonnet`/`claude-opus` (vision) or OpenAI `gpt-4o`. Use the same
  `AiProvider` + key store (`apiKeyStore.ts`). Recommend the **cloud-only** path runs the critique
  through the engine OR a thin FE call; the engine is the better home (keeps keys server-side and
  reuses the render pipeline). If routed through the engine, add a provider seam in
  `packages/engine/src/kimcad/llm_provider.py` (today it only exposes
  `generate_design_plan/generate_openscad/describe_photo/describe_sketch` — add `critique_views`).
- **Required env var / key name:** reuse the existing per-provider key (`ANTHROPIC_API_KEY` /
  `OPENAI_API_KEY`, surfaced via the Settings key store). If engine-side, read it from env (do NOT
  bake into config). Name the feature flag/mode in settings: `visualLoop: full-visual | text-only | off`.
- **Request shape (per `spike-vision/critique.py`, generalized to a chat-vision API):** inputs are the
  **intent string**, the **multi-view labeled PNGs** (front/back/top/sides/iso — already produced by
  `apps/ui/src/services/offscreenRenderer.ts`, currently **orphaned**; or render server-side via
  OpenSCAD), and the **validator/gate output**. Prompt: "Here is the user's intent + labeled rendered
  views of what was actually built + the validator output. Find spatial errors (wrong axis/face,
  floating features, missing cutouts, misalignment). Respond as JSON."
- **Response shape (intended):**
  ```json
  { "verdict": "approved | spatial_error",
    "findings": [{ "issue": "hole on front face, intent says top", "severity": "high" }],
    "proposed_edit": "natural-language or SCAD-diff instruction for the codegen to apply",
    "confidence": 0.0 }
  ```
- **Privacy copy (PRD-mandated honesty):** the UI MUST label the mode and never imply the model "saw"
  it when it didn't: **full-visual** = "the AI inspected rendered views"; **text-only** = "the AI
  reasoned from code + checks (no image)"; **off**. When cloud vision is used, disclose that rendered
  images leave the machine to the chosen provider (TinkerQuarry is otherwise local + telemetry-off).
- **Fallback behavior:** no key / vision unavailable / provider error → fall back to **text-only**
  critique (reason from code + gate output), labeled as such; never silently claim a visual pass.
- **Loop integration (PRD §6.3.1):** runs on the **LLM-codegen path only** (templates skip).
  - `pipeline.py` currently returns at the geometric gate (`_run_llm_backend` end). Insert a post-render
    **visual round loop** there: render → capture labeled views → `critique_views` → if `spatial_error`,
    feed `proposed_edit` back to `generate_openscad` → re-render → re-gate.
  - **Budget:** a SEPARATE round budget from render-error retries; default **3**, configurable.
  - **Best-candidate retention:** keep the best render across rounds by (gate + critique), **not the
    last**; a regressing round rolls back to best-so-far.
  - **Convergence/exit:** `approved` · `best-candidate after max rounds` · `fatal render error`. The
    geometric gate (§6.7) stays the final authority regardless of the loop's verdict.
  - **Logging:** every round records views/findings/edits/verdict into the **iteration log (§6.12)**
    (which also needs building — see §1) and is surfaced in the PRD §7.5 "Visual Correction view".
  - **User control:** accept current / force another round / stop; a dev inspector of what the AI saw.
  - **Acceptance test to add:** the `spike-vision/wrong_face.scad` fixture (passes the math gate, hole
    on the wrong face) **must be flagged** when vision is on. Wire it as an automated test gated on a
    cloud key (skip without one).

---

## 6. SCAD-library vendoring packet

**Status: seven libraries vendored.** `packages/engine/library/vendor/` now contains BOSL2,
Round-Anything, YAPP_Box, Catch'n'Hole, gridfinity-rebuilt-openscad, MCAD, and `tq-threads` with
attribution and pinned commits/tags. The manifest advertises them, sandbox admission is tested, and
real OpenSCAD smoke renders passed. Dan Kirshner `threads.scad` remains excluded for GPLv3
compatibility reasons; `tq-threads` pinned to post-`v0.2.0` commit `73aa7c0` is the clean-room MIT replacement.

> **2026-06-22 licensing decision:** TinkerQuarry remains GPL-2.0-only. Bundle only GPLv2-compatible
> libraries. Do **not** vendor Dan Kirshner `threads.scad` because the available source is
> GPL-3.0-or-later; use `tq-threads` or another GPLv2-compatible substitute.
> Before vendoring any approved library, pin a commit/tag and record the exact upstream URL, license text,
> SPDX id, and attribution.

| Library | Upstream | License | Notes / compatibility |
|---|---|---|---|
| **BOSL2** | github.com/BelfrySCAD/BOSL2 | BSD-2-Clause | Approved to vendor after pinning a commit. Large; consider selective include paths. |
| **Round-Anything** | github.com/Irev-Dev/Round-Anything | MIT | Approved to vendor after pinning a commit. |
| **YAPP_Box** | github.com/mrWheel/YAPP_Box | MIT | Approved to vendor after pinning a commit. |
| **Catch'n'Hole** | github.com/mmalecki/catchnhole | MIT | Approved to vendor after pinning a commit. |
| **gridfinity-rebuilt** | github.com/kennetek/gridfinity-rebuilt-openscad | MIT | Approved to vendor after pinning a commit. |
| **MCAD** | github.com/openscad/MCAD | LGPL-2.1 | Approved to vendor after pinning a commit and preserving LGPL notices/source. |
| **tq-threads** | github.com/scottconverse/tq-threads | MIT | Vendored at commit `73aa7c0` (post-`v0.2.0` review fixes) as the clean-room thread replacement. |
| **Dan Kirshner threads.scad** | dkprojects.net / mirrored source | GPL-3.0-or-later | **Do not bundle** in this GPL-2.0-only repo. |

**Proposed repo location:** `packages/engine/library/vendor/<lib-name>/` (kept separate from KimCad's
first-party modules so attribution + provenance stay clear). Add a `packages/engine/library/vendor/
ATTRIBUTION.md` with, per library: upstream URL, pinned commit, license, and the SPDX id.

**Sandbox / security notes (this is the hard part the PRD requires, §6.11/§13-C):**
- The renderer currently hard-codes an approved prefix (`openscad_runner.py`: `_APPROVED_PREFIX="library/"`)
  and strips out-of-library `include`/`use`. Vendored libs must live under that approved root (or the
  prefix logic extended) so the sandbox admits them.
- Vendoring third-party SCAD is a **supply-chain decision**: pin commits, record licenses, and (per the
  PRD) build the **admission flow** (consent → sandbox copy → include-path update → sanitization) before
  admitting *user-supplied* external libraries. Vendored-in-repo libs are lower-risk than user-admitted
  ones but still need the license/attribution discipline above. **Get the owner's explicit OK to
  download + redistribute each license before vendoring.**

---

## 7. Known test caveats

- **Engine suite result: `1559 passed, 14 failed, 101 skipped` (e2e excluded; ~10 min).** **All 14
  failures are repo-build / fixture / legacy-SPA setup — NOT manufacturing-product regressions** (the
  geometry/gate/slice/reopen/source/security tests are all in the 1559 pass; verified the 14 reference no
  slice/gate/render assertions). They fall in 5 groups, every one a KimCad-repo assumption that doesn't
  hold for the TinkerQuarry fork:
  - **5 × `test_bench_prompts.py`** — require `packages/engine/bench/prompts.yaml` (KimCad's Phase-1
    benchmark prompt set); the fork doesn't ship it.
  - **4 × `test_build_installer.py`** — require the Windows Inno-Setup installer pipeline
    (`scripts/build_installer.py`, `installer/kimcad.iss`) + the dependency lock; the fork doesn't build
    a Windows installer.
  - **3 × `test_frontend.py::test_frontend_source_*`** — check the engine's **legacy standalone SPA**
    (`packages/engine/frontend/`), which is not the product front end (Studio is) and wasn't fully forked.
  - **1 × `test_project_hygiene.py::test_lockfile_pins_python313_numpy_wheel_floor`** — wants
    `requirements.lock` pinning `numpy==2.2.6`/`scipy==1.17.1`; the lock **doesn't exist** and the fork
    runs newer (numpy 2.5.0 / scipy 1.18.0).
  - **1 × `test_version_single_source.py::test_frontend_package_version_is_in_lockstep`** — legacy-SPA
    version lockstep.
  > **Honesty note:** an earlier doc (and STATUS, now being fixed) said "**3** fork-policy fails." That
  > was an **undercount** from a truncated log — the full suite shows **14**. The full failing list is in
  > `docs/handoff/proof/engine-suite.txt`. **Decision needed:** regenerate a fork `requirements.lock`,
  > and either retire the legacy-SPA / installer / bench tests for this fork or restore those assets.
  > (Two other earlier hygiene fails — missing SECURITY.md and `.gitignore` audit patterns — were
  > genuinely fixed this run.)
- **Skipped / can't-collect:** `tests/e2e` (Playwright) **cannot collect** in the current venv ("No
  module named 'playwright'"). Run engine tests with `--ignore=tests\e2e`, or install dev extras +
  `playwright install chromium` (§3). Front-end e2e: none exists.
- **Manual-only verification:** see §1/§4 — every FE user flow. No `App.test.tsx`.
- **Live-test requirement:** `engineLive.integration.test.ts` only runs its assertions when the engine
  is up **and** at least one design is saved; otherwise it `it.skip`s (visible skip, not a false pass).
- **The picker has one broken profile:** 11/12 sampled printers slice; **`elegoo_neptune_4_max` fails**
  (`orca-slicer exited -51` — upstream relative-extruder/`G92 E0` profile bug). The engine surfaces the
  failure (`sliced:false`, reason). Consider filtering un-sliceable profiles from the picker.
- **CI:** **none.** There is no `.github/workflows/` and no `ci.yml` in this repo (the pyproject
  comments referencing `ci.yml` are inherited from upstream KimCad and do not apply here). **All checks
  are LOCAL-ONLY.** Standing up CI (run the front-end suite, typecheck, and the engine suite with
  `--ignore=tests/e2e`; optionally the live integration test against a spun-up engine) is itself a
  worthwhile task.

---

## 8. Docs cleanup checklist (stale / contradictory — for Codex to fix)

> **Codex takeover update, 2026-06-22:** the highest-risk cleanup items are now fixed inline:
> `README.md` and `docs/EVALUATE.md` were rewritten for the current canonical repo, `docs/STATUS.md`
> was updated with the settled GPL/thread-library decision, and
> `docs/audits/v1-coverage-2026-06-22.md` no longer repeats the stale code-drawer,
> `FirstRunWizard.tsx`, or one-snapshot version-history claims. Remaining checklist items below should
> be read as historical handoff notes unless still demonstrably true.

> Per the handoff request these are **identified, not yet fixed** (no product changes were made beyond
> producing this note). Nothing was deleted.

- [ ] **`README.md` (top-level) is badly stale — highest priority.** It still says: "high-fidelity
  static prototype (`frontend/index.html`)", "dependency-free mock API (`backend/mock_api.py`)", "**the
  product … is not built**", and "**the real manufacturing engine lives in the sibling repo
  KimCadClaude**." All false post-recovery (engine is in `packages/engine`; app is in `apps/ui`). It
  also links the PRD at `docs/prd/TinkerQuarry-PRD-v0.3.md` and a design at `docs/design/…` — **verify
  those paths exist** (the PRD this run used is at `…\CODE\TinkerQuarry-PRD-v0.3.md`, outside the repo).
  Rewrite the README to point at STATUS.md + this handoff.
- [ ] **`docs/audits/v1-coverage-2026-06-22.md` is internally inconsistent.** Its top has a corrections
  header (3 items), but the pasted map **body still repeats those exact wrong claims** (code-drawer
  "unreachable", `FirstRunWizard.tsx`, "one snapshot overwritten"). Apply the corrections **inline** in
  the body (strike/annotate net-new #2, #4, #5) so header and body agree. The header is correct; the
  body lines are the stale ones.
- [ ] **`docs/EVALUATE.md` — PNG already removed** this run (it previously claimed PNG export, which is
  false); re-verify no "verified"/"done" overclaims remain.
- [ ] **Sweep `STATUS.md` + all `docs/` for "verified LIVE" wording** and confirm each now reads as
  "manually checked once / no automated coverage" unless an automated test truly exists (engine rows
  are fine; FE rows should not imply a safety net). The honesty banner at the top of STATUS is the
  reference standard.
- [ ] **Reconcile prior `docs/audits/prd-audit-1..5` + `PRD-GAP-REPORT.md`** against
  `v1-coverage-2026-06-22.md` (the prior audits predate most of the recovery; mark them as historical
  baselines so a reader doesn't treat them as current).
- [ ] **`docs/STATUS.md` "Source: the merged PRD audit"** header references `audits/prd-audit-1…5` — fine
  as provenance, but add a pointer to this handoff + the coverage map as the current truth.

---

### Quick-start for Codex (TL;DR)
1. Read this file, then `STATUS.md`, then `audits/v1-coverage-2026-06-22.md` (ignore the README until
   it's rewritten).
2. Recreate the engine venv (§3); create `config/local.yaml` with your OpenSCAD/OrcaSlicer paths.
3. Start the engine (§2 terminal 1) + the front end (§2 terminal 2); open `:1420`.
4. Run the checks (§2). Expect FE **643 pass**, integration **2 pass**, engine **1559 pass / 14 fail**
   (all 14 are repo-build/legacy-SPA setup, not product — see §7).
5. The real work that remains: the **Visual Correction Loop** (§5), the **send-to-printer/outcome UI**,
   the **automated FE/browser tests**, and the doc cleanup (§8). The engine underneath is solid.
