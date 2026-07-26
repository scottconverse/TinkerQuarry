@echo off
pwsh.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "%~dp0ensure-engine-staging.ps1"
if errorlevel 1 exit /b %errorlevel%
"%TQ_REAL_CARGO%" %*
exit /b %errorlevel%
