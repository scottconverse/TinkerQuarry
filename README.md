# TinkerQuarry

**Status: recovery gate passed for the verified beta lanes. Not final v1.**

TinkerQuarry is a local-first CAD-to-print application: describe a part in plain English, tune it,
inspect the generated OpenSCAD, and produce a checked printable file. The intended differentiator is a
Visual Correction Loop that looks at rendered views of the generated model and fixes spatial mistakes.

The current repo is the canonical product repo. The engine is forked into `packages/engine`; the
OpenSCAD Studio front end is forked into `apps/ui`.

## Honest State

What is real and worth trusting:

- The manufacturing engine can design, gate, orient, slice, save, reopen, and serve generated source.
- The front end boots as the TinkerQuarry Studio app and is wired to the local engine for the core
  describe-to-viewer and make-it-real download flow.
- Manual build-plate orientation is wired in the UI and engine; changing pose invalidates stale
  slices/G-code before the next Make it real action.
- Send-to-printer UI is wired after a successful slice, with connector selection and simulated/real
  outcome provenance.
- Engine coverage is substantial and real; the core browser flow now has durable Playwright coverage.
- Native Windows packaging builds and has been smoke-tested from both the release executable and the
  installed NSIS copy.
- Source/license disclosure exists in-app for the current core components.

What is still not done:

- The Visual Correction Loop has an advisory local probe-mode v1, but not the full autonomous PRD
  correction loop.
- Bundled third-party SCAD libraries are vendored, with caveats noted below.
- External-library admission is not wired to the engine sandbox.
- Persistent per-iteration history, visual diff, and a full Explain view remain incomplete.
- Browser-level coverage is still narrow: happy-path desktop web flow through mock send/outcome and
  native startup smoke are covered, but not a broad mobile/accessibility/error-path matrix.

For the current detailed truth, read:

- [docs/STATUS.md](docs/STATUS.md)
- [docs/EVALUATE.md](docs/EVALUATE.md)
- [docs/HANDOFF-TO-CODEX.md](docs/HANDOFF-TO-CODEX.md)
- [docs/audits/honesty-audit-2026-06-22.md](docs/audits/honesty-audit-2026-06-22.md)

## Run

Use two PowerShell terminals.

```powershell
# Terminal 1: engine
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
$env:TINKERQUARRY_DEV_TOKEN = "tq-dev-token"
.\.venv\Scripts\kimcad.exe web --port 8765
```

```powershell
# Terminal 2: front end
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
pnpm dev
```

Then open `http://localhost:1420`.

## Tests

```powershell
# Root UI/web checks
cd C:\Users\Scott\Desktop\CODE\tinkerquarry
pnpm -r lint
pnpm -r type-check
pnpm test:unit
pnpm test:web:unit

# Durable browser flow: app boot -> prompt/build -> Make it real -> slice -> Send -> outcome
cd C:\Users\Scott\Desktop\CODE\tinkerquarry
pnpm test:e2e:web

# Native Tauri runtime smoke against the built release exe
cd C:\Users\Scott\Desktop\CODE\tinkerquarry
pnpm test:e2e:tauri

# Native Windows package build
cd C:\Users\Scott\Desktop\CODE\tinkerquarry
pnpm --dir apps\ui tauri build

# Front-end unit suite, direct app command
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js

# Live API integration test; requires the engine running on port 8765
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js engineLive.integration

# Engine suites
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
.\.venv\Scripts\python.exe -m pytest tests -m "not live" -q
.\.venv\Scripts\python.exe -m pytest tests -m live -q
.\.venv\Scripts\python.exe -m pytest tests -m real_tool -q
```

See [docs/HANDOFF-TO-CODEX.md](docs/HANDOFF-TO-CODEX.md) for proof logs, known caveats, and environment
setup.

## Repository Decision

- `tinkerquarry` is the product repo of record.
- `KimCadClaude` remains a separate product for a different audience.
- `openscad-studio` is the upstream front-end base already forked into `apps/ui`.

## Library Decision

TinkerQuarry remains **GPL-2.0-only**. Bundled libraries must be GPLv2-compatible.

Vendored under `packages/engine/library/vendor` with pinned commits and attribution:

- BOSL2
- Round-Anything
- YAPP_Box
- Catch'n'Hole
- gridfinity-rebuilt-openscad
- MCAD
- tq-threads

Dan Kirshner `threads.scad` is **not** vendored into this GPL-2.0-only repo because the available
source is GPL-3.0-or-later. Thread support is provided by the clean-room MIT `tq-threads`
replacement.

## License

GPL-2.0-only. See [LICENSE](LICENSE).
