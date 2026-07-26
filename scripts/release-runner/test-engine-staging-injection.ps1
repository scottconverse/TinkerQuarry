[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $PSCommandPath
$sourceHelper = Join-Path $scriptRoot "ensure-engine-staging.ps1"
$sourceWrapper = Join-Path $scriptRoot "cargo.cmd"
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$fixtureRoot = Join-Path $tempBase ("tq-engine-staging-fixture-" + [Guid]::NewGuid().ToString("N"))
$source = Join-Path $fixtureRoot "source"
$wrapperRoot = Join-Path $fixtureRoot "wrapper"
$nestedLink = Join-Path $fixtureRoot "nested\packages\engine\dist\staging"
$receiptPath = Join-Path $fixtureRoot "receipt.json"
$manifestPath = Join-Path $fixtureRoot "manifest.json"
$fakeCargo = Join-Path $fixtureRoot "fake-cargo.cmd"
$savedPath = $env:PATH

function Write-Manifest {
    param(
        [Parameter(Mandatory)][string]$Root,
        [Parameter(Mandatory)][string]$OutputPath
    )

    $manifest = @(
        Get-ChildItem -LiteralPath $Root -Recurse -File |
            Sort-Object FullName |
            ForEach-Object {
                [ordered]@{
                    path = $_.FullName.Substring($Root.Length + 1).Replace("\", "/")
                    size = $_.Length
                    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
                }
            }
    )
    ConvertTo-Json -InputObject $manifest -Depth 4 -Compress |
        Set-Content -LiteralPath $OutputPath -Encoding utf8
}

try {
    New-Item -ItemType Directory -Path (Join-Path $source "python") -Force | Out-Null
    New-Item -ItemType Directory -Path $wrapperRoot -Force | Out-Null
    Set-Content -LiteralPath (Join-Path $source "python\python.exe") -Value "fixture-python" -Encoding ascii
    Set-Content -LiteralPath (Join-Path $source "payload.txt") -Value "exact-payload" -Encoding ascii
    Copy-Item -LiteralPath $sourceHelper -Destination (Join-Path $wrapperRoot "ensure-engine-staging.ps1")
    Copy-Item -LiteralPath $sourceWrapper -Destination (Join-Path $wrapperRoot "cargo.cmd")
    @'
@echo off
if not "%~1"=="fixture-arg" exit /b 22
exit /b 23
'@ | Set-Content -LiteralPath $fakeCargo -Encoding ascii

    Write-Manifest -Root $source -OutputPath $manifestPath
    $manifestHash = (Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()

    $env:EXPECTED_RELEASE_GATE_RUN_ID = "29987927784"
    $env:EXPECTED_RELEASE_GATE_RUN_ATTEMPT = "2"
    $env:GITHUB_RUN_ID = "29987927784"
    $env:GITHUB_RUN_ATTEMPT = "2"
    $env:GITHUB_SHA = "wrong"
    $env:GITHUB_REF = "refs/tags/v1.5.1"
    $env:TQ_EXACT_ENGINE_STAGING = $source
    $env:TQ_ENGINE_STAGING_MANIFEST = $manifestPath
    $env:TQ_ENGINE_STAGING_MANIFEST_SHA256 = $manifestHash
    $env:TQ_NESTED_ENGINE_STAGING_LINK = $nestedLink
    $env:TQ_ENGINE_STAGING_INJECTION_RECEIPT = $receiptPath
    $env:TQ_REAL_CARGO = $fakeCargo
    $env:TQ_CARGO_WRAPPER_ROOT = $wrapperRoot
    $env:RUNNER_TEMP = $fixtureRoot

    $identityRefused = $false
    try {
        & (Join-Path $wrapperRoot "ensure-engine-staging.ps1")
    } catch {
        $identityRefused = $_.Exception.Message -match "wrong commit"
    }
    if (-not $identityRefused -or (Test-Path $nestedLink) -or (Test-Path $receiptPath)) {
        throw "wrong-identity fixture was not refused before staging injection"
    }

    $env:GITHUB_SHA = "ea75c5eb14a8da1e63d4f34aa84d8a6d3735eef8"
    $env:PATH = "$wrapperRoot;$savedPath"
    $resolvedCargo = (Get-Command cargo -ErrorAction Stop).Source
    if ([IO.Path]::GetFullPath($resolvedCargo) -ne [IO.Path]::GetFullPath((Join-Path $wrapperRoot "cargo.cmd"))) {
        throw "cargo wrapper did not win Windows command resolution"
    }
    & (Join-Path $wrapperRoot "cargo.cmd") "fixture-arg"
    if ($LASTEXITCODE -ne 23) {
        throw "cargo wrapper did not preserve the real Cargo exit code; got $LASTEXITCODE"
    }

    $linkItem = Get-Item -LiteralPath $nestedLink -Force
    $linkTarget = [IO.Path]::GetFullPath([string]@($linkItem.Target)[0])
    if ($linkItem.LinkType -ne "Junction" -or $linkTarget -ne [IO.Path]::GetFullPath($source)) {
        throw "successful fixture did not create the exact staging junction"
    }
    $receipt = Get-Content -LiteralPath $receiptPath -Raw | ConvertFrom-Json
    if (
        "$($receipt.run_id)" -ne "29987927784" -or
        "$($receipt.run_attempt)" -ne "2" -or
        $receipt.sha -ne $env:GITHUB_SHA -or
        $receipt.ref -ne $env:GITHUB_REF -or
        $receipt.source -ne [IO.Path]::GetFullPath($source) -or
        $receipt.link -ne $nestedLink -or
        $receipt.manifest_sha256 -ne $manifestHash
    ) {
        throw "successful fixture receipt did not bind the exact job and staging tree"
    }

    Remove-Item -LiteralPath $receiptPath -Force
    Set-Content -LiteralPath (Join-Path $source "payload.txt") -Value "tampered" -Encoding ascii
    $tamperRefused = $false
    try {
        & (Join-Path $wrapperRoot "ensure-engine-staging.ps1")
    } catch {
        $tamperRefused = $_.Exception.Message -match "source tree differs"
    }
    if (-not $tamperRefused -or (Test-Path $receiptPath)) {
        throw "tampered staging fixture was not refused before writing a new receipt"
    }

    Write-Host "engine staging injection fixture PASS: identity, manifest, junction, receipt, command resolution, and exit-code propagation"
} finally {
    $env:PATH = $savedPath
    if (Test-Path -LiteralPath $nestedLink) {
        [IO.Directory]::Delete($nestedLink, $false)
    }
    $resolvedFixtureRoot = [IO.Path]::GetFullPath($fixtureRoot)
    if (-not $resolvedFixtureRoot.StartsWith($tempBase, [StringComparison]::OrdinalIgnoreCase)) {
        throw "refusing to clean fixture outside the Windows temp directory: $resolvedFixtureRoot"
    }
    if (Test-Path -LiteralPath $resolvedFixtureRoot) {
        Remove-Item -LiteralPath $resolvedFixtureRoot -Recurse -Force
    }
}
