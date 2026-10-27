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
  Exit codes: 0 started, 2 bad arguments/runtime, 3 port busy, 4 missing files,
              5 the server process failed to start or never listened.
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

# Every argument keeps its boundary. Start-Process joins string arrays with
# spaces and does not add quotes itself, so a path with spaces (or non-ASCII)
# was previously truncated at the first space (round-1 review C-01).
function Quote-Argument([string]$value) {
  if ($value -notmatch '[\s"]') { return $value }
  return '"' + ($value -replace '"', '\"') + '"'
}
$arguments = @($server, '--port', "$Port", '--directory', $root) |
  ForEach-Object { Quote-Argument $_ }

$stamp = [guid]::NewGuid().ToString('N')
$outLog = Join-Path ([System.IO.Path]::GetTempPath()) "cimbar-recv-$stamp.out.log"
$errLog = Join-Path ([System.IO.Path]::GetTempPath()) "cimbar-recv-$stamp.err.log"
$process = Start-Process -FilePath $python -ArgumentList $arguments -PassThru `
  -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog
Write-Output "server pid $($process.Id)"

# Readiness: the launcher is only successful when the loopback endpoint
# actually accepts connections. A process that dies (bad argument, missing
# module) or never binds must end in a non-zero exit with the real cause.
function Test-LoopbackPort([int]$ProbePort, [int]$TimeoutMs = 500) {
  $client = $null
  try {
    $client = [System.Net.Sockets.TcpClient]::new()
    $wait = $client.BeginConnect('127.0.0.1', $ProbePort, $null, $null)
    if (-not $wait.AsyncWaitHandle.WaitOne($TimeoutMs)) { return $false }
    $client.EndConnect($wait)
    return $true
  }
  catch { return $false }
  finally { if ($client) { $client.Dispose() } }
}

$deadline = (Get-Date).AddSeconds(10)
$listening = $false
while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) { break }
  if (Test-LoopbackPort -ProbePort $Port) { $listening = $true; break }
  Start-Sleep -Milliseconds 200
}

if (-not $listening) {
  $detail = ''
  if (Test-Path $errLog) { $detail = (Get-Content -Path $errLog -Tail 20) -join [Environment]::NewLine }
  [Console]::Error.WriteLine("the server did not listen on 127.0.0.1:$Port")
  if ($process.HasExited) {
    [Console]::Error.WriteLine("server process exited with code $($process.ExitCode)")
  }
  if ($detail) { [Console]::Error.WriteLine($detail) }
  [Console]::Error.WriteLine("diagnostic logs: $outLog ; $errLog")
  exit 5
}

if (-not $NoBrowser) {
  $edge = @(
    'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    'C:\Program Files\Microsoft\Edge\Application\msedge.exe'
  ) | Where-Object { Test-Path $_ } | Select-Object -First 1
  if ($edge) { Start-Process -FilePath $edge -ArgumentList $url | Out-Null }
}

exit 0
