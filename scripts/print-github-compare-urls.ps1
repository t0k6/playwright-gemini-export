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
    [Parameter(Mandatory = $false)]
    [ValidateNotNullOrEmpty()]
    [string] $OwnerRepo = "t0k6/playwright-gemini-export",
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $Base,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $BranchA,
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $BranchB
)

function ConvertTo-EncodedBranchSegment([string] $s) {
    [uri]::EscapeDataString($s)
}

$root = "https://github.com/$OwnerRepo/compare"
$bA = ConvertTo-EncodedBranchSegment $BranchA
$bB = ConvertTo-EncodedBranchSegment $BranchB
$bBase = ConvertTo-EncodedBranchSegment $Base

Write-Output "BASE...A : $root/$bBase...$bA"
Write-Output "BASE...B : $root/$bBase...$bB"
Write-Output "A...B    : $root/$bA...$bB"
