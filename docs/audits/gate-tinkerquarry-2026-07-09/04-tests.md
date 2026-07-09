# GauntletGate — Test Engineer deep-dive — TinkerQuarry v1.4.0

Scope: delta since `v1.3.1` (`git diff v1.3.1..HEAD --stat`), focused on test-coverage reality vs
claim. All commands below were run for real against
`packages/engine/.venv/Scripts/python.exe` and the `apps/ui` Jest config on this box; outputs are
pasted verbatim.

## Top finding — a JS-side release-gate is silently non-functional

`scripts/jest-no-skips-reporter.cjs` is a **brand-new file in this delta**
(`git log --diff-filter=A`: commit `d7c9833 "test: enforce zero skipped release gate"`), wired
into both `apps/ui/jest.config.cjs:24` and `apps/web/jest.config.cjs:22` as
`reporters: ['default', '.../jest-no-skips-reporter.cjs']`. Its stated purpose mirrors the Python
side's `--strict-no-skips` (`packages/engine/tests/conftest.py:231-240`): a skipped test should
fail the release-gate run.

It does not work. The reporter's `onRunComplete` sets `this._error`, but **nothing in the repo
ever calls `getLastError()`** (verified: `grep -rn "getLastError"` across the repo matches only the
reporter's own definition). A custom Jest reporter's internal state has no effect on the process
exit code by itself. I proved this empirically:

```
$ cd apps/ui && node .../jest.bin/jest.js --runInBand "__probe_skip"
PASS src/components/__tests__/__probe_skip.test.tsx
  ✓ a passing test (3 ms)
  ○ skipped a skipped test to probe reporter behavior
Test Suites: 1 passed, 1 total
Tests:       1 skipped, 1 passed, 2 total
$ echo $?
0
```
(probe file created and deleted for this check only; not committed)

**Impact**: `pnpm test:gate` runs both `apps/ui` and `apps/web` Jest suites (`package.json:34`).
On the Python engine lane, `--strict-no-skips` genuinely turns any skip into exit 1
(`scripts/run-engine-pytest.mjs:44`, `conftest.py:231-240` — verified wired correctly). On the
JS lane, the exact same category of regression — a test silently marked `.skip`/`xit`/`test.todo`
covering a real feature — passes the gate clean. This is precisely the "no green by skip" release
promise the engine side keeps and the JS side currently does not, for the two suites (`apps/ui`,
`apps/web`) that carry the frontend's own delta this release (visualDiff, share/thumbnail
functions, ProductEvidencePanels, etc.).

**Fix path**: either (a) call `reporter.getLastError()` after the Jest run in
`run-engine-pytest.mjs`'s sibling JS invocation and `process.exit(1)` if set (needs a small wrapper
script, since `package.json`'s `test:gate` calls `jest.js` directly, not through a Node script that
could inspect the reporter), or (b) drop the custom reporter and use Jest's own
`--passWithNoTests=false` plus (more directly) `bail` isn't the right lever — the simplest fix is
`jest --ci` doesn't help either; use `--testPathIgnorePatterns` is irrelevant. The clean fix: read
Jest's own JSON output (`--json --outputFile=...`) after the run and check
`numPendingTests`/`numPendingTestSuites` in a tiny wrapper script (same shape as
`run-engine-pytest.mjs`), replacing the dead custom reporter, then wire that wrapper into
`test:gate` instead of the raw `jest.js` invocation.

## Second finding — a duplicate function name silently kills a new pytest hook

`packages/engine/tests/conftest.py` defines **two** module-level functions named
`pytest_collection_modifyitems` — the pre-existing geometry-backend gate (line 198) and a
**brand-new one added in this delta** (line 127, part of the diff's `+` lines) whose docstring
reads: *"Skip browser e2e during collection when pytest-playwright is not installed. Without this,
pytest can fail while resolving the plugin's `page` fixture before pytest_runtest_setup has a
chance to evaluate the `needs_browser` marker."*

Python silently rebinds the name — the second definition replaces the first in the module
namespace, so pytest only ever sees the line-198 (geometry) hook. Verified two ways:

```
$ python -c "import conftest, inspect; print(inspect.getsourcelines(conftest.pytest_collection_modifyitems)[1])"
198
$ ruff check tests/conftest.py
F811 Redefinition of unused `pytest_collection_modifyitems` from line 127
   --> tests\conftest.py:198:5
Found 1 error.
```

`ruff` isn't run anywhere in CI (`.github/workflows/ci.yml` and `release-gate.yml` have no `ruff`
step; the top-level `package.json` `lint`/`test:gate` scripts only run `pnpm -r lint`, which is a
JS-workspace command — `packages/engine` has no `package.json` so it's never touched) and isn't
part of `test:gate`, so nothing would have caught this automatically.

**Reproduced the exact failure the dead hook exists to prevent** — disabling the plugin (simulating
"pytest-playwright not installed", the scenario the docstring names) turns the intended clean skip
into a hard setup error, for every `needs_browser`-marked e2e module:

```
$ pytest tests/e2e/test_smoke.py -p "no:playwright" -q
E   fixture 'page' not found
ERROR tests/e2e/test_smoke.py::test_landing_renders_its_primary_affordances_without_console_errors
ERROR tests/e2e/test_smoke.py::test_landing_serves_the_session_token_meta_for_the_post_guard
2 errors in 4.48s
```

This does not affect the provisioned release-gate box (pytest-playwright is installed there,
confirmed on this machine), so it is not a blocker for this cut. But it means the documented
"skips cleanly on a fresh clone / hosted CI smoke lane" contract
(`tests/e2e/conftest.py`'s own module docstring) is currently false for any environment that lacks
pytest-playwright — 7 e2e modules (`test_design_refine`, `test_export_gate`, `test_onramps`,
`test_print_versions_mobile`, `test_settings_designs`, `test_smoke`, `test_wizard`) will ERROR
instead of SKIP. **Fix**: rename one of the two functions (e.g.
`pytest_collection_modifyitems_geometry_gate` won't work — pytest requires the exact hook name —
so merge the two bodies into one function, or move the browser-skip logic into the existing
geometry-gate function).

## Third finding — a stale hardcoded printer block contradicts the newly-proven-fixed test

`test_slicer.py`'s live-slice parametrize list un-skips `elegoo_neptune_4_max` in this delta
(previously `pytest.mark.skip(reason="upstream OrcaSlicer 2.4.0 Elegoo Neptune 4 Max profile
invalid...")`), asserting the upstream bug is now fixed. I ran it for real against the bundled
OrcaSlicer on this box:

```
$ pytest tests/test_slicer.py -k "test_live_slice_box_produces_proven_gcode and elegoo_neptune_4_max" -v
tests/test_slicer.py::test_live_slice_box_produces_proven_gcode[elegoo_neptune_4_max] PASSED
```

It genuinely slices now. But `packages/engine/src/kimcad/webapp.py:54-58` still hardcodes:

```python
KNOWN_UNSLICEABLE_PRINTERS: dict[str, str] = {
    "elegoo_neptune_4_max": (
        "Bundled OrcaSlicer 2.4.0 rejects its upstream Neptune 4 Max profile "
        "(relative extruder mode without G92 E0)."
    ),
}
```

— the exact stale reason the test file used to skip on — and this dict is consulted by the real
product paths: `web_options()` (line 633, feeds the UI's printer picker and default-printer
selection) and `slice_registered_mesh()` (line 814-816, the actual `/api/slice` handler, which
raises `OrcaProfileError` unconditionally before ever calling the slicer). I ran the real config
through it:

```python
>>> from kimcad.config import Config; from kimcad.webapp import web_options
>>> web_options(Config.load())['printers'][...key elegoo_neptune_4_max...]
{'key': 'elegoo_neptune_4_max', ..., 'sliceable': False,
 'slice_note': 'Bundled OrcaSlicer 2.4.0 rejects its upstream Neptune 4 Max profile '
               '(relative extruder mode without G92 E0).', ...}
```

**Impact**: the shipped web app (the actual product surface, and what the release walkthrough
exercised) still refuses to let a user pick or slice an Elegoo Neptune 4 Max — one of the ~29
catalogued printers — with a wrong "known blocked" message, even though the engine now proves it
works. Notably the CLI path (`kimcad.cli` line 236-244) calls `resolve_slice_settings` directly and
does **not** consult `KNOWN_UNSLICEABLE_PRINTERS` at all, so `--slice`/`--send` from the CLI is
unaffected — only the GUI/web path is stuck. **No test would catch this drift**:
`test_webapp.py::test_slice_registered_mesh_refuses_known_blocked_profile` exercises the block via
a synthetic `_KnownBlockedProfileConfig` stand-in (webapp.py:1118-1127) that hardcodes
`elegoo_neptune_4_max` as blocked by construction — it can never fail even after the real catalog
no longer needs the block. **Fix**: remove the entry from `KNOWN_UNSLICEABLE_PRINTERS` (the
upstream bug is fixed per the live test), and add a cheap regression test that asserts every
printer key that is NOT in a documented current-skip list in `test_slicer.py` is also NOT present
in `webapp.KNOWN_UNSLICEABLE_PRINTERS` (or, simpler: a single test that calls
`slice_registered_mesh` / `web_options` with the REAL `elegoo_neptune_4_max` entry from the real
config and the real (or a realistic fake) slicer, asserting it is NOT blocked).

## Fourth finding — the walkthrough's W-1 progress gap is a shape mismatch, not a wiring gap, and no test exists at either layer to catch it

The walkthrough (W-1, Major) observed the "Set up local AI" status box showing only static
"Setting up..." for 210s while bytes visibly grew. I traced the full path:

- **Backend is correctly tested**: `test_model_pull.py::test_setup_cold_fetches_runtime_then_pulls`
  asserts `snap["models"][_ENGINE_ROW]["total"] == 1400` after a fake fetch reports progress — the
  `ModelPullJob` snapshot genuinely carries `completed`/`total` for the `"AI engine"` row. This part
  works and is proven.
- **The wire response never has the fields the frontend reads.** Both `GET
  /api/model-pull/progress` (`webapp.py:1200-1202`) and `POST /api/model-pull`
  (`webapp.py:2022-2023`) return the RAW job snapshot: `{"running": bool, "models": {"<row
  name>": {"status", "completed", "total", "error"}}}` — nested under `models`. But
  `WelcomeScreen.tsx:496-505` and `engineClient.ts`'s `ModelPullProgressResult` interface
  (`percent`, `phase`, `detail`, `status`, `done`, `total`, `completed` — all **top-level**) expect
  a *flat* shape that the server never sends. `modelPull.percent`, `.phase`, `.detail` are
  therefore always `undefined` during a real download; the visible span
  (`data-testid="welcome-model-pull-progress"`) renders essentially blank next to the static button
  label — reproducing W-1 exactly. (I confirmed the button label itself, "Setting up...", is a
  separate hardcoded string driven by the `modelPulling` boolean, not by `modelPull` data — that
  part behaves as designed; it's the adjacent progress span that's silently broken.)
- **No test exists at the layer where this would be caught.**
  `apps/ui/src/components/__tests__/WelcomeScreen.test.tsx` has zero references to `modelPull`,
  `percent`, `phase`, `detail`, or `welcome-model-pull-progress` (`grep` returned no matches). A
  test that fed a realistic server-shaped response
  (`{running: true, models: {"AI engine": {status: "pulling", completed: 700000000, total:
  1400000000}}}`) through `engine.modelPullProgress` (mocked) and asserted the progress span shows
  a non-empty percent/byte figure would have failed immediately and caught this before the
  walkthrough had to.

**Fix path**: either flatten the server response for the currently-active row (pick the row that's
`pulling` and surface its `completed`/`total`/`status` at the top level of the JSON), or fix the
frontend to read `data.models[Object.keys(data.models)[0]]` (or, better, a specific known row name)
instead of top-level fields. Either fix needs the missing test above as its regression guard.

## Reverse-import coverage: solid on rejects, thin at the HTTP-endpoint layer

`test_reverse_import.py` (pure-function tests) covers: direct bbox match, plan construction,
volume/surface **signature rejection** (`test_reverse_import_rejects_bbox_only_false_positive`),
and signature **acceptance**. All 4 pass:

```
$ pytest tests/test_reverse_import.py -q
....
4 passed in 0.18s
```

`test_webapp.py`'s HTTP-level reverse-import tests cover: CORS preflight header allowance, bad
suffix (`.step` → 400), unreadable mesh (garbage bytes → 200 + `render_failed`), and full success
(real STL → 200 + `completed` + STEP-source check). All pass:

```
$ pytest tests/test_webapp.py -k reverse_import -q
....
4 passed, 152 deselected, 1 warning in 2.54s
```

**Missing at the HTTP layer** (the endpoint-wiring behavior, not the pure functions, which are
already unit-tested):

1. **Unmatched family via HTTP** — `webapp.py:2721-2736` has a whole reject branch
   (`needs_experimental`, "did not confidently match a known parametric part family") for when
   `match_known_family_from_bbox` returns `None`. No test posts a real mesh whose bbox matches no
   known family and asserts the HTTP response shape (status 200, `has_mesh: false`, the
   `reverse_import.measured_bbox_mm`/`volume_mm3`/`surface_area_mm2` fields, and that
   `out_dir` is cleaned up like the other reject paths are).
2. **Signature mismatch via HTTP** — `webapp.py:2751-2774` has a second reject branch when the
   bbox matches a family but `geometry_signature_matches` fails (envelope matches, volume/surface
   don't) — this is the specific false-positive case the pure-function test
   (`test_reverse_import_rejects_bbox_only_false_positive`) exists to guard against, but nothing
   drives it through the real HTTP endpoint + real pipeline `rerender` to prove the endpoint
   actually reaches and honors that branch (correct status, `rejected_reasons`, cleanup).
3. **Oversize upload on this specific endpoint** — `MAX_REVERSE_IMPORT_BYTES = 64 MiB`
   (`webapp.py:65`) is a distinct constant from `MAX_BODY_BYTES` (1 MiB, the one the existing
   413/400 tests at lines 362-394 exercise). The 413/400 tests only hit the generic JSON-body path;
   nothing posts a body (or a spoofed `Content-Length`) above 64 MiB to `/api/reverse-import`
   itself. `_read_raw_body` is shared code, so this is lower-risk than a from-scratch endpoint, but
   the endpoint-specific limit is unverified — a future change to `MAX_REVERSE_IMPORT_BYTES` (typo,
   wrong unit) would not be caught by the existing generic-body tests.

These three are the highest-value additions to `test_webapp.py`'s reverse-import block; each is a
short addition (build/serve a bad-bbox mesh, build a matching-bbox/mismatched-volume mesh, POST an
oversized body) following the existing `_reverse_import_output_dirs` cleanup-assertion pattern
already in the file.

## `ProductEvidencePanels.test.tsx`: real state assertions, but only the shallow-empty and one happy path per component

The 3 tests **do** assert behavior, not just "it rendered": test 1 fires a click and asserts a
callback ran (`onReverseImportCad` called), tests 2-3 assert specific derived text
("Solid-mass estimate", "before slicer infill", "Reverse import: matched snap_box…") from specific
prop shapes — this is genuine state-driven testing, not smoke-only rendering.

But the file only exercises each of the 4 exported components (`IntentPanel`, `PropertiesPanel`,
`VisualInspectionPanel`, `ProvenancePanel`) through 1-2 branches out of several each component's
source defines:

- `IntentPanel` (`ProductEvidencePanels.tsx:137-215`): only the empty (`!plan`) branch is tested;
  the populated branch (dimensions, features, assumptions, `open_questions` warning color) has no
  test.
- `PropertiesPanel`: watertight/orientation "Not measured" vs "Yes"/"No" states, and the
  bed-contact/center-of-mass "Not estimated" fallback, are untested (only the fully-populated numeric
  case is).
- `VisualInspectionPanel`: `findings`, `visualDiffEvidence` (before/after), and `visualReviewLog`
  sections (lines 320-342) have no test — only the base summary + one labeled image.
- `ProvenancePanel`: the `toolbox` array's conditional branches (`currentStepUrl` present/absent,
  `step_offer === 'settings'`, `selectedConnector` present/absent) are entirely untested; only the
  `reverse_import` disclosure line is covered.

This is a display-only surface (evidence panels for CAD trust), so a bug here is Minor/Major rather
than Blocker/Critical — but it's exactly the kind of "trust panel" whose whole purpose is not
misleading the user, so the untested branches (especially the `open_questions` warning and the
`step_offer` / connector states, which change what the user is told about STEP/print availability)
are worth a follow-up pass.

## Presence-guard soundness (`test_cli.py`, `test_slicer.py`, `test_printer_catalog.py`)

- **`test_cli.py`**'s new `_needs_orca_tree` skipif (checks `binary_path("orcaslicer").exists()
  and orca_profiles_root().exists()`, `except Exception: return False`) stacks correctly on top of
  the existing `real_tool` marker (which only checks OpenSCAD) for 5 new `--slice`/`--send` tests —
  sound, since Orca is a genuinely separate binary from OpenSCAD. The broad `except Exception` could
  in principle mask a `Config.load()` regression as "skip" rather than "fail" on a dev box, but on
  the actual release gate `--strict-no-skips` converts any resulting skip into a hard failure, so
  the guard cannot silently pass a real regression through the gate that matters. No change needed.
- **`test_printer_catalog.py`**'s freshness check switched from an mtime comparison to a
  `catalog_sha256` content-hash comparison against `Config.load().raw["printers"]` — a genuine
  improvement (mtime resets on a fresh clone; content hash doesn't), and it fails loud (not skip) on
  a stale/malformed record. Sound.
- **`test_slicer.py`**'s TPU-not-available test now passes `Path("profiles-root-never-touched")`
  instead of the real profiles root, proving the "not available" error really does precede any file
  lookup (previously it happened to pass even if that ordering broke, since the real root also
  works). Genuine tightening.

## `conftest.py --strict-no-skips` wiring (Python side)

Correctly wired end-to-end: `pytest_addoption` registers the flag, `pytest_sessionfinish` sets
`session.exitstatus = 1` if any test was skipped when the flag is set
(`conftest.py:221-240`), and `scripts/run-engine-pytest.mjs:44` passes `--strict-no-skips`
unconditionally as the release-gate's engine lane. This is the one release-gate mechanism in this
delta that is both correctly implemented and correctly wired — the JS-side equivalent (finding #1
above) is not.

## What's working

- The reverse-import **pure-function** layer (bbox matching, plan construction, geometry-signature
  accept/reject) has direct, specific unit tests with real numeric assertions (delta thresholds,
  confidence bounds) — genuinely proves the match/reject logic, not just "it returns something."
- The reverse-import **HTTP reject paths that are tested** (bad suffix, unreadable mesh) correctly
  assert both the response body AND that the per-request output directory is cleaned up
  (`_reverse_import_output_dirs`) — a real resource-leak guard, not just a status-code check.
- `test_model_pull.py` is a strong suite: idempotency-under-concurrency
  (`test_concurrent_starts_never_fork_a_second_pull`, `test_setup_is_idempotent_while_running`),
  disk-precheck-before-any-download ordering, per-model failure isolation (a failed chat pull
  doesn't block vision), and the monotonic-progress-despite-per-layer-totals guard
  (`test_progress_never_regresses_to_a_smaller_layer`) are all real, specific, well-targeted tests —
  the backend engine-row progress plumbing this release added is properly proven at that layer.
- `test_printer_catalog.py`'s move from mtime to content-hash freshness is a genuine robustness fix,
  not just a refactor, and it fails loud on a broken/missing record rather than skipping.
- `ProductEvidencePanels.test.tsx`'s existing 3 tests assert real derived state (click-driven
  callback firing, specific computed copy from specific prop shapes) — a good pattern, just not yet
  extended to the other branches enumerated above.
- Python-side `--strict-no-skips` is fully and correctly wired from flag to `pytest_sessionfinish`
  to the `pnpm test:gate` engine lane.

## Coverage notes (could not verify, not counted as findings)

- Did not run the full `pnpm test:gate` end-to-end in this session (time-bounded to the delta under
  review); the JS no-skips gap (finding #1) was verified via a standalone Jest invocation against
  `apps/ui`'s config, not the full gate script.
- Did not verify whether `apps/web`'s Jest suite (which shares the same broken reporter) currently
  has any skipped tests that the broken gate is masking — only that the mechanism itself doesn't
  work, empirically, via a synthetic probe test.
- Did not exhaustively review every one of the ~152 non-reverse-import tests in `test_webapp.py`;
  focused on the delta-relevant guard/reverse-import/model-pull areas per the assignment.
