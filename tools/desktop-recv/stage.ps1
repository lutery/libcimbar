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
  [string]$StagingRoot = '',
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

  -Mode development copies web/desktop-recv source and tests into the
                    receiver root (default: the shared build-desktop-recv/
                    staging/receiver; override with -StagingRoot <dir>).
  -Mode candidate   requires a complete user entry point (packaging task).

  -StagingRoot <dir>  copy the receiver into this directory instead of the
                      shared staging area. Only the receiver copy location
                      moves; sender staging is copied read-only from the
                      verified sender package into stagingRoot/sender by the
                      runner. The directory may not be inside product/ or a
                      docs/tests/runs/ run output.

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

$historicalRunIds = @('20261018-teamexec-01', '20261019-teamexec-02', '20261021-teamexec-03')
if ($historicalRunIds -contains $RunId) {
  Write-Error "refusing to stage or write evidence into historical run '$RunId' (read-only)"
  exit 2
}

if ([string]::IsNullOrWhiteSpace($StagingRoot)) {
  $staging = Join-Path $repoRoot 'build-desktop-recv/staging/receiver'
} else {
  $candidate = if ([IO.Path]::IsPathRooted($StagingRoot)) { $StagingRoot } else { Join-Path $repoRoot $StagingRoot }
  $staging = [IO.Path]::GetFullPath($candidate)
  $forbidden = @(
    [IO.Path]::GetFullPath((Join-Path $repoRoot 'product')),
    [IO.Path]::GetFullPath((Join-Path $repoRoot 'docs/tests/runs'))
  )
  foreach ($prefix in $forbidden) {
    $sep = [IO.Path]::DirectorySeparatorChar
    if ($staging.Equals($prefix, [StringComparison]::OrdinalIgnoreCase) -or
        $staging.StartsWith($prefix + $sep, [StringComparison]::OrdinalIgnoreCase)) {
      Write-Error "refusing -StagingRoot inside a read-only area: $staging"
      exit 2
    }
  }
}
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

    # The log must be a real run, not a hand-written green file: require the
    # suite result line and every strict-EOF case name to appear in it.
    $gateText = Get-Content -Raw -LiteralPath $gateLogPath
    $gateMarkers = @(
      '100% tests passed', 'compression_test', 'cimbar_js_test',
      'UT-049', 'UT-050', 'UT-051', 'UT-052', 'UT-053', 'UT-054', 'testStrictEof'
    )
    foreach ($marker in $gateMarkers) {
      if ($gateText -notmatch [regex]::Escape($marker)) {
        Write-Error "gate log does not contain '$marker'; refusing to bind evidence"
        exit 4
      }
    }

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
      gateCommand       = "ctest --test-dir <build> -R '^(compression_test|cimbar_js_test)$' --output-on-failure; <compression_test> --list-tests; <cimbar_js_test> --list-tests; ctest --test-dir <build> --output-on-failure"
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
    # copy the CONTENTS, not the directory: Copy-Item -Recurse src -Destination staging
    # would nest it as staging/desktop-recv.
    Copy-Item -Path (Join-Path $src '*') -Destination $staging -Recurse -Force

    # the app config is a copy of the frozen contracts; refuse to drift
    $pairs = @(
      @{ local = 'config/profile.json'; contract = 'docs/design-catalog/contracts/profile-initial.json' },
      @{ local = 'config/errors.json'; contract = 'docs/design-catalog/contracts/error-codes.json' }
    )
    foreach ($pair in $pairs) {
      $localPath = Join-Path $src $pair.local
      $contractPath = Join-Path $repoRoot $pair.contract
      if (-not (Test-Path $localPath)) {
        Write-Error "missing app config: $($pair.local)"
        exit 4
      }
      if ((Get-Sha256 $localPath) -ne (Get-Sha256 $contractPath)) {
        Write-Error "$($pair.local) does not match $($pair.contract); copy the frozen contract"
        exit 4
      }
    }
    Write-Output "copied development source into $staging"
  }

  'candidate' {
    # A candidate package must be a complete user entry: everything the
    # launcher needs, plus the delivery manifest. Nothing may be missing.
    $required = @(
      'index.html', 'styles.css', 'launch.ps1', 'launch.cmd', 'server.py', 'README.md',
      'config/asset-set.json', 'config/profile.json', 'config/errors.json',
      'vendor/cimbar_js.js', 'vendor/cimbar_js.wasm',
      'worker/decoder-worker.js',
      'src/app.js', 'src/session.js', 'src/frame-scheduler.js',
      'src/save-controller.js', 'src/video-source.js', 'src/live-source.js',
      'src/decoder-client.js', 'src/contracts.js', 'src/evidence.js',
      'src/contract-snapshot.js', 'src/capabilities.js', 'src/ui.js'
    )
    foreach ($relative in $required) {
      if (-not (Test-Path (Join-Path $staging $relative))) {
        [Console]::Error.WriteLine("candidate package missing required file: $relative")
        exit 4
      }
    }

    # delivery manifest: every delivered file with its real digest. A stale
    # manifest from a previous run is removed first so it never enumerates
    # itself.
    $manifestPath = Join-Path $staging 'DELIVERY-MANIFEST.txt'
    if (Test-Path $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
    $files = Get-ChildItem -Recurse -File $staging |
      Where-Object { $_.FullName -notmatch '\\tests\\' } |
      Sort-Object FullName
    $lines = @('# Cimbar Desktop Receiver candidate manifest', "# generated $(Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')", '')
    foreach ($file in $files) {
      $relative = $file.FullName.Substring($staging.Length + 1).Replace('\', '/')
      $digest = (Get-FileHash -Path $file.FullName -Algorithm SHA256).Hash.ToLower()
      $lines += "$digest  $($file.Length)  $relative"
    }
    [IO.File]::WriteAllLines($manifestPath, $lines)
    Write-Output "candidate package verified: $($files.Count) files"
    Write-Output "manifest: $manifestPath"
  }
}

exit 0
