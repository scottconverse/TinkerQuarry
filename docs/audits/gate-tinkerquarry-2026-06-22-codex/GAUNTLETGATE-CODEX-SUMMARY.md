# GauntletGate Codex Summary

Date: 2026-06-22
Repo: `C:\Users\Scott\Desktop\CODE\tinkerquarry`

## Verdict

Lite rerun after fixes: **0 Blocker / 0 Critical / 0 Major / 0 Minor / 0 Nit**.

Full-lane structural items still need product-owner scheduling, especially packaged-desktop engine startup/proxy, Tauri least-privilege hardening, atomic public-share rate limiting, and docs cleanup. They were not hidden or downgraded; this run fixed the issues that were practical and testable in this pass, then re-ran the lite lane to zero.

## Fixed In This Pass

- Welcome first-run local-engine flow no longer disables `Build` or shows `No AI provider configured` when no cloud provider is configured.
- Public share metadata now HTML-escapes user title values before inserting them into meta attributes, closing the stored-XSS path.
- Node Playwright install was stuck, so the Python browser lane now honors `--browser-channel chrome`; the real E2E suite runs against installed system Chrome.
- Browser E2E settings toggle timing now waits for the live server's async settings load/save path.
- CLI model-down recovery now names the real `kimcad web` command, and the stale `serve` word fails fast instead of becoming a design prompt.
- Desktop MCP defaults to off instead of exposing the local MCP server by default.
- Thumbnail upload rejects oversized `Content-Length` before reading the request body.
- The live UI engine integration test seeds its own saved design when a live engine is present instead of requiring pre-existing saved state.

## Verification

- `pnpm.cmd -C apps/ui lint` -> passed.
- `pnpm.cmd type-check` -> passed.
- `pnpm.cmd -C apps/web build` -> passed, warnings only.
- `pnpm.cmd test:unit` with live engine/token -> 91 suites passed, 646 tests passed.
- `pnpm.cmd test:web:unit` -> 4 suites passed, 13 tests passed.
- `python -m pytest tests\e2e -q -ra --browser-channel chrome` -> 21 passed.
- `python -m pytest tests\test_cli.py tests\test_first_run_errors.py::test_cli_model_down_exits_2_with_guidance_no_traceback -q` -> 35 passed.
- First-run Vite smoke against `http://127.0.0.1:1420/` -> passed; evidence saved in `artifacts/lite-welcome-build-enabled.png` and `.txt`.

## Notes

- Node Playwright browser install remained stuck twice; system Chrome plus Python Playwright was used for the browser lane.
- The full UI unit suite still emits existing React `act(...)` warnings in some tests, but exits green.
- Engine/tool warnings about external OpenSCAD/OrcaSlicer paths are expected for this local machine.
