# GauntletGate — Test Engineer deep-dive — TinkerQuarry

**Role:** Test Engineer (audit-only; tests run read-only, no code modified)
**Date:** 2026-06-21 · **Build:** KimCadClaude (engine 0.9.3, rebranded+rethemed SPA)
**Focus:** coverage REALITY vs claim, rebrand/retheme regression risk, safety-invariant coverage, real-engine path.

## Severity counts
- Blocker: 0
- Critical: 0
- Major: 2 (TST-1 brand-title test now fails; TST-2 retheme token test now fails — both are real regressions the rebrand introduced into the engine-side suite and were NOT in the "3 updated matchers" set)
- Minor: 3 (TST-3 viewport accent mismatch w/ no guarding test; TST-4 no automated real render→gate→slice→send integration covering the manual claim; TST-5 the "243 core-engine" claim is wrong by ~6.4×)
- Nit: 2 (TST-6 self-heal/managed-engine respawn only mock-tested; TST-7 pre-existing infra failures muddy the gate signal)

## Verified test numbers (ran here)

| Suite | Claimed | ACTUAL (this box) | Command |
|---|---|---|---|
| KimCad engine (tests/, excl e2e) | "243 pass" | **1552 passed, 11 FAILED, 104 skipped** (1667 collected) in 398s | `.venv313 pytest tests/ --ignore=tests/e2e` w/ OPENSCAD_PATH set |
| engine e2e (tests/e2e/) | — | 21 collected (Playwright; not run — browser-gated) | — |
| SPA frontend | "405 pass" | **405 passed, 33 files** ✅ | `npm test -- --run` (vitest) |
| tinkerquarry glue | "10 + 9" | **19 passed** ✅ (test_connector 10, test_mock_api 9) | system `python -m pytest` |

**The "243 core-engine tests pass" claim is FALSE as stated** — the suite is 1667 tests and 11 of them FAIL on this provisioned box. 243 has no provenance in the repo (grep found nothing); it is a stale or hand-counted subset figure. Frontend 405 and glue 19 are EXACT and all green.

### The 11 engine failures, triaged

