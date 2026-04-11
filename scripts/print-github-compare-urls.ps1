<#
.SYNOPSIS
    GitHub compare 用の URL を3本（BASE...A, BASE...B, A...B）出力する。

.PARAMETER OwnerRepo
    例: t0k6/playwright-gemini-export

.PARAMETER Base
    比較のベースブランチ（例: main）

.PARAMETER BranchA
    ブランチ A

.PARAMETER BranchB
    ブランチ B
#>
param(
    [string] $OwnerRepo = "t0k6/playwright-gemini-export",
    [Parameter(Mandatory = $true)][string] $Base,
    [Parameter(Mandatory = $true)][string] $BranchA,
    [Parameter(Mandatory = $true)][string] $BranchB
)

function Encode-BranchSegment([string] $s) {
    [uri]::EscapeDataString($s) -replace '\+', '%20'
}

$root = "https://github.com/$OwnerRepo/compare"
$bA = Encode-BranchSegment $BranchA
$bB = Encode-BranchSegment $BranchB
$bBase = Encode-BranchSegment $Base

Write-Host "BASE...A : $root/$bBase...$bA"
Write-Host "BASE...B : $root/$bBase...$bB"
Write-Host "A...B    : $root/$bA...$bB"
