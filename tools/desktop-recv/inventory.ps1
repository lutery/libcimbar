#Requires -Version 7
<#
.SYNOPSIS
  Read-only environment inventory for the desktop receiver pipeline (CMD-01).

.DESCRIPTION
  Records tool versions as facts. Capabilities stay NOT_RUN until a real run
  proves them; an installed tool is never treated as a passing capability.

  Reads .github/workflows/ci.yml, .github/workflows/wasm.yml and vcpkg.json
  references only to record the build entries the plan names; it does not run
  builds or trigger any authorization prompt.

.EXAMPLE
  pwsh -NoProfile -File tools/desktop-recv/inventory.ps1 -RunId 20261018-teamexec-01
#>
[CmdletBinding()]
param(
  [string]$RunId = '',
  [switch]$Help
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ($Help) {
  Write-Output @'
usage: pwsh -NoProfile -File tools/desktop-recv/inventory.ps1 -RunId <id>

  Read-only inventory for CMD-01. Writes docs/tests/runs/<id>/environment.json.
  Tool versions are recorded as facts; capabilities are NOT_RUN until a real
  run proves them. Missing tools are listed with a recovery step.
'@
  exit 0
}

if ($RunId -notmatch '^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$') {
  Write-Error 'invalid or missing -RunId (must match ^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$)'
  exit 2
}

function Resolve-RepoRoot {
  # inventory.ps1 lives at tools/desktop-recv/, repo root is two levels up.
  $root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
  if (-not (Test-Path (Join-Path $root 'CMakeLists.txt'))) {
    throw "repo root not found from $PSScriptRoot"
  }
  return $root
}

function Get-ToolInfo {
  param([string]$Name, [string[]]$VersionArgs)
  try {
    $cmd = Get-Command $Name -ErrorAction Stop
    $raw = & $cmd.Source @VersionArgs 2>$null
    return @{
      path    = $cmd.Source
      version = @($raw)[0]
    }
  }
  catch {
    return @{
      path    = $null
      version = $null
      status  = 'NOT_RUN'
    }
  }
}

function Get-WslFirstLine {
  param([string]$Command)
  try {
    $out = wsl -e sh -lc $Command 2>$null
    return @($out)[0]
  }
  catch {
    return $null
  }
}

function Get-DockerImageTag {
  param([string]$Image)
  try {
    $out = wsl -e sh -lc "docker image ls $Image --format '{{.Repository}}:{{.Tag}} {{.Size}}'"
    return @($out)[0]
  }
  catch {
    return $null
  }
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

$runDir = Join-Path $repoRoot "docs/tests/runs/$RunId"
if (-not (Test-Path $runDir)) {
  New-Item -ItemType Directory -Force -Path $runDir | Out-Null
}

$osCaption = ($PSVersionTable.OS ?? '').Trim()
$baseline = (git rev-parse --short HEAD)
$appliedDpi = $null
try {
  $appliedDpi = [int](Get-ItemProperty 'HKCU:\Control Panel\Desktop\WindowMetrics' -Name AppliedDPI -ErrorAction Stop).AppliedDPI
}
catch { $appliedDpi = $null }

$resolution = $null
try {
  $vc = Get-CimInstance -ClassName Win32_VideoController -ErrorAction Stop |
    Select-Object -First 1
  if ($vc) {
    $resolution = "$($vc.CurrentHorizontalResolution)x$($vc.CurrentVerticalResolution)"
  }
}
catch { $resolution = $null }

$edge = $null
try {
  $edgeExe = Get-Command msedge -ErrorAction SilentlyContinue
  if (-not $edgeExe) {
    foreach ($p in @(
      'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
      'C:\Program Files\Microsoft\Edge\Application\msedge.exe')) {
      if (Test-Path $p) { $edgeExePath = $p; break }
    }
  }
  else { $edgeExePath = $edgeExe.Source }

  if ($edgeExePath -and (Test-Path $edgeExePath)) {
    $vi = (Get-Item $edgeExePath).VersionInfo.ProductVersion
    $edge = @{ path = $edgeExePath; version = $vi }
  }
}
catch { $edge = $null }

$wslOpenCv = Get-WslFirstLine 'pkg-config --modversion opencv4'
$wslGlfw = Get-WslFirstLine 'pkg-config --modversion glfw3'
$wslGles = Get-WslFirstLine 'test -f /usr/include/GLES3/gl3.h && echo present || echo missing'
$wslDocker = Get-WslFirstLine 'command -v docker'
$wslEmsdkImage = Get-DockerImageTag 'emscripten/emsdk'

$tools = [ordered]@{}
foreach ($t in @(
    @{ name = 'git'; args = @('--version') },
    @{ name = 'cmake'; args = @('--version') },
    @{ name = 'python'; args = @('--version') },
    @{ name = 'node'; args = @('--version') },
    @{ name = 'pwsh'; args = @('-NoProfile', '-Command', '$PSVersionTable.PSVersion.ToString()') },
    @{ name = 'ffmpeg'; args = @('-version') },
    @{ name = 'tar'; args = @('--version') }
  )) {
  $tools[$t.name] = Get-ToolInfo -Name $t.name -VersionArgs $t.args
}

$missing = @()
if (-not $tools['ffmpeg'].version) {
  $missing += [ordered]@{
    tool     = 'ffmpeg'
    why      = 'not on PATH; needed for real-recording production in batch E2E steps that require re-encoding'
    recovery = 'add an existing local copy to PATH (e.g. E:\Program Files\ShareX\ffmpeg.exe) or install a release build'
  }
}

$env3 = [ordered]@{
  runId         = $RunId
  generatedAt   = (Get-Date -Format 'yyyy-MM-ddTHH:mm:sszzz')
  baselineCommit = $baseline
  host          = [ordered]@{
    os           = $osCaption
    pwshVersion  = $PSVersionTable.PSVersion.ToString()
    machine      = $env:COMPUTERNAME
    appliedDpi   = $appliedDpi
    resolution   = $resolution
  }
  tools         = $tools
  wsl           = [ordered]@{
    distro         = (Get-WslFirstLine 'lsb_release -ds 2>/dev/null || cat /etc/os-release | head -1')
    opencv4        = $wslOpenCv
    glfw3          = $wslGlfw
    gles3Header    = $wslGles
    dockerPath     = $wslDocker
    emsdkImage     = $wslEmsdkImage
  }
  browser       = [ordered]@{
    edge = $edge
  }
  originalSender = [ordered]@{
    entry      = 'web/index.html'
    present    = (Test-Path (Join-Path $repoRoot 'web/index.html'))
    mode       = 'B (68)'
  }
  capabilities  = [ordered]@{
    realtimeCapture = 'NOT_RUN'
    videoImport     = 'NOT_RUN'
    savePicker      = 'NOT_RUN'
    externalSha256  = 'NOT_RUN'
    decoderWasm     = 'NOT_RUN'
  }
  missing       = $missing
  notes         = @(
    'Tool versions are inventory facts, not capability PASS.',
    'Capabilities stay NOT_RUN until a real run provides evidence.',
    'WSL docker daemon proxy was retargeted to 127.0.0.1:10802 at owner direction (previous LAN address unreachable from WSL).'
  )
}

$payload = $env3 | ConvertTo-Json -Depth 8
$outPath = Join-Path $runDir 'environment.json'
[IO.File]::WriteAllText($outPath, $payload, [Text.UTF8Encoding]::new($false))

Write-Output "wrote $outPath"
Write-Output ($payload | ConvertFrom-Json | ConvertTo-Json -Depth 2 | Out-String)