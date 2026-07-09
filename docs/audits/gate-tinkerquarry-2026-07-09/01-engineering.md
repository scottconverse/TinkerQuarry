# Principal Engineer deep-dive — TinkerQuarry v1.4.0 gate (2026-07-09)

Scope: `git diff v1.3.1..HEAD` (158 files, +8066/-6767) plus the public release surfaces.
Focus: architecture, correctness, security, performance, dependencies. Root-cause diagnosis
requested for walkthrough findings W-1 and W-4 (see
`docs/audits/gate-tinkerquarry-2026-07-09/walkthrough-report.md`).

## What's working

- **Reverse-import request handling is defensively solid** (`packages/engine/src/kimcad/webapp.py:2670-2810`):
  bounded body size (`MAX_REVERSE_IMPORT_BYTES`), filename sanitized to `[A-Za-z0-9._ -]`
  (`re.sub` at line 2676) before ever touching the filesystem, extension allowlisted to
  `.stl/.3mf/.obj`, a `BoundedSemaphore` caps concurrent imports (line 933), every exception path
  is caught and turned into a typed JSON response (no traceback leak to the browser), and the
  temp directory is cleaned up (`shutil.rmtree`) on every rejection path.
- **The reverse-import matcher (`packages/engine/src/kimcad/reverse_import.py`) is honestly
  conservative**: it never freehands geometry from a mesh — it matches a measured bbox to a
  known template family, then requires an independent volume/surface-area agreement
  (`geometry_signature_matches`, tolerance 8%/18%) before accepting the match. A solid block and a
  hollow box sharing an envelope will not be confused for each other. Good defense against
  silently mis-identifying uploaded geometry.
- **`native-release.cmd`'s `LaunchDevCmd.bat` → `VsDevCmd.bat` fix is a real, well-diagnosed bug
  fix**, not just churn: the comment documents a concrete 76-minute unattended-release hang caused
  by `LaunchDevCmd`'s interactive `cmd /k` prompt, and the fix avoids `vswhere`-in-`for /f`
  entirely to sidestep a documented quoting break on `%ProgramFiles(x86)%`'s parenthesis inside a
  parenthesized `if` block — a real batch-scripting gotcha, correctly worked around.
- **`smoke-tauri-runtime.mjs`'s stale-profile fix is grounded in an observed symptom**: the
  comment records that the smoke reported engine 0.9.3 while the fresh installer shipped 0.9.4,
  root-caused to `ensure_engine` reusing a leftover `TinkerQuarryAppData` profile; the fix
  (`rmSync` the default profile before each unmanaged run) directly addresses that, and
  `evaluateWithNavigationRetry` is a targeted fix for a real first-run race (`page.title()`
  during an in-flight navigation).
- **`ModelPullJob` (`packages/engine/src/kimcad/model_pull.py`) itself is careful**: idempotent
  single-flight (`_thread.is_alive()` guard), a pre-flight disk-space check that fails BEFORE
  bytes move, `"done"` requires Ollama's terminal `success` line rather than a clean stream close
  (guards against a silently-truncated pull reading as success), and per-model failures don't
  block the other model's pull. The `_ENGINE_ROW` progress callback (`_prog`, lines 271-274)
  genuinely does track `completed`/`total` bytes for the portable-runtime fetch — the backend half
  of W-1 is implemented correctly.
- **`ProvenancePanel`'s "Model and gate" section correctly sources the engine's own
  `/api/model-status`** (`workspaceModelStatus?.model`/`.backend`) rather than any
  client-side-only signal — this is the pattern the buggy `ModelSelector` (W-4, below) should have
  followed.

## Findings

### W-1 root cause (Major, confirms/extends walkthrough) — model-pull progress: response-shape mismatch between engine and UI

**Where:** `packages/engine/src/kimcad/webapp.py:1200-1202` (`GET /api/model-pull/progress` returns
`pull_job.snapshot()` verbatim) and `:2022-2023` (`POST /api/model-pull` returns
`{"status": "ok", **snap}`), vs. the consumer at
`apps/ui/src/components/WelcomeScreen.tsx:496-505` and the type at
`apps/ui/src/services/engineClient.ts:42-52`.

**The defect:** `ModelPullJob.snapshot()` (`packages/engine/src/kimcad/model_pull.py:110-123`)
returns a **nested, per-row** shape:
```json
{"running": true, "models": {"AI engine": {"status": "pulling", "completed": 512000000, "total": 1000000000, "error": ""}}}
```
But `ModelPullProgressResult` (the TS type both endpoints are typed as returning) declares a
**flat** shape — `status?`, `phase?`, `detail?`, `percent?`, `completed?`, `total?`, `done?` all at
the top level (`engineClient.ts:42-52`) — and `WelcomeScreen.tsx` renders exactly those top-level
fields:
```tsx
{modelPull.detail || modelPull.phase || modelPull.status}
{typeof modelPull.percent === "number" ? ` ${Math.round(modelPull.percent)}%` : ""}
```
None of `detail`/`phase`/`status`/`percent` ever exist on the real response — the actual data
lives one level down, at `modelPull.models["AI engine"].completed/total/status`. The engine-row
progress the backend faithfully tracks (`model_pull.py:271-274`) is computed correctly and shipped
over the wire correctly, and then **discarded** by a frontend that reads a field name the backend
never produces. This is not a missing feature — it is two sides of the same feature written
against two different (undocumented, never-shared) contracts.

