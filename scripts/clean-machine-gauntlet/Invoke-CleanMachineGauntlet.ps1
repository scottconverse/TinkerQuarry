# Host-side driver for the TinkerQuarry clean-machine install gauntlet.
#
#   .\Invoke-CleanMachineGauntlet.ps1 -Installer C:\path\TinkerQuarry_1.6.0_x64-setup.exe
#
# Stages a share, generates the .wsb, tears down any live sandbox, launches, and waits for the
# verdict. Exit code 0 = PASS, 1 = product FAIL, 2 = harness never produced a verdict.
# The constraints encoded as hard checks below were each learned from a failed run — see README.md.
[CmdletBinding()]
param(
  # The signed installer to test, exactly as published.
  [Parameter(Mandatory)][string]$Installer,
  # SHA256SUMS.txt as published. Defaults to one sitting next to the installer.
  [string]$Checksums,
  # Host folder mapped into the sandbox. MUST live outside %AppData% — see the guard below.
  [string]$ShareRoot = 'C:\dev\tq-gauntlet-share',
  # Seconds to let the hypervisor settle after killing a previous sandbox. Below ~60s the next
  # LogonCommand silently never fires.
  [int]$SettleSeconds = 90,
  # The guest must create logon-ran.txt promptly; if it does not, LogonCommand never fired and
  # waiting for a verdict is pointless.
  [int]$LogonDeadlineSeconds = 180,
  # Whole-run budget: install ~2min + app soak 75s + engine start + boot.
  [int]$VerdictDeadlineSeconds = 900,
  [int]$MemoryInMB = 8192
)
$ErrorActionPreference = 'Stop'
function Info($m) { Write-Host "[gauntlet] $m" }

# --- Inputs -----------------------------------------------------------------------------
if (-not (Test-Path $Installer)) { throw "Installer not found: $Installer" }
$installerItem = Get-Item $Installer
$installerName = $installerItem.Name
$expectedBytes = $installerItem.Length
# The name is interpolated into the .wsb LogonCommand, which is cmd.exe inside XML. Refuse the
# characters that would break that quoting rather than emit a subtly broken command line.
if ($installerName -match '[\s"''&<>|^%]') { throw "Installer file name must not contain spaces or shell metacharacters: $installerName" }
if (-not $Checksums) { $Checksums = Join-Path $installerItem.DirectoryName 'SHA256SUMS.txt' }
if (-not (Test-Path $Checksums)) { throw "Checksums file not found: $Checksums (pass -Checksums)" }
if (-not (Select-String -Path $Checksums -SimpleMatch $installerName -Quiet)) {
  throw "$Checksums has no line for $installerName - the guest checksum check would have nothing to compare against."
}

# --- CONSTRAINT 1: the mapped HostFolder must live outside %AppData% ---------------------
# Claude's shell runs in an MSIX container that redirects AppData paths. A share staged under
# AppData is written to the redirected copy while the sandbox maps the real one, so the guest sees
# an empty or stale folder and every write the guest makes disappears. Silent, total data loss.
$shareFull = [System.IO.Path]::GetFullPath($ShareRoot)
if ($shareFull -match '(?i)\\AppData\\') {
  throw "ShareRoot must be outside %AppData% (MSIX redirects AppData paths; the sandbox would map a different folder and all writes would be silently lost). Got: $shareFull"
}

