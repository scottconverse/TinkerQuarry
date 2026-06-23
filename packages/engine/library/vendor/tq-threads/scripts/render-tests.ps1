<#
.SYNOPSIS
    DEPRECATED alias -> scripts/render_proof.ps1 (the canonical render proof).
    Kept for backward compatibility with v0.2/v0.3 docs. Forwards all args.
#>
[CmdletBinding()] param([Parameter(ValueFromRemainingArguments=$true)] $Args)
Write-Warning "render-tests.ps1 is deprecated; use scripts/render_proof.ps1"
& (Join-Path $PSScriptRoot "render_proof.ps1") @Args
exit $LASTEXITCODE
