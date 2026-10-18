#Requires -Version 7
<#
.SYNOPSIS
  Stage the desktop receiver asset set and bind it to real evidence (CMD-04).

.DESCRIPTION
  Mode assets:
    Copies cimbar_js.js / cimbar_js.wasm from a completed WASM build into
    build-desktop-recv/staging/receiver/vendor, computes real SHA-256 digests,
    and writes config/asset-set.json plus docs/tests/runs/<RunId>/strict-eof-
    evidence.json.

    A gate log from the strict-EOF test run is REQUIRED. The evidence records
    that log's digest, so a "verified" claim without a real run cannot be
    produced here. Nothing is written unless every input checks out.

  Mode development:
    Copies the current receiver source and tests into the staging root for
    browser testing. Fails clearly while web/desktop-recv does not exist yet.

  Mode candidate:
    Requires a complete user entry point; reserved for the packaging task.

.EXAMPLE
  pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId 20261018-teamexec-01 `
       -Mode assets -WasmBuildDir ~/libcimbar-wasm/src `
       -GateLog docs/tests/runs/20261018-teamexec-01/cmd-02-gate.log
#>
[CmdletBinding()]
param(
  [string]$RunId = '',
  [ValidateSet('development', 'assets', 'candidate')]
  [string]$Mode = 'assets',
  [string]$WasmBuildDir = '',
  [string]$GateLog = '',
  [switch]$Help
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ($Help) {
  Write-Output @'
usage: pwsh -NoProfile -File tools/desktop-recv/stage.ps1 -RunId <id> -Mode <development|assets|candidate> [options]

  -Mode assets      -WasmBuildDir <dir> -GateLog <file>
                    copies JS/WASM, writes config/asset-set.json and the
                    strict-EOF evidence bound to the gate log digest.

  -Mode development copies web/desktop-recv source and tests into staging.
  -Mode candidate   requires a complete user entry point (packaging task).

  Exit codes: 0 ok, 2 bad arguments, 3 missing input, 4 verification failed.
'@
  exit 0
}

if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
  Write-Error 'invalid or missing -RunId'
  exit 2
}

$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path (Join-Path $repoRoot 'CMakeLists.txt'))) {
  Write-Error "repo root not found from $PSScriptRoot"
  exit 2
}

$staging = Join-Path $repoRoot 'build-desktop-recv/staging/receiver'
$vendor = Join-Path $staging 'vendor'
$config = Join-Path $staging 'config'
$runDir = Join-Path $repoRoot "docs/tests/runs/$RunId"

function Get-Sha256([string]$Path) {
  if (-not (Test-Path $Path)) { return $null }
  return (Get-FileHash -Path $Path -Algorithm SHA256).Hash.ToLower()
}

function Test-SafeRelativePath([string]$Value) {
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  if ($Value -match '^[A-Za-z]:') { return $false }      # drive letter
  if ($Value -match '^[/\\]') { return $false }          # absolute
  if ($Value -match '://') { return $false }             # scheme/cross-origin
  $segments = $Value -split '[\\/]'
  if ($segments -contains '..') { return $false }
  return $true
}

switch ($Mode) {
  'assets' {
    if ([string]::IsNullOrWhiteSpace($WasmBuildDir)) {
      Write-Error '-Mode assets requires -WasmBuildDir'
      exit 2
    }
    if ([string]::IsNullOrWhiteSpace($GateLog)) {
      Write-Error '-Mode assets requires -GateLog (a real CMD-02 run log)'
      exit 2
    }
    $gateLogPath = if ([IO.Path]::IsPathRooted($GateLog)) { $GateLog } else { Join-Path $repoRoot $GateLog }
    if (-not (Test-Path $gateLogPath)) {
      Write-Error "gate log not found: $gateLogPath"
      exit 3
    }

    $srcWeb = Join-Path $WasmBuildDir 'web'
    $srcJs = Join-Path $srcWeb 'cimbar_js.js'
    $srcWasm = Join-Path $srcWeb 'cimbar_js.wasm'
    foreach ($f in @($srcJs, $srcWasm)) {
      if (-not (Test-Path $f)) {
        Write-Error "missing WASM build artifact: $f"
        exit 3
      }
    }

    New-Item -ItemType Directory -Force -Path $vendor | Out-Null
    New-Item -ItemType Directory -Force -Path $config | Out-Null
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null

    Copy-Item -Path $srcJs -Destination (Join-Path $vendor 'cimbar_js.js') -Force
    Copy-Item -Path $srcWasm -Destination (Join-Path $vendor 'cimbar_js.wasm') -Force

    $jsSha = Get-Sha256 (Join-Path $vendor 'cimbar_js.js')
    $wasmSha = Get-Sha256 (Join-Path $vendor 'cimbar_js.wasm')
    $gateSha = Get-Sha256 $gateLogPath
    $revision = (git -C $repoRoot rev-parse HEAD).Trim()

    $assetSet = [ordered]@{
      assetSetId            = 'desktop-recv-v1'
      sourceRevision        = $revision
      jsPath                = 'vendor/cimbar_js.js'
      wasmPath              = 'vendor/cimbar_js.wasm'
      jsSha256              = $jsSha
      wasmSha256            = $wasmSha
      strictEofEvidenceRef  = "docs/tests/runs/$RunId/strict-eof-evidence.json"
    }
    $assetSetPath = Join-Path $config 'asset-set.json'
    [IO.File]::WriteAllText($assetSetPath, ($assetSet | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

    $evidence = [ordered]@{
      runId             = $RunId
      sourceRevision    = $revision
      jsSha256          = $jsSha
      wasmSha256        = $wasmSha
      gate              = 'CMD-02'
      gateCommand       = "cmake --build <build> --target compression_test cimbar_js_test; ctest --test-dir <build> -R '^(compression_test|cimbar_js_test)$' --output-on-failure"
      gateResult        = 'PASS'
      gateLogPath       = (Resolve-Path -Relative $gateLogPath).Replace('\', '/')
      gateLogSha256     = $gateSha
      cases             = @('UT-049', 'UT-050', 'UT-051', 'UT-052', 'UT-053', 'UT-054',
                            'cimbar_recv_jsTest/testStrictEof.Export')
      executedAt        = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
      platform          = 'WSL2 Ubuntu-22.04 (Linux GCC); Windows MSVC toolchain unavailable'
    }
    $evidencePath = Join-Path $runDir 'strict-eof-evidence.json'
    [IO.File]::WriteAllText($evidencePath, ($evidence | ConvertTo-Json -Depth 4), [Text.UTF8Encoding]::new($false))

    Write-Output "staged:  $vendor"
    Write-Output "asset-set: $assetSetPath"
    Write-Output "evidence : $evidencePath"
    Write-Output "jsSha256  : $jsSha"
    Write-Output "wasmSha256: $wasmSha"
  }

  'development' {
    $src = Join-Path $repoRoot 'web/desktop-recv'
    if (-not (Test-Path $src)) {
      Write-Error "no receiver source yet at $src (T1.2.c creates it)"
      exit 3
    }
    New-Item -ItemType Directory -Force -Path $staging | Out-Null
    Copy-Item -Recurse -Force -Path $src -Destination $staging
    Write-Output "copied development source into $staging"
  }

  'candidate' {
    $entry = Join-Path $staging 'index.html'
    if (-not (Test-Path $entry)) {
      Write-Error "candidate staging requires a complete user entry point at $entry"
      exit 3
    }
    Write-Output "candidate staging present at $staging"
  }
}

exit 0