# --- CONSTRAINT 2: full teardown + settle before (re)launching ---------------------------
# Relaunching Windows Sandbox immediately after killing it leaves the VM host in a state where the
# new instance boots but LogonCommand never fires — no error, no marker file, just a live desktop
# doing nothing. Kill everything, confirm it is gone, then wait.
$sbProcs = Get-Process -Name 'WindowsSandbox', 'WindowsSandboxClient', 'WindowsSandboxRemoteSession' -ErrorAction SilentlyContinue
if ($sbProcs) {
  Info "tearing down $($sbProcs.Count) running sandbox process(es)"
  $sbProcs | Stop-Process -Force -ErrorAction SilentlyContinue
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  while ($sw.Elapsed.TotalSeconds -lt 60 -and (Get-Process -Name 'WindowsSandbox*' -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 2 }
  if (Get-Process -Name 'WindowsSandbox*' -ErrorAction SilentlyContinue) { throw 'Sandbox processes did not exit; refusing to launch into a half-torn-down host.' }
  Info "processes gone; settling ${SettleSeconds}s before relaunch"
  Start-Sleep -Seconds $SettleSeconds
}

# --- Stage the share --------------------------------------------------------------------
New-Item -ItemType Directory -Force $shareFull | Out-Null
foreach ($stale in 'result.json', 'gauntlet-transcript.txt', 'readiness.log', 'logon-ran.txt', 'engine-stdout.log', 'engine-stderr.log', 'app-engine.log') {
  Remove-Item (Join-Path $shareFull $stale) -Force -ErrorAction SilentlyContinue
}
Remove-Item (Join-Path $shareFull 'engine-run') -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item $installerItem.FullName (Join-Path $shareFull $installerName) -Force
Copy-Item $Checksums (Join-Path $shareFull 'SHA256SUMS.txt') -Force
Copy-Item (Join-Path $PSScriptRoot 'run-gauntlet.ps1') (Join-Path $shareFull 'run-gauntlet.ps1') -Force
# Prove the staged copy is byte-complete on the host before the guest is asked to trust it.
$staged = Get-Item (Join-Path $shareFull $installerName)
if ($staged.Length -ne $expectedBytes) { throw "Staged installer is $($staged.Length) bytes, expected $expectedBytes." }
Info "staged $installerName ($expectedBytes bytes) into $shareFull"

# --- Generate the .wsb ------------------------------------------------------------------
# Generated, not checked in: HostFolder is an absolute host path, so a committed .wsb would carry
# one machine's layout and silently violate constraint 1 on any other machine.
$wsb = Join-Path $shareFull 'gauntlet.wsb'
$logon = "cmd.exe /c `"echo logon-command-fired %DATE% %TIME% &gt; C:\share\logon-ran.txt &amp; powershell.exe -ExecutionPolicy Bypass -NoProfile -File C:\share\run-gauntlet.ps1 -InstallerName $installerName -ExpectedBytes $expectedBytes`""
$wsbXml = @"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Enable</Networking>
  <MemoryInMB>$MemoryInMB</MemoryInMB>
  <MappedFolders>
    <MappedFolder>
      <HostFolder>$shareFull</HostFolder>
      <SandboxFolder>C:\share</SandboxFolder>
      <ReadOnly>false</ReadOnly>
    </MappedFolder>
  </MappedFolders>
  <LogonCommand>
    <Command>$logon</Command>
  </LogonCommand>
</Configuration>
"@
# No BOM: the .wsb proven in the v1.5.0 run had none, and PS 5.1's -Encoding UTF8 writes one.
[System.IO.File]::WriteAllText($wsb, $wsbXml, (New-Object System.Text.UTF8Encoding($false)))

# --- Launch and wait --------------------------------------------------------------------
Info "launching sandbox: $wsb"
Start-Process 'WindowsSandbox.exe' -ArgumentList "`"$wsb`""

$logonMarker = Join-Path $shareFull 'logon-ran.txt'
$resultPath = Join-Path $shareFull 'result.json'
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$logonSeen = $false
while ($sw.Elapsed.TotalSeconds -lt $VerdictDeadlineSeconds) {
  if (-not $logonSeen -and (Test-Path $logonMarker)) {
    $logonSeen = $true
    Info "LogonCommand fired at $([math]::Round($sw.Elapsed.TotalSeconds))s"
  }
  # Separate deadline: a missing marker is constraint 2, not a slow product. Name it that way.
  if (-not $logonSeen -and $sw.Elapsed.TotalSeconds -gt $LogonDeadlineSeconds) {
    Write-Warning "No logon-ran.txt after ${LogonDeadlineSeconds}s - LogonCommand never fired. This is the relaunch-too-soon failure; close the sandbox, wait, and rerun (see README constraint 2)."
    exit 2
  }
  if (Test-Path $resultPath) { break }
  Start-Sleep -Seconds 5
}
if (-not (Test-Path $resultPath)) {
  Write-Warning "No result.json after $([math]::Round($sw.Elapsed.TotalSeconds))s. Transcript: $(Join-Path $shareFull 'gauntlet-transcript.txt')"
  exit 2
}

$res = Get-Content $resultPath -Raw | ConvertFrom-Json
Info "verdict: $($res.verdict) after $([math]::Round($sw.Elapsed.TotalSeconds))s"
foreach ($k in $res.checks.PSObject.Properties.Name) {
  $c = $res.checks.$k
  Write-Host ("  {0}  {1,-22} {2}" -f $(if ($c.pass) { 'PASS' } else { 'FAIL' }), $k, $c.detail)
}
Info "artifacts in $shareFull (result.json, gauntlet-transcript.txt, readiness.log, engine-*.log)"
if ($res.verdict -eq 'PASS') { exit 0 } else { exit 1 }
