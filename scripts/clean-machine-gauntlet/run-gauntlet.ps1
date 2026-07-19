# TinkerQuarry CLEAN-MACHINE INSTALL GAUNTLET (runs INSIDE Windows Sandbox).
# The sandbox is a fresh Windows image: no Python, no Node, no OpenSCAD, no Ollama, and it has
# never seen the signing certificate. Everything here tests the PUBLISHED artifact exactly as a
# first-time user receives it. Results are written back to the mapped share as JSON + transcript.
#
# Do not run this by hand — Invoke-CleanMachineGauntlet.ps1 on the HOST stages the share, writes
# the .wsb, and passes these parameters through the sandbox LogonCommand. See README.md.
param(
  # Installer file name as it appears in the mapped share (no path, no spaces).
  [Parameter(Mandatory)][string]$InstallerName,
  # Exact byte length of that installer, measured on the host at staging time. The readiness gate
  # uses it to tell "share not mounted yet / still copying" apart from "installer is broken".
  [Parameter(Mandatory)][long]$ExpectedBytes
)
$ErrorActionPreference = 'Continue'
$share = 'C:\share'
$log = "$share\gauntlet-transcript.txt"
$result = [ordered]@{}
function Say($m) { $line = "$(Get-Date -Format HH:mm:ss)  $m"; Add-Content $log $line -ErrorAction SilentlyContinue }
function Step($name, $ok, $detail) {
  $result[$name] = [ordered]@{ pass = [bool]$ok; detail = "$detail" }
  Say "[$(if ($ok) { 'PASS' } else { 'FAIL' })] $name :: $detail"
}

# --- READINESS GATE (run 1 postmortem) -------------------------------------------------
# Windows Sandbox fires LogonCommand before the mapped folder is fully mounted: run 1 lost its
# first writes, saw a zero-byte installer, and cascaded 5 false failures in one second. Block here
# until the environment is genuinely usable, and record how long that took so the wait is evidence
# rather than a magic sleep.
# Preconditions are ONLY the two the test actually depends on: the full installer is visible, and
# the share is writable. (Run 3 taught this: the original gate also required WMI, which the trimmed
# sandbox image never answers, so it could never go ready. Never gate on a condition the
# environment cannot satisfy.) Every probe is logged so a failure names itself.
$rlog = "$share\readiness.log"
Set-Content $rlog "readiness probes - $(Get-Date -Format o)" -ErrorAction SilentlyContinue
$ready = $false; $waited = 0; $lastState = ''
$sw = [System.Diagnostics.Stopwatch]::StartNew()
while ($sw.Elapsed.TotalSeconds -lt 240) {
  $exeItem = Get-Item "$share\$InstallerName" -ErrorAction SilentlyContinue
  $exeOk = $null -ne $exeItem -and $exeItem.Length -eq $ExpectedBytes
  $writeErr = ''
  $writeOk = $false
  try { Set-Content "$share\.probe" 'x' -ErrorAction Stop; Remove-Item "$share\.probe" -Force -ErrorAction Stop; $writeOk = $true } catch { $writeErr = $_.Exception.Message }
  $lastState = "t=$([math]::Round($sw.Elapsed.TotalSeconds,1))s exeVisible=$($null -ne $exeItem) exeBytes=$(if ($exeItem) { $exeItem.Length } else { 'n/a' })/$ExpectedBytes writable=$writeOk $writeErr"
  Add-Content $rlog $lastState -ErrorAction SilentlyContinue
  if ($exeOk -and $writeOk) { $ready = $true; break }
  Start-Sleep -Seconds 5
}
$waited = [math]::Round($sw.Elapsed.TotalSeconds, 1)
Set-Content $log "$InstallerName clean-machine gauntlet - $(Get-Date -Format o)`nsandbox ready after ${waited}s (share mounted + full installer visible + share writable)`n" -ErrorAction SilentlyContinue
Step 'sandbox_ready' $ready "usable after ${waited}s; last probe: $lastState"
if (-not $ready) {
  @{ verdict = 'HARNESS_FAIL'; failed = @('sandbox_ready'); checks = $result } | ConvertTo-Json -Depth 5 | Set-Content "$share\result.json"
  Say 'ABORT: sandbox never became ready; no product conclusion drawn.'
  exit 1
}

# --- 0. Prove the machine is genuinely clean (otherwise the whole test means nothing) ---
$dirty = @()
foreach ($tool in 'python', 'python3', 'node', 'ollama', 'openscad', 'cargo', 'git') {
  if (Get-Command $tool -ErrorAction SilentlyContinue) { $dirty += $tool }
}
$pyDirs = @('C:\Python313', 'C:\Program Files\Python313', "$env:LOCALAPPDATA\Programs\Python") | Where-Object { Test-Path $_ }
Step 'clean_machine' ($dirty.Count -eq 0 -and $pyDirs.Count -eq 0) "tools on PATH: $(if ($dirty) { $dirty -join ',' } else { 'none' }); python dirs: $(if ($pyDirs) { $pyDirs -join ',' } else { 'none' })"

$exe = "$share\$InstallerName"

# --- 1. Authenticode verification on a machine that never saw our certificate ---
$sig = Get-AuthenticodeSignature $exe
$signerOk = $sig.Status -eq 'Valid' -and $sig.SignerCertificate.Subject -match 'Scott Converse'
Step 'authenticode' $signerOk "status=$($sig.Status); signer=$($sig.SignerCertificate.Subject); timestamped=$($null -ne $sig.TimeStamperCertificate)"

# --- 2. Published checksum matches the published binary ---
# Match the SHA256SUMS line for THIS installer by name — a release may publish several assets, and
# taking the first line silently compares the wrong artifact.
$hash = (Get-FileHash $exe -Algorithm SHA256).Hash.ToLower()
$sumLine = Get-Content "$share\SHA256SUMS.txt" -ErrorAction SilentlyContinue | Where-Object { $_ -match [regex]::Escape($InstallerName) } | Select-Object -First 1
$expected = if ($sumLine) { ($sumLine -split '\s+')[0].ToLower() } else { '' }
Step 'checksum' ($expected -and $hash -eq $expected) "computed=$hash expected=$(if ($expected) { $expected } else { "NO LINE FOR $InstallerName IN SHA256SUMS.txt" })"

# --- 3. Silent install (NSIS /S) — no prerequisites, no prompts ---
# Copy to local disk first: that is what a real user does after downloading, and it removes the
# mapped-folder execution path as a variable.
$localExe = "$env:USERPROFILE\Downloads\$InstallerName"
New-Item -ItemType Directory -Force (Split-Path $localExe) | Out-Null
Copy-Item $exe $localExe -Force
$copyOk = (Get-Item $localExe).Length -eq $ExpectedBytes
Say "copied installer to local disk: $copyOk ($((Get-Item $localExe).Length) bytes)"
$t0 = Get-Date
$proc = Start-Process $localExe -ArgumentList '/S' -Wait -PassThru
$installSecs = [math]::Round(((Get-Date) - $t0).TotalSeconds, 1)
$code = $proc.ExitCode
Step 'install_exit_code' ($copyOk -and $code -eq 0) "exit=$code in ${installSecs}s (local-disk copy ok=$copyOk)"

# --- 4. Locate the install and confirm the bundle landed ---
$roots = @("$env:LOCALAPPDATA\TinkerQuarry", "$env:ProgramFiles\TinkerQuarry", "${env:ProgramFiles(x86)}\TinkerQuarry")
$root = $roots | Where-Object { Test-Path $_ } | Select-Object -First 1
$appExe = if ($root) { Get-ChildItem $root -Filter 'tinkerquarry.exe' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 } else { $null }
Step 'install_layout' ($null -ne $appExe) "root=$root; app=$($appExe.FullName)"

# DISCOVER the payload — never assume its path. (Run 5 failed here purely because the probe
# hardcoded `resources\engine`; tauri.conf.json maps the staged engine to `engine` under the
# resource dir, i.e. <install>\engine. A missing file at a guessed path is not evidence of a
# missing payload, so find the launcher wherever it actually lives and record the tree.)
$launcherItem = if ($root) { Get-ChildItem $root -Filter 'kimcad_launcher.py' -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 } else { $null }
$engineDir = if ($launcherItem) { $launcherItem.DirectoryName } else { $null }
$bundledPy = if ($engineDir) { Join-Path $engineDir 'python\python.exe' } else { $null }
$launcher  = if ($launcherItem) { $launcherItem.FullName } else { $null }
$hasBundle = $engineDir -and (Test-Path $bundledPy)
$tools = @()
foreach ($t in 'tools\openscad\openscad.exe', 'tools\orcaslicer\orca-slicer.exe') {
  if ($engineDir -and (Test-Path (Join-Path $engineDir $t))) { $tools += $t }
}
if ($root) { (Get-ChildItem $root | Select-Object -ExpandProperty Name) -join ', ' | ForEach-Object { Say "install root contains: $_" } }
Step 'bundled_payload' $hasBundle "engineDir=$engineDir; python=$(if ($bundledPy) { Test-Path $bundledPy } else { 'n/a' }); launcher=$launcher; tools=$($tools -join ',')"

