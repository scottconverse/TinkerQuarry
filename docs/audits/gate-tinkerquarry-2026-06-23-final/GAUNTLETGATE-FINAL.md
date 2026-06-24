# GauntletGate Final Release Gate

Date: 2026-06-23
Repo: `C:\Users\Scott\Desktop\CODE\tinkerquarry`

## Verdict

Beta release gate: **passed**.

The final pass closed the outstanding native packaging, native runtime, installed-app workflow, and fresh-eyes release-readiness items. The repo now has committed proof lanes for the web happy path, staged Tauri runtime, and installed NSIS workflow.

This is a beta-ready verdict, not a claim that every future v1 enhancement is complete. Remaining product work in `docs/STATUS.md` is P1/V1 scope: richer Explain/diff, broader mobile and accessibility matrices, real hardware connector proof, and polish.

## Fixed In This Pass

- Added a durable installed-NSIS smoke test that silent-installs the current artifact, launches the installed executable with an isolated profile, and drives native build -> slice -> mock send -> outcome.
- Added a native release command that runs the Visual Studio developer environment, Cargo tests, and Tauri build as a repeatable release lane.
- Branded the packaged Windows executable as `tinkerquarry.exe` and verified both the staged release folder and silent-installed NSIS directory contain that executable.
- Fixed demo engine model readiness so local-demo mode reports ready without requiring Ollama.
- Fixed a portable OpenSCAD 2026 canonical-path startup crash by retrying from a writable app-data mirror.
- Hardened native runtime CSP for blob workers/images and Tauri IPC while keeping remote fetches constrained.
- Avoided remote HDR environment loading inside Tauri so the viewer does not trip native CSP.
- Made first-run mobile behavior match desktop: the welcome surface remains visible until the user acts.
- Blocked example/build actions until the selected model/provider is genuinely ready.
- Made the preview empty state actionable.
- Added ARIA menu semantics to the panel switcher.
- Improved default Solarized Dark contrast enough for the committed SVG/theme checks.
- Updated in-app and engine third-party notices for the staged subprocess binaries and PrintProof3D source.
- Removed stale documentation that still described TinkerQuarry as a target product or pointed operators at the old sibling repo.

## Final Verification

Run from `C:\Users\Scott\Desktop\CODE\tinkerquarry`.

| Command | Result |
| --- | --- |
| `pnpm.cmd test:gate` | passed |
| `pnpm.cmd test:release` | passed; produced MSI and NSIS artifacts |
| `pnpm.cmd test:e2e:tauri` | passed against the staged release executable |
| `pnpm.cmd test:e2e:tauri:installed` | passed against a silent-installed NSIS copy with isolated profile and native build/slice/send workflow |
| `pnpm.cmd -r type-check` | passed |
| `pnpm.cmd -r lint` | passed |
| focused engine regressions for OpenSCAD retry and demo model status | 3 passed |
| focused UI regressions for welcome/mobile/theme behavior | 28 passed |
| `git diff --check` | passed |

Native artifacts produced:

- `apps\ui\src-tauri\target\release\bundle\msi\TinkerQuarry_1.3.0_x64_en-US.msi`
- `apps\ui\src-tauri\target\release\bundle\nsis\TinkerQuarry_1.3.0_x64-setup.exe`

## Notes

- The first parallel rerun of the staged and installed smoke lanes conflicted on the same WebView2 remote-debugging port. They were rerun sequentially and both passed.
- Existing React `act(...)` warnings and bundler warnings remain non-failing warnings; they did not block the release gate.