**Second-order bug, same root cause:** `WelcomeScreen.tsx:291-299`'s poll loop only clears itself
on `r.data.done || r.data.status === "done" || r.data.status === "error"` — none of which are ever
true on the real snapshot shape either. The 1-second `setInterval` (`WelcomeScreen.tsx:280`) has no
`useEffect` cleanup and is never cleared by this condition, so once "Set up local AI" is clicked
the poll runs for the lifetime of the component regardless of whether the models finish, hitting
`/api/model-pull/progress` every second indefinitely (harmless load-wise, but a real resource leak
and a second symptom of the same shape mismatch — `modelReady` only flips via the *separate*
`refreshModelStatus()` call in the `finally`-style completion branch, which never fires here).

**Impact:** every new user without a pre-installed Ollama (the wide-beta default cold-start path)
sees zero percent/byte/phase feedback for the multi-minute (210 s+ for ~953 MB observed) portable
runtime download — matches the walkthrough's observed "static Setting up..." for the whole window.

**Fix path:** either (a) have the two `_handle_model_pull*` handlers in `webapp.py` project the
`_ENGINE_ROW` (and/or the single in-flight model row) into the flat `status/phase/detail/percent`
shape `ModelPullProgressResult` already declares, computing `percent = completed/total*100` server
side, or (b) change `ModelPullProgressResult` and `WelcomeScreen.tsx`'s renderer to consume the
real nested `{running, models}` shape directly (iterate `Object.entries(modelPull.models)` and
render each row's completed/total). Either fixes the poll-loop leak for free, since `done`/`status`
would then reflect real data. Given `ModelPullProgressResult` is otherwise unused elsewhere in the
diff, (a) is the smaller change — one small `_snapshot_payload()` helper shared by both GET and
POST handlers.

### W-4 root cause (Minor, confirms walkthrough) — workspace AI panel reads the wrong connectivity source

**Where:** `apps/ui/src/components/ModelSelector.tsx:91-96` (the "Local or cloud AI not connected"
branch) fed by `apps/ui/src/hooks/useModels.ts:239-323`, versus the actual working connection
state at `apps/ui/src/services/engineClient.ts` `ModelStatusResult` /
`/api/model-status` (correctly consumed by `ProductEvidencePanels.tsx:417-419`
`workspaceModelStatus?.model`/`.backend`).

**The defect:** TinkerQuarry has two, independent notions of "is AI connected":

1. **Server-side (real):** the kimcad engine's own configured backend (Ollama at
   `127.0.0.1:11434`, or a cloud key held server-side) — this is what actually ran the design that
   just succeeded, surfaced via `GET /api/model-status`.
2. **Client-side (browser-local, BYOK):** `apiKeyStore.ts`'s `getAvailableProviders()`
   (`apiKeyStore.ts:177-183`), used by `useModels.ts` to call cloud model-listing endpoints
   directly from the browser (`https://api.anthropic.com/v1/models`,
   `https://api.openai.com/v1/models`, or a locally-configured OpenAI-compatible `/models`).

`ModelSelector` — mounted in the **workspace** AI panel via `AiPromptPanel.tsx:939-946`, not just
the welcome screen — is wired to source #2 only. `isProviderConfigured('openai-compatible')`
(`apiKeyStore.ts:170-175`) requires an **explicitly saved** `openscad_studio_openai_compatible_base_url`
in `localStorage` (`hasOpenAiCompatibleConfig`, line 163-168) — not the same-named default the
engine itself uses. A session where the design ran through the engine's own local Ollama
connection (server config, e.g. env var or first-run defaults) without ever writing that
particular localStorage key never populates `availableProviders` with `'openai-compatible'`, so
`useModels` fetches nothing, `hasModels` is `false`, and line 94's fallback renders — even though
the model that just built the part is demonstrably connected. This matches the walkthrough
exactly: "workspace AI panel showed not connected... while the model was demonstrably connected."

**Why it doesn't block the flow:** `ModelSelector`'s `disabled` prop is only tied to `isStreaming`
(`AiPromptPanel.tsx:946`), and the actual submit gate (`canBuildLocalDraft` /
`hasCurrentModelApiKey` in `App.tsx`) is computed independently — so this is a display-only
inconsistency, not a broken flow. That's why Minor is the right severity, matching the
walkthrough's call.

**Fix path:** either (a) pass the engine's real `ModelStatusResult` into `ModelSelector`/
`AiPromptPanel` and have the "not connected" fallback check `workspaceModelStatus` (already
plumbed to `ProductEvidencePanels.tsx`) before falling back to the client-only provider list, or
(b) when the engine reports a local backend as connected, synthesize an `'openai-compatible'`
entry into `availableProviders` so `useModels` actually queries it. (a) is more honest: it stops
implying the browser holds a BYOK key for a connection the server is actually managing.