# --- 5. THE BUNDLE SELF-CONTAINMENT PROOF: run the shipped engine on a machine with no Python ---
$engineOk = $false; $engineDetail = 'not attempted'; $health = $null
if ($hasBundle) {
  $out = "$share\engine-run"
  New-Item -ItemType Directory -Force $out | Out-Null
  $env:KIMCAD_INSTALL_ROOT = $engineDir
  $env:TINKERQUARRY_DEV_TOKEN = 'sandbox-token'
  $ep = Start-Process -FilePath $bundledPy -ArgumentList "`"$launcher`"", 'web', '--host', '127.0.0.1', '--port', '8899', '--out', "`"$out`"" `
        -WorkingDirectory $engineDir -RedirectStandardOutput "$share\engine-stdout.log" -RedirectStandardError "$share\engine-stderr.log" -PassThru -NoNewWindow
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 120) {
    try { $health = Invoke-RestMethod 'http://127.0.0.1:8899/api/health' -TimeoutSec 3; break } catch { }
    if ($ep.HasExited) { break }
    Start-Sleep -Milliseconds 500
  }
  if ($health) {
    $engineOk = $health.openscad -eq $true -and $health.orcaslicer -eq $true -and $health.version
    $engineDetail = "healthy in $([math]::Round($sw.Elapsed.TotalSeconds,1))s; version=$($health.version) openscad=$($health.openscad) orcaslicer=$($health.orcaslicer) cadquery=$($health.cadquery)"
    # The model is deliberately absent on a clean machine — the app must report that gracefully.
    try {
      $ms = Invoke-RestMethod 'http://127.0.0.1:8899/api/model-status' -TimeoutSec 10
      Step 'model_absent_handled' ($ms.model_present -eq $false) "model=$($ms.model) present=$($ms.model_present) vision_present=$($ms.vision_present) (absent is CORRECT on a clean machine; the wizard downloads it)"
    } catch { Step 'model_absent_handled' $false "model-status probe failed: $($_.Exception.Message)" }
  } else {
    $engineDetail = "no health after $([math]::Round($sw.Elapsed.TotalSeconds,1))s; exited=$($ep.HasExited)"
    # An unreachable engine must produce an explicit FAIL here, never a silently absent check:
    # the verdict only inspects keys that exist, so an omitted step would read as a pass.
    Step 'model_absent_handled' $false 'not evaluated: engine never became healthy'
  }
  if (-not $ep.HasExited) { Stop-Process -Id $ep.Id -Force -ErrorAction SilentlyContinue }
}
Step 'bundled_engine_runs' $engineOk $engineDetail

# --- 6. The installed GUI app launches and stays alive ---
$appOk = $false; $appDetail = 'not attempted'
if ($appExe) {
  $a = Start-Process $appExe.FullName -PassThru
  Start-Sleep -Seconds 75
  $alive = -not $a.HasExited
  $engineLog = @("$env:LOCALAPPDATA", "$env:APPDATA") | ForEach-Object { Get-ChildItem $_ -Recurse -Filter 'engine.log' -ErrorAction SilentlyContinue } | Select-Object -First 1
  $appOk = $alive
  $appDetail = "alive_after_75s=$alive; engine.log=$(if ($engineLog) { $engineLog.FullName } else { 'none' })"
  if ($engineLog) { Copy-Item $engineLog.FullName "$share\app-engine.log" -ErrorAction SilentlyContinue }
  if (-not $a.HasExited) { Stop-Process -Id $a.Id -Force -ErrorAction SilentlyContinue }
}
Step 'app_launches' $appOk $appDetail

# --- verdict ---
$fails = @($result.Keys | Where-Object { -not $result[$_].pass })
$final = [ordered]@{
  verdict   = $(if ($fails.Count -eq 0) { 'PASS' } else { 'FAIL' })
  failed    = $fails
  checks    = $result
  installer = $InstallerName
  machine   = "$($env:COMPUTERNAME) / Windows $([System.Environment]::OSVersion.Version) (sandbox)"
  when      = (Get-Date -Format o)
}
$final | ConvertTo-Json -Depth 5 | Set-Content "$share\result.json"
Say "VERDICT: $($final.verdict) $(if ($fails) { "(failed: $($fails -join ', '))" })"
