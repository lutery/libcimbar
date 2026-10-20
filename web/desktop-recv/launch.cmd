@echo off
rem First-launch shim for the Cimbar Desktop Receiver.
rem
rem Changes into the package directory and starts the launcher, so terminal
rem users can double-click or run one short command. NOTE: on platforms where
rem pwsh cannot load scripts from CJK+space directories (see README path
rem caveat), no form works - extract to an ASCII path. On healthy setups the
rem relative form below is the robust one.
cd /d "%~dp0"
pwsh -NoProfile -File launch.ps1 %*
