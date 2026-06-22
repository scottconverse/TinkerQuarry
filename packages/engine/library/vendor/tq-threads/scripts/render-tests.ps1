<#
.SYNOPSIS
    Render the tq_threads test suite headlessly with OpenSCAD and report pass/fail.

.DESCRIPTION
    Exports STL(s) from the .scad test files, captures OpenSCAD's stderr, and
    fails (exit 1) if OpenSCAD errors or emits a "not a valid 2-manifold"
    warning.  Use this in CI or before committing.

.PARAMETER OpenSCAD
    Path to openscad(.exe). If omitted, common install locations are probed.

.PARAMETER Heavy
    Also render the heavy demo grid (slow: minutes).

.PARAMETER OutDir
    Where to write STL output (default: ./_render_out).

.EXAMPLE
    pwsh scripts/render-tests.ps1
.EXAMPLE
    pwsh scripts/render-tests.ps1 -OpenSCAD "C:\Program Files\OpenSCAD\openscad.exe" -Heavy

.NOTES
    Runs on BOTH Windows PowerShell 5.1 and PowerShell 7+ (pwsh). No PS7-only
    syntax is used.

    On Windows, prefer the console build "openscad.com" (returns exit codes and
    stderr to the console correctly); "openscad.exe" is the GUI build and may not
    surface console output. This script auto-detects ".com" first, then ".exe".

    Expected render times (typical desktop):
      fast suite  (tq_threads_fast_tests.scad) :  ~2-8  seconds
      examples    (SHOW=all)                    :  ~30-90 seconds
      heavy grid  (tq_threads_heavy_tests.scad) :  ~1-5  minutes (N-way union)
#>
[CmdletBinding()]
param(
    [string]$OpenSCAD = "",
    [switch]$Heavy,
    [string]$OutDir = "_render_out"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot      # repo root (scripts/..)

function Resolve-OpenSCAD([string]$hint) {
    $cands = @()
    if ($hint) { $cands += $hint }
    # Prefer the Windows console build (.com) -- it returns exit codes/stderr to
    # the console; the GUI build (.exe) may not.
    $cands += @(
        "C:\Program Files\OpenSCAD\openscad.com",
        "C:\Program Files\OpenSCAD\openscad.exe",
        "C:\Program Files\OpenSCAD (Nightly)\openscad.com",
        "C:\Program Files\OpenSCAD (Nightly)\openscad.exe",
        "C:\Users\Scott\Desktop\CODE\_tools\openscad\openscad-2021.01\openscad.com",
        "C:\Users\Scott\Desktop\CODE\_tools\openscad\openscad-2021.01\openscad.exe",
        "openscad.com",
        "openscad"
    )
    foreach ($c in $cands) {
        $cmd = Get-Command $c -ErrorAction SilentlyContinue
        if ($cmd) { return $cmd.Source }
        if (Test-Path $c) { return $c }
    }
    throw "OpenSCAD not found. Pass -OpenSCAD <path>."
}

$oscad = Resolve-OpenSCAD $OpenSCAD
Write-Host "OpenSCAD : $oscad"
$outAbs = Join-Path $root $OutDir
New-Item -ItemType Directory -Force -Path $outAbs | Out-Null

# files to render: name -> scad
$jobs = [ordered]@{ "fast" = "tq_threads_fast_tests.scad" }
if ($Heavy) { $jobs["heavy"] = "tq_threads_heavy_tests.scad" }

$fail = 0
foreach ($name in $jobs.Keys) {
    $scad = Join-Path $root $jobs[$name]
    $stl  = Join-Path $outAbs "$name.stl"
    $err  = Join-Path $outAbs "$name.stderr.txt"
    Write-Host ("`n=== rendering {0}  ({1}) ===" -f $name, $jobs[$name])
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    # stderr is captured to a file; do not redirect through PowerShell's pipeline
    $p = Start-Process -FilePath $oscad -ArgumentList @("-o", $stl, $scad) `
                       -NoNewWindow -Wait -PassThru -RedirectStandardError $err
    $sw.Stop()
    $secs = [math]::Round($sw.Elapsed.TotalSeconds, 1)
    $stderr = if (Test-Path $err) { Get-Content $err -Raw } else { "" }   # PS 5.1-safe (no ternary)
    $warn = $stderr -match "WARNING|ERROR|not a valid 2-manifold"
    $facets = if ($stderr -match "Facets:\s*(\d+)") { $Matches[1] } else { "?" }
    $okExit = ($p.ExitCode -eq 0)
    $okStl  = (Test-Path $stl) -and ((Get-Item $stl).Length -gt 0)
    if ($okExit -and $okStl -and -not $warn) {
        Write-Host ("  PASS  exit={0}  facets={1}  {2}s  -> {3}" -f $p.ExitCode, $facets, $secs, $stl) -ForegroundColor Green
    } else {
        $fail++
        Write-Host ("  FAIL  exit={0}  warn={1}  stl={2}  {3}s" -f $p.ExitCode, [bool]$warn, $okStl, $secs) -ForegroundColor Red
        if ($stderr) { Write-Host ("  --- stderr ---`n{0}" -f $stderr) }
    }
}

if ($fail -gt 0) { Write-Host "`n$fail job(s) FAILED." -ForegroundColor Red; exit 1 }
Write-Host "`nAll render jobs passed." -ForegroundColor Green
exit 0