### Major — duplicate `pytest_collection_modifyitems` silently disables the new browser-skip guard

**Where:** `packages/engine/tests/conftest.py:127-140` and `:198-218`.

**The defect:** the diff adds a new module-level function
`def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:` at
line 127, whose entire purpose (per its own docstring) is: *"Without this, pytest can fail while
resolving the plugin's `page` fixture before `pytest_runtest_setup` has a chance to evaluate the
`needs_browser` marker."* A second, pre-existing function with the **exact same name**
(`def pytest_collection_modifyitems(config, items):  # noqa: ARG001`, geometry-backends check) is
defined later in the same module at line 198. Python module execution simply rebinds the name —
pytest only ever registers the **second** definition as the hook; the first one (lines 127-140) is
dead code that is never called by pytest, silently.

**Why it matters:** `scripts/run-engine-pytest.mjs` (the new release-gate script,
`pnpm test:gate`, added in this diff) runs `pytest -q --strict-no-skips` with **no `-m` filter** —
unlike the hosted CI lane (`.github/workflows/ci.yml`), which explicitly deselects
`needs_browser` via `-m "not ... and not needs_browser"` and is therefore unaffected. On a machine
without `pytest-playwright` installed (exactly the scenario this new function was written to
handle — "a fresh clone / the hosted fork-PR smoke" per the neighboring `_browser_available`
comment), `tests/e2e/*` items marked `needs_browser` are collected (they're under `testpaths =
["tests"]`, `pyproject.toml:82`) and will error trying to resolve the plugin-provided `page`
fixture instead of being cleanly skip-marked before collection — reproducing precisely the failure
mode the added function's docstring says it exists to prevent.

**Impact scope:** the engine release-gate lane (`pnpm test:gate` / `run-engine-pytest.mjs`) on any
box lacking `pytest-playwright` — plausible for a contributor machine or a leaner release-gate
runner, which per the `cadquery_runner.py` diff in this same release ("a zero-skip release gate...
instead of mutating the user's global Python install") is a scenario this release is actively
trying to support. Hosted GitHub Actions CI is not affected (its `-m` filter deselects these tests
before fixture resolution regardless).

**Fix path:** rename one of the two functions' bodies into a single combined
`pytest_collection_modifyitems` (call `_geometry_backends_status()`-based logic, then the
browser-skip logic, in one function), or merge by having one call the other explicitly. This is a
5-line fix; the risk is that it currently fails silently — nothing else here would tell a reviewer
the intended fix No-ops.

### Minor — `cadquery_runner.py` probe timeout raised 90s → 240s with no `--strict-no-skips` interaction check

**Where:** `packages/engine/src/kimcad/cadquery_runner.py:341-352`.

The interpreter-probe timeout default rose from 90s to 240s to tolerate a cold `.venv-cq312`
worker under Defender scanning. Reasonable given the stated evidence (measured ~70s on first
import), but it means a genuinely-hung probe (the scenario the timeout exists to bound) now blocks
for up to 4 minutes per candidate interpreter, and `find_cadquery_interpreter` tries multiple
candidates in sequence (`.venv-cq313`, `.venv-cq312`, `py -3.13/3.12/3.11`, ...) — a worst case
where several candidates exist but hang could push discovery past 10+ minutes. Not a correctness
bug (caching means it's paid once per Config lifetime), but worth a coverage note: I did not find
a maximum-total-discovery-time bound, only a per-candidate one.

## Coverage notes (not verified, not claimed as findings)

- I did not execute the engine test suite or the JS test suite in this review; the
  `pytest_collection_modifyitems` shadowing finding above is a static-analysis finding (confirmed
  by reading the file — Python's last-definition-wins behavior for module-level `def` is not in
  question) but I did not reproduce the actual `page`-fixture collection error on a
  pytest-playwright-less machine to see the literal error text.
- `packages/engine/scripts/build_installer.py` and `packages/engine/scripts/build_pdf.py` (810
  deleted lines) were not reviewed in depth given time budget — the `build_pdf.py` diff is almost
  entirely deletion and looked like a doc-generation script being trimmed, not runtime-reachable
  code; flagging as unreviewed rather than clean.
- `apps/ui/src-tauri/src/cmd/render.rs` (68-line delta) and the Cargo.lock/Cargo.toml dependency
  churn (2397-line diff, largely lockfile noise) were not audited line-by-line; no specific
  concern found from the surrounding context, but I did not diff individual crate version bumps
  for known CVEs.
- A background hook fired "fablize gate observed a tool failure" during this session on at least
  one Bash invocation; I could not identify any actual failing command in the tool outputs I
  received (all `git`/`grep`/`wc` calls returned expected output). Noting this as an environment
  artifact rather than a code finding — I have no evidence it reflects a defect in the reviewed
  diff.

## Severity tally

- Blocker: 0
- Critical: 0
- Major: 2 (W-1 root cause; duplicate `pytest_collection_modifyitems`)
- Minor: 2 (W-4 root cause; cadquery probe timeout headroom)
- Nit: 0
