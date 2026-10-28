@echo off
rem First-launch shim for the Cimbar Desktop Receiver.
rem
rem Changes into the package directory and starts the launcher, so terminal
rem users can double-click or run one short command. Works from any path,
rem including directories whose names mix CJK characters and spaces.
rem (An earlier comment here blamed pwsh for such paths. That was wrong:
rem the real cause was a corrupted GBK-mojibake copy of the package in our
rem test chain. See proof/E2E-1/ under docs/tests/runs/20261019-teamexec-02/.)
cd /d "%~dp0"
rem Prefer PowerShell 7; fall back to Windows PowerShell 5.1 (with the
rem execution policy bypassed, since the default policy can refuse -File).
where pwsh >nul 2>nul
if %errorlevel%==0 (
  pwsh -NoProfile -File launch.ps1 %*
) else (
  powershell -NoProfile -ExecutionPolicy Bypass -File launch.ps1 %*
)
