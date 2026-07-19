# Clean-machine install gauntlet

Proves a published TinkerQuarry installer works on a machine that has **nothing** installed — no
Python, no Node, no Ollama, no OpenSCAD, and no exposure to our signing certificate. It runs the
real signed `.exe` inside Windows Sandbox, exactly as a first-time user receives it.

First proven on **v1.5.0 (2026-07-19): 10/10 PASS**.

## Running it

Needs Windows Sandbox (`Containers-DisposableClientVM`) enabled. From this directory:

```powershell
.\Invoke-CleanMachineGauntlet.ps1 -Installer C:\path\to\TinkerQuarry_1.6.0_x64-setup.exe
```

`SHA256SUMS.txt` is picked up from beside the installer unless you pass `-Checksums`. Everything
version-specific — installer name, expected byte size, checksum line — is derived at staging time,
so a new release needs no edits here.

Exit codes: `0` PASS · `1` product FAIL · `2` harness never reached a verdict.

Artifacts land in the share (default `C:\dev\tq-gauntlet-share`): `result.json`,
`gauntlet-transcript.txt`, `readiness.log`, `engine-stdout/stderr.log`, `app-engine.log`.

Other knobs: `-ShareRoot`, `-SettleSeconds`, `-VerdictDeadlineSeconds`, `-MemoryInMB`.

## What it checks

| Check | What it proves |
| --- | --- |
| `sandbox_ready` | Harness preconditions met before any product claim is made |
| `clean_machine` | No Python/Node/Ollama/OpenSCAD/cargo/git — the test means something |
| `authenticode` | Signature Valid + timestamped on a machine that never saw our cert |
| `checksum` | Published SHA256 matches the published binary |
| `install_exit_code` | Silent NSIS install (`/S`) succeeds with no prerequisites |
| `install_layout` | App lands where expected and `tinkerquarry.exe` exists |
| `bundled_payload` | Bundled Python + OpenSCAD + OrcaSlicer actually shipped |
| `bundled_engine_runs` | **The self-containment proof** — shipped engine serves `/api/health` with no system Python |
| `model_absent_handled` | Missing model is reported gracefully, not crashed on |
| `app_launches` | Installed GUI app starts and survives 75s |

## Hard-won constraints

Each of these cost a failed run. They are enforced in code where possible — the comment at each
site names the run that taught it.

**1. The mapped `HostFolder` must live outside `%AppData%`.**
Claude's shell runs in an MSIX container that redirects AppData paths. Stage a share under AppData
and you write to the redirected copy while the sandbox maps the real one: the guest sees an empty
folder and every result it writes vanishes. Silent and total. `Invoke-CleanMachineGauntlet.ps1`
throws on any `ShareRoot` containing `\AppData\`.

**2. Never relaunch Windows Sandbox immediately after killing it.**
The new instance boots to a normal desktop and `LogonCommand` simply never fires — no error, no
marker file, nothing. Full teardown, confirm the processes are gone, then settle ~90s. The launcher
does this, and watches for `logon-ran.txt` on its own deadline so this failure reports as itself
instead of masquerading as a slow product.

**3. Do not gate readiness on WMI.**
The trimmed sandbox image never answers `Win32_OperatingSystem`. An earlier readiness gate required
it and could therefore never go ready. Never gate on a condition the environment cannot satisfy.

**4. The readiness gate must prove its own preconditions before any product check runs.**
Sandbox fires `LogonCommand` before the mapped folder is fully mounted. Run 1 saw a zero-byte
installer and emitted five false failures in one second. The gate now blocks until the share is
writable and the installer is visible at its **full byte count**, logs every probe, and on timeout
exits `HARNESS_FAIL` — explicitly drawing no product conclusion.

**5. Discover the engine path; never hardcode it.**
`tauri.conf.json` maps the staging dir to `engine` under the resource dir — so it is
`<install>\engine`, **not** `<install>\resources\engine`. Run 5 failed purely on that guess. The
script searches for `kimcad_launcher.py` and uses wherever it actually lives. A missing file at a
guessed path is not evidence of a missing payload.

## Design notes

- **The `.wsb` is generated, not committed.** `HostFolder` is an absolute host path; a committed
  `.wsb` would carry one machine's layout and quietly violate constraint 1 elsewhere.
- **Parameters ride the `LogonCommand`, not a config file in the share.** The readiness gate needs
  the expected byte count *before* it can trust the share — reading it from the share would make
  the gate depend on the thing it exists to verify.
- **An unreachable engine emits an explicit `FAIL` for `model_absent_handled`.** The verdict only
  inspects keys that exist, so a silently absent check would read as a pass.
