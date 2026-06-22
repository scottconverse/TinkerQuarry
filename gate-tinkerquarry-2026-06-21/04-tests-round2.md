# GauntletGate Round 2 — Test Engineer re-audit — TinkerQuarry / KimCad

**Role:** Test Engineer (audit-only; suites run read-only, no product code modified)
**Date:** 2026-06-21 · **Builds:** `KimCadClaude@da65bc8`, `tinkerquarry@fdd73d1`
**Focus:** confirm the suites are GREEN, the round-1 fixes landed, the flaky-405 is understood, and SAFETY coverage is still real → contribute to 0/0/0/0/0.

## Severity counts (this round)
- Blocker: 0
- Critical: 0
- Major: 0
- Minor: 0
- Nit: 2 (TST-8 measurement-overlay still old Zen-gold `0xe3c24f`; TST-9 new health/model fields not asserted by name)

## Verified test numbers (ran here, this box)

| Suite | Round-1 | ROUND-2 ACTUAL | Command |
|---|---|---|---|
| KimCad engine (`pytest -q`, full incl. live) | 1552 pass / 11 FAIL / 104 skip | **1590 passed / 0 failed / 101 skipped** in 697.95s | `OPENSCAD_PATH=… .venv313 -m pytest -q` |
| SPA frontend (vitest) | 405 pass / 33 files | **407 passed / 34 files** in 20.9s | `npm test -- --run` |
| glue connector (tinkerquarry) | 10 pass | **10/10 passed** | `python backend/tests/test_connector.py` |
| glue mock-API (tinkerquarry) | 9 pass | **9/9 passed** | `python backend/tests/test_mock_api.py` |

**All four suites GREEN. Engine = 0 failures (was 11), matching the 1590/0/101 known-good baseline exactly.** Frontend gained +2 tests / +1 file: the new `KCViewport.accent.test.ts` TST-3 drift-guard. Glue exact at 19.

## The flaky-405 verdict + precise cause + fix

**Verdict: genuinely flaky, but it is a TEST-CLIENT robustness gap on Windows — NOT a test-isolation/port leak, NOT a leaking prior test, and NOT a product defect.**

- **Reproduced** it deterministically: looping `test_token_on_post_to_get_only_route_is_405_with_json_body` ~7–10× *while the full suite ran concurrently* (heavy load) fails roughly 1-in-10; in isolation it passes 35/35.
- **Exact failure** (captured with `--tb=short`): `ConnectionAbortedError: [WinError 10053] An established connection was aborted by the software in your host machine` raised inside `conn.getresponse()` at `tests/test_webapp.py:700` (`_post` → `response.begin()` → `_sock.recv_into`). It is **never** a wrong status code (405 logic is correct), never a 403 token drift, never a wrong Allow header.
- **Mechanism:** the test opens a *fresh* `http.client.HTTPConnection` for each of 8 GET-only paths in a loop against a `ThreadingHTTPServer` that closes the connection per response (no keep-alive). Under CPU pressure the client and the server worker thread race on socket teardown; Windows aborts the half-closed socket (WinError 10053) on the next `recv`. This is a well-known Windows `ThreadingHTTPServer`/`http.client` teardown race. The suite has **no pytest-xdist** (runs serially), and every server binds an ephemeral port (`port 0`), so a port collision / cross-test leak is not the cause.
- **Why it looked like "transient under load then passed on re-run":** load is the trigger; remove the concurrent load and it passes every time — exactly the reported behavior.
- **Fix (TEST-ONLY hardening; no product change):** make the loop's `_post` helper retry on transient `(ConnectionError, http.client.RemoteDisconnected, http.client.BadStatusLine)` 2–3× with a tiny backoff — each GET-only probe is idempotent and independent, so a retry is safe and provably correct. (Alternatively, reuse a single keep-alive connection, but per-request retry is the smaller, clearer change.) The same `_post`/`_post_status` pattern recurs in the neighboring token-guard tests, so hardening the shared helper closes the whole class. This is the *only* open test-quality question and it is fully diagnosed.

## Round-1 fixes — all CONFIRMED landed and meaningful

- **TST-1 (brand title):** `test_webapp.py:151` now asserts `"<title>TinkerQuarry"`. Passes. No `<title>KimCad` assertion remains in any test.
- **TST-2 (forge-amber CSS tokens):** `test_frontend.py` renamed to `test_built_css_carries_tinkerquarry_tokens`, asserts `#e0a667` (dark forge amber), `#cf7a3f` (light terracotta), `#0d0b07` (viewport) + the three font families. No `#d4af37`/`#e3c24f` assertions remain in tests. Passes.
- **TST-3 (viewport accent-drift guard):** new `frontend/src/viewport/KCViewport.accent.test.ts` byte-compares the `const ACCENT = 0x…` literal in `KCViewport.ts` against the `--kc-accent` value inside `:root.kc-theme-dark` in `styles.css`, AND pins both to `e0a667`. `KCViewport.ts:13` is now `0xe0a667`. Meaningful — closes the JS↔CSS drift seam. Passes.
- **TST-4 (real render→gate→slice→send integration):** `tests/test_integration_send_flow.py` exists and is meaningful — `live`+`real_tool`, drives a real 20 mm box through the web API: design → gate → slice via the **real OrcaSlicer** (`gcode_lines > 100`) → send to the `mock` connector (`sent:true, simulated:true, job_id`). It then proves the safety interlock end-to-end: a plan/mesh-mismatch (50 vs 20 mm) FAILS the dimensional gate, is refused at slice (`sliced:false, reason:gate_failed`, no `gcode_url`) AND at send (404 / `sent:false`). This is the single automated end-to-end seam the round-1 walkthrough only proved manually. Ran here (binaries present) — passed inside the 1590.
- **TST-5 (count):** the real numbers are now reported (1590/0/101). The false "243 core-engine" figure is gone from the gate signal.
- **TST-7 (the 9 pre-existing failures):** all resolved — config path isolation (`_tools` vs `tools`), Elegoo Orca profile/filament mapping, catalog re-verify freshness (`test_catalog_was_reverified_after_its_last_edit` enforces-when-present / warns-and-passes-when-absent with justification), and the connections saved-overlay `configured` flag. Engine is 0 failures.
- **e2e brand assertions:** fixed — `tests/e2e/test_smoke.py` / `test_wizard.py` assert TinkerQuarry strings ("What TinkerQuarry does", "Welcome to TinkerQuarry"); only the intentional protocol identifiers (`X-KimCad-Session`, `kimcad-session-token`, `.kimcad`) retain the old name. (e2e is Playwright-gated; not run here — counted in the 101 skips.)
- **`elegoo_neptune_4_max` skip — JUSTIFIED:** documented upstream OrcaSlicer 2.4.0 bug — its *own shipped* Neptune 4 Max profile uses relative-E addressing but omits `G92 E0` from `layer_gcode`, which 2.4.0's stricter validator rejects (orca-slicer exits -51). Not a KimCad defect; Elegoo stays covered by the working `elegoo_neptune4`. Honest named skip, not green-by-skip.

## SAFETY-invariant coverage — re-audited, still SOLID

All four pillars present, intact, and asserting CURRENT contracts (no stale state):
- **Gate REJECT on real geometry:** `test_printability.py` real-trimesh oversize/dim-mismatch/non-watertight → `Level.FAIL` with computed bbox; `test_geometry.py` non-watertight/NaN-extent → fail. Plus the real-binary `test_real_openscad_render_through_pipeline_matches_fake_contract`.
- **Slice-requires-pass:** `test_web_refuses_to_slice_a_gate_failed_part` (:71), plus the new integration test's refused path.
- **Re-render safety (live-slider):** `test_rerender_into_a_gate_failed_shape_blocks_slice_and_send` (:2064) — stale slice invalidated, re-slice refused, send refused.
- **Send-requires-confirm + real slice:** `test_send_before_slice_is_404` (:1221); server forces `confirm=True` regardless of a hostile `confirm:false` body; SendPanel confirm-gating (frontend); `confirm:True` delegated through the glue (`test_connector.py`).
- **Session-token both ends:** engine `test_session_token_guard_blocks_state_changing_posts_without_the_token` (:629, tokenless/wrong → 403 on every state-changing route, correct → 200, GETs ungated, constant-time compare) + frontend `api.session-token.test.ts`.

No test asserts stale brand/theme/default state: no `<title>KimCad`, no `#d4af37`/`#e3c24f` in any test assertion, no `system`-as-default-theme assertion.

## New gaps from this round's code changes (both Nit)

- **TST-8 (Nit) — residual retheme miss, with a coverage gap behind it.** `frontend/src/viewport/KCViewport.ts:650,659` still hardcode the OLD Zen-gold `0xe3c24f` for the **measurement-tool** marker sphere + ruler line. The retheme moved the dark accent to forge amber `0xe0a667` and TST-3 fixed the named `ACCENT` constant — but the TST-3 drift-guard only checks that single named constant, so these two un-named literals slipped through. Cosmetic only (a measurement gizmo color; no safety/functional impact), but it IS a real visual inconsistency the rebrand left behind, and nothing guards it. *Fix:* repaint the measurement overlay off the accent (or a dedicated `--kc-measure` token) and broaden the drift-guard to flag any remaining old-palette literal in the viewport. (`VIEWPORT_BG`, `ACCENT`, and the semantic `HL_FAIL`/`HL_WARN` tones are all correctly themed.)
- **TST-9 (Nit) — new health/model-status fields not asserted by name.** `webapp.py` added `health.external_binaries` (line 1526) and `model-status.model_loading` (= `running and not present`, line 1736). The underlying state IS covered — `test_health_*` asserts `openscad`/`orcaslicer`/`cadquery` presence and the missing-binary-is-200-not-500 path; `test_model_status_running_but_model_absent` exercises the `running:true, model_present:false` transient. But neither new derived field (`external_binaries`, `model_loading`) is asserted by name, so a regression that dropped/garbled them would stay green. *Fix:* one assertion each on the existing tests. Low risk (both are thin derived projections of already-tested state). Note `settings`-400 is well covered (`test_settings_post_rejects_unknown_keys` → 400 for unknown printer AND material, no corruption).

## Verdict

Tests are at **0 Blocker / 0 Critical / 0 Major / 0 Minor / 2 Nit**. All four suites green (engine 1590/0/101, frontend 407/0, glue 19/0). Every round-1 fix (TST-1…5, TST-7, e2e brand, Elegoo skip) confirmed landed and meaningful. The flaky-405 is fully diagnosed: a Windows socket-teardown race in the test client under load (WinError 10053), fixable with a test-only retry — no product bug. SAFETY coverage is solid and current. The two Nits are non-blocking (one cosmetic retheme residual + missing-by-name assertions on two new derived fields) — they do not stand in the way of a 0/0/0/0/0 verdict, but should be swept next pass.
