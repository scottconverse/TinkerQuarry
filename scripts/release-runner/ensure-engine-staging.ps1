[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-RequiredEnvironmentValue {
    param([Parameter(Mandatory)][string]$Name)

    $value = [Environment]::GetEnvironmentVariable($Name)
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "engine staging refused: required environment variable $Name is absent"
    }
    return $value
}

function Get-StagingManifestHash {
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
    if ($manifest.Count -eq 0) {
        throw "engine staging refused: current staging manifest is empty"
    }
    ConvertTo-Json -InputObject $manifest -Depth 4 -Compress |
        Set-Content -LiteralPath $OutputPath -Encoding utf8
    return (Get-FileHash -LiteralPath $OutputPath -Algorithm SHA256).Hash.ToLowerInvariant()
}

$expectedRunId = Get-RequiredEnvironmentValue "EXPECTED_RELEASE_GATE_RUN_ID"
$expectedRunAttempt = Get-RequiredEnvironmentValue "EXPECTED_RELEASE_GATE_RUN_ATTEMPT"
$source = (Resolve-Path -LiteralPath (Get-RequiredEnvironmentValue "TQ_EXACT_ENGINE_STAGING")).Path
$recordedManifestPath = Get-RequiredEnvironmentValue "TQ_ENGINE_STAGING_MANIFEST"
$expectedManifest = Get-RequiredEnvironmentValue "TQ_ENGINE_STAGING_MANIFEST_SHA256"
$link = Get-RequiredEnvironmentValue "TQ_NESTED_ENGINE_STAGING_LINK"
$receiptPath = Get-RequiredEnvironmentValue "TQ_ENGINE_STAGING_INJECTION_RECEIPT"
$runnerTemp = Get-RequiredEnvironmentValue "RUNNER_TEMP"

if ($env:GITHUB_RUN_ID -ne $expectedRunId) {
    throw "engine staging refused: wrong run id"
}
if ($env:GITHUB_RUN_ATTEMPT -ne $expectedRunAttempt) {
    throw "engine staging refused: wrong run attempt"
}
if ($env:GITHUB_SHA -ne "ea75c5eb14a8da1e63d4f34aa84d8a6d3735eef8") {
    throw "engine staging refused: wrong commit"
}
if ($env:GITHUB_REF -ne "refs/tags/v1.5.1") {
    throw "engine staging refused: wrong ref"
}
if (-not (Test-Path -LiteralPath (Join-Path $source "python\python.exe"))) {
    throw "engine staging refused: verified source is incomplete"
}

$recordedManifestHash = (
    Get-FileHash -LiteralPath $recordedManifestPath -Algorithm SHA256
).Hash.ToLowerInvariant()
if ($recordedManifestHash -ne $expectedManifest) {
    throw "engine staging refused: recorded source manifest changed"
}
$currentManifestPath = Join-Path $runnerTemp "tq-engine-staging-injection-$PID.manifest.json"
$currentManifestHash = Get-StagingManifestHash -Root $source -OutputPath $currentManifestPath
Remove-Item -LiteralPath $currentManifestPath -Force
if ($currentManifestHash -ne $expectedManifest) {
    throw "engine staging refused: source tree differs from its verified manifest"
}

if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link -Force
    $actualTarget = [IO.Path]::GetFullPath([string]@($item.Target)[0])
    if (
        $item.LinkType -ne "Junction" -or
        $actualTarget -ne [IO.Path]::GetFullPath($source)
    ) {
        throw "engine staging refused: nested path is not the exact verified junction"
    }
} else {
    New-Item -ItemType Directory -Path (Split-Path -Parent $link) -Force | Out-Null
    New-Item -ItemType Junction -Path $link -Target $source | Out-Null
}

[ordered]@{
    run_id = $env:GITHUB_RUN_ID
    run_attempt = $env:GITHUB_RUN_ATTEMPT
    sha = $env:GITHUB_SHA
    ref = $env:GITHUB_REF
    source = $source
    link = $link
    manifest_sha256 = $expectedManifest
} | ConvertTo-Json | Set-Content -LiteralPath $receiptPath -Encoding utf8

