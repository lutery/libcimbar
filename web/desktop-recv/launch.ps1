#Requires -Version 7
<#
.SYNOPSIS
  Start the Cimbar desktop receiver on the loopback interface.

.DESCRIPTION
  Resolves everything relative to this script (PSScriptRoot), checks that the
  port is free, then starts server.py bound to 127.0.0.1 only. The page does
  not register a Service Worker.

.EXAMPLE
  pwsh -NoProfile -File launch.ps1 -Port 8766
#>
[CmdletBinding()]
param(
  [int]$Port = 8766,
  [switch]$NoBrowser,
  [switch]$Help
)

Set-StrictMode -Version 3.0
$ErrorActionPreference = 'Stop'

if ($Help) {
  Write-Output @'
usage: pwsh -NoProfile -File launch.ps1 [-Port 8766] [-NoBrowser]

  Serves this directory on http://127.0.0.1:<Port> and opens a browser.
  Exit codes: 0 started, 2 bad arguments/runtime, 3 port busy, 4 missing files.
'@
  exit 0
}

$root = $PSScriptRoot
$server = Join-Path $root 'server.py'
if (-not (Test-Path $server)) {
  [Console]::Error.WriteLine("server.py not found next to launch.ps1 ($root)")
  exit 4
}
foreach ($required in @('index.html', 'config/asset-set.json', 'vendor/cimbar_js.wasm')) {
  if (-not (Test-Path (Join-Path $root $required))) {
    [Console]::Error.WriteLine("missing required file: $required")
    exit 4
  }
}

$python = $null
foreach ($candidate in @('python', 'py')) {
  $cmd = Get-Command $candidate -ErrorAction SilentlyContinue
  if ($cmd) { $python = $cmd.Source; break }
}
if (-not $python) {
  [Console]::Error.WriteLine('python is not available on PATH; install Python 3 or start server.py manually')
  exit 2
}

$listener = $null
try {
  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  $listener.Start()
}
catch {
  [Console]::Error.WriteLine("port $Port is already in use; stop the other process or pass -Port <other>")
  exit 3
}
finally {
  if ($listener) { $listener.Stop() }
}

$url = "http://127.0.0.1:$Port/"
Write-Output "serving $root"
Write-Output "open $url"

$arguments = @($server, '--port', "$Port", '--directory', $root)
$process = Start-Process -FilePath $python -ArgumentList $arguments -PassThru -WindowStyle Hidden
Write-Output "server pid $($process.Id)"

if (-not $NoBrowser) {
  Start-Sleep -Milliseconds 700
  $edge = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) { Start-Process -FilePath $edge -ArgumentList $url | Out-Null }
}

exit 0