**Rebrand/retheme regressions (the audit's core concern) — these SHOULD fail and DO:**

- **TST-1 (Major) — `test_webapp.py::test_http_layer_serves_index_design_and_mesh`** asserts `"<title>KimCad" in html` (test_webapp.py:151). The rebrand changed `frontend/index.html` and `src/kimcad/web/index.html` to `<title>TinkerQuarry</title>`, so the served page no longer contains "KimCad". This is precisely the "test asserting OLD brand strings that should now fail" class — and it is NOT silently skipped, it is RED. It was missed because the rebrand's "3 updated matchers" were all in `frontend/src/**` (vitest); this is a *Python-side* brand matcher in the engine suite. **Fix:** change the assertion to `"<title>TinkerQuarry"`.

- **TST-2 (Major) — `test_frontend.py::test_built_css_carries_zen_tokens`** asserts the OLD Zen-gold tokens `#d4af37` (light) and `#e3c24f` (dark) survive the build (test_frontend.py:76-78). The retheme replaced the accent: `frontend/src/styles.css:56` is now `--kc-accent: #cf7a3f` (light) and `:121` `#e0a667` (dark, "forge amber"). The built CSS no longer carries the old hexes → RED. Again an engine-side guard not in the updated-matcher set. **Fix:** update the token assertions to the new forge-amber values (and confirm the `#0c0a06` viewport colour still matches the rethemed dark surface).

**Pre-existing infra / environment drift (NOT rebrand-caused) — noise that lowers the gate signal:**

- TST-7a `test_config.py::test_binary_path_resolves_to_project_root` — asserts `"tools" in p.parts`; the binary lives in `_tools` on this box (path layout), not a code defect.
- TST-7b `test_config.py::test_configured_build_volumes_match_the_shipped_orca_profiles`, `test_slicer.py::test_every_configured_material_resolves_to_a_real_filament`, `test_slicer.py::test_resolve_real_all_three_printers_resolve`, `test_slicer.py::test_live_slice_box_produces_proven_gcode[elegoo_neptune4 / _4_max]` — OrcaSlicer profile/filament mapping drift for Elegoo printers against the installed slicer's shipped profiles.
- TST-7c `test_printer_catalog.py::test_catalog_was_reverified_after_its_last_edit` — `default.yaml` edited 2026-06-21 15:25 but `printer_catalog.verified.json` is from 2026-06-17 (the catalog was edited — plausibly by the rebrand touching config — without re-running `scripts/build_printer_catalog.py --verify`). Hygiene gate doing its job.
- TST-7d `test_connections_api.py::test_saved_overlay_flips_configured_and_feeds_build_connector` + `test_send_picker_list_reflects_the_overlay` — saved-overlay `configured` flag not flipping; connector-overlay logic, unrelated to rebrand.

None of the 11 touch a SAFETY invariant. None are Blockers. TST-1/TST-2 are genuine rebrand regressions in the test suite; the other 9 are pre-existing infra/profile drift that the gate run should have separated out.

## Rebrand / retheme test-coverage assessment (the brief's central question)

- **Old brand strings in FRONTEND test assertions:** NONE remain. `grep "KimCad"` over `frontend/src/**/*.test.ts*` returns only the intentional protocol identifiers (`X-KimCad-Session`, `kimcad-session-token`, `.kimcad` file ext) — see below. The 3 updated matchers (FirstRunWizard "Set up TinkerQuarry's AI" / "Welcome to TinkerQuarry"; SettingsPanel "set up tinkerquarry's ai"; useTheme garbage→dark) all assert the NEW brand/default and pass.
- **Old brand strings in ENGINE/Python test assertions:** TWO were missed → TST-1 (`<title>KimCad`) and the Zen-gold CSS guard TST-2. So the answer to "are there tests asserting OLD brand strings that should now fail but were silently skipped?" is: they are NOT skipped — they FAIL — but they were OVERLOOKED in the rebrand because they live in the Python suite, not the SPA suite. Good (caught by a run); bad (the gate's "243 pass" claim hid them).
- **Old 'system' default:** NO test asserts `system` as the default theme. `useTheme.test.ts:60` correctly asserts garbage/unset → **dark** (TinkerQuarry default). The remaining `resolveTheme('system')` cases (`:30/:32`) test the explicit-system-pref *resolution* path, which is legitimately retained — not a default-value assertion.
- **Protocol immune to the rebrand:** WELL covered on BOTH ends.
  - Frontend: `src/api.session-token.test.ts` — stamps `X-KimCad-Session` from the `kimcad-session-token` meta on every POST shape (postJson, raw upload, no-headers), no header for the dev placeholder / no meta, 403-reason:"session" → `SessionExpiredError` + recovery handler, plain 403 stays ordinary. The header/meta names are deliberately UNchanged (protocol, not branding) — correct.
  - Engine: `test_webapp.py:629 test_session_token_guard_blocks_state_changing_posts_without_the_token` — tokenless POST → 403 on EVERY state-changing route, wrong token (constant-time) → 403, correct token → real 200, GETs never gated. Server-side CSRF enforcement is proven independent of the rebrand.

## Safety-invariant coverage (Major+ if missing — it is NOT missing)

The product's safety promises are **well tested**, including the REJECT paths:

- **Gate REJECT path (not just pass):**
  - `test_geometry.py::test_gate_fails_when_not_watertight` (non-manifold → `res.failed`, code `mesh.not_watertight`).
  - `test_geometry.py` NaN/inf extent → FAIL (ENG-001).
  - `test_printability.py::test_real_oversized_mesh_fails_build_volume` — REAL 300mm trimesh box → `Level.FAIL`, `volume.exceeds` (computed bbox, not a fixture).
  - `test_printability.py::test_real_dimension_mismatch_fails_from_computed_bbox` — real 30mm vs planned 20mm → FAIL, `dim.mismatch`.
  - Thin-wall is **WARN, by design** (`test_gate_warns_on_thin_wall`, `wall.thin`), not a hard FAIL — the brief asked if thin-wall is "BLOCKED"; the engine's contract is to warn, and that contract is pinned. Repair is WARN not silent-pass (`test_open_mesh_is_repaired_and_reported`, `mesh.repaired`). Stray-body WARN vs sealed hollow-cavity no-warn split is tested on real geometry.
- **Slice requires a passing gate:** `test_webapp.py::test_web_refuses_to_slice_a_gate_failed_part` (web slice → `sliced:false, reason:"gate_failed"`, no `gcode_url`); e2e `test_export_gate.py::test_a_gate_failing_part_is_refused_slicing_but_still_downloadable`.
- **Re-render safety (the live-slider's #1 invariant):** `test_webapp.py::test_rerender_into_a_gate_failed_shape_blocks_slice_and_send` — pass→slice→re-render into a failing shape ⇒ stale slice 404-invalidated, re-slice refused (`gate_failed`), and **send refused** (`sent is not True`). Plus `test_reopen_that_regates_to_fail_shows_fail_and_blocks_slice` (a tampered .kimcad claiming "pass" re-gates to fail on reopen).
- **Send requires confirm + a real slice:**
  - `test_send_before_slice_is_404` (can't send without slicing first).
  - `test_webapp.py:950` — the server forces `send(confirm=True)` **regardless of a body `confirm:false`**, so a hostile API client cannot downgrade the confirmation. Strong.
  - SendPanel.test.tsx — send fires ONLY after the confirm dialog is accepted (cancel sends nothing), simulated vs real labeled honestly, outcome asked only after a real send.
  - `test_connector.py::test_printer_tool_is_delegated` (glue) asserts `confirm:True` reaches the printer delegate.

## Real-engine path: what is mocked vs real

- **Most pipeline/web tests use a FAKE renderer/provider** (`FakeProvider`, `_box_renderer`, fake slice) — fast and deterministic. That is appropriate for logic, but it means the *happy-path integration* is mostly mock-driven.
- **Real-binary coverage DOES exist, gated by `@pytest.mark.real_tool`** (auto-skips when binaries absent, RUNS on the provisioned box — conftest.py:116-128, explicit "no green-by-skip" discipline):
  - `test_printability.py::test_real_openscad_render_through_pipeline_matches_fake_contract` — drives the REAL OpenSCAD binary through `Pipeline.run`, asserts real mesh → real validate→gate → `gate_status == "pass"` + watertight.
  - `test_webapp.py::test_live_web_design_then_slice_then_download` — full HTTP design→confirm slice (real OrcaSlicer)→download.
  - e2e `test_export_gate.py` (Playwright, `real_tool`+`needs_browser`) — real render→gate→slice→downloadable file in the real SPA, AND the real gate-fail refusal. **This IS an automated real render→gate→slice integration test** — but it lives in `tests/e2e/` (excluded from the engine count) and needs Chromium; I could not run it here (browser-gated). On THIS run, 104 tests skipped — a chunk of those are the browser/e2e and any real-tool tests whose binary probe failed.
- **GAP (TST-4, Minor):** there is no single automated test that exercises real render → gate → slice → **send to a (mock) connector** as one flow. The pieces are each covered (real render→gate→slice via real_tool; send-gating via fakes) but the end-to-end seam the walkthrough proved MANUALLY is not pinned by one automated integration test. The walkthrough itself flags this. Recommend one `real_tool` web test: design a real box → slice (real Orca) → send to `mock` connector → assert `sent:true, simulated:true` and that a gate-failed variant is refused at the send step.

## Findings (id · severity · evidence · why · fix)

- **TST-1 (Major)** — `tests/test_webapp.py:151` asserts `"<title>KimCad" in html`; served page is `<title>TinkerQuarry` (`frontend/index.html:11`, `src/kimcad/web/index.html:11`). Run output: `FAILED test_http_layer_serves_index_design_and_mesh`. *Why:* a rebrand regression escaped the matcher update; the gate's "243 pass" claim masked it. *Fix:* assert `"<title>TinkerQuarry"`.
- **TST-2 (Major)** — `tests/test_frontend.py:76-78` asserts `#d4af37`/`#e3c24f` Zen-gold tokens in built CSS; source rethemed to `#cf7a3f`/`#e0a667` (`frontend/src/styles.css:56,121`). Run output: `FAILED test_built_css_carries_zen_tokens`. *Why:* retheme regression escaped the test; also implies the built CSS in `src/kimcad/web/assets` was regenerated from the new source. *Fix:* update the three token assertions to the forge-amber values; keep the font-family and offline-woff2 checks.
- **TST-3 (Minor)** — `frontend/src/viewport/KCViewport.ts:13` hardcodes `const ACCENT = 0xd4af37 // ... matches --kc-accent light`, but the CSS light accent is now `#cf7a3f`. *Why:* the 3D viewport accent no longer matches the rethemed UI — a real visual retheme miss, and NO test guards the JS-constant↔CSS-token equality. *Fix:* update the constant to the new accent and add a test asserting `KCViewport.ts` ACCENT equals the `--kc-accent` value (close the JS/CSS drift seam).
- **TST-4 (Minor)** — no automated real render→gate→slice→send integration; manual-only per walkthrough. *Fix:* add the `real_tool` web flow described above.
- **TST-5 (Minor)** — "243 core-engine tests pass" is wrong (actual 1667 collected / 1552 pass / 11 fail). *Why:* a false count in the gate claim hides the 11 reds. *Fix:* state the real number and the 11-failure triage in the gate doc; wire a known-good baseline so new reds are visible.
- **TST-6 (Nit)** — managed-engine self-heal (Ollama respawn) is only mock-tested (FirstRunWizard UX-COLD-001 mocks `getModelStatus`/`startModelPull`); the actual respawn was proven manually. *Fix:* a `real_tool`/integration test that kills Ollama and asserts a design run re-spawns it (hard to make hermetic — acceptable as a documented manual check).
- **TST-7 (Nit)** — 9 pre-existing infra/profile/overlay failures (config path `_tools`, Elegoo Orca profiles, stale catalog verify-record, connector overlay `configured` flag) are mixed into the same run, lowering the gate's signal-to-noise. *Fix:* quarantine or fix these so a rebrand regression isn't lost in the crowd.

## What's working (the real coverage that IS solid)

- **Frontend suite: 405/405 green**, including genuinely strong error/loading coverage: `api.test.ts` pins non-2xx error messages, non-JSON bodies, AbortSignal cancellation, best-effort progress polling that never throws; SendPanel covers confirm-gating, cancel, simulated-vs-real labeling, live-status poll teardown on unmount/supersede, transient-poll-failure survival, and an empty/unconfigured-connector disabled state.
- **Glue suite: 19/19 green** — pure-protocol JSON-RPC with injected fakes; gate status serialized, `confirm:True` delegated, unknown-tool/unknown-method are typed errors not crashes, engine-missing gives a clear actionable message.
- **Safety invariants are genuinely well covered** — gate REJECT paths on REAL trimesh geometry (oversize/dim-mismatch/non-watertight → FAIL, with computed numbers via `test_printability.py` closing the validate_mesh→run_gate seam), slice-requires-pass, the live-slider re-render→fail→block-slice-AND-send invariant, send-requires-confirm with a server-forced `confirm=True` that a hostile body can't downgrade, and reopen-regates-to-fail.
- **Protocol/CSRF immune to the rebrand** — session-token stamping (frontend) and tokenless/wrong-token 403 enforcement (engine) both pinned; header/meta names intentionally retained.
- **Marker discipline is excellent** — `real_tool`/`needs_browser`/`windows_only`/`needs_manifold` auto-skip off-environment but RUN on the provisioned box, with explicit anti-"green-by-skip" comments and a geometry-backend pre-flight that collapses a broken env into one clear line. A real OpenSCAD render→gate→slice path IS exercised by `test_printability.py` real_tool + `test_webapp.py::test_live_web_design_then_slice_then_download` + e2e `test_export_gate.py`.
