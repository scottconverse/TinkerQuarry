# TinkerQuarry

**Status: real-product recovery in progress. Not done.**

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
- Engine coverage is substantial and real; front-end product flows are still mostly manually verified.
- Source/license disclosure exists in-app for the current core components.

What is still not done:

- The Visual Correction Loop is not implemented.
- Send-to-printer UI and post-print outcome UI are not implemented.
- Bundled third-party SCAD libraries are vendored, with caveats noted below.
- External-library admission is not wired to the engine sandbox.
- Persistent per-iteration history, visual diff, and a full Explain view remain incomplete.
- Browser-level front-end integration coverage is still missing.

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
# Front-end unit suite
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js

# Front-end typecheck
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
.\node_modules\.bin\tsc --noEmit

# Live API integration test; requires the engine running on port 8765
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\apps\ui
node --experimental-vm-modules --no-warnings node_modules\jest\bin\jest.js engineLive.integration

# Engine suite, excluding e2e collection that needs Playwright installed in the venv
cd C:\Users\Scott\Desktop\CODE\tinkerquarry\packages\engine
.\.venv\Scripts\python.exe -m pytest tests\ --ignore=tests\e2e -q
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
