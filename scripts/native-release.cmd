@echo off
setlocal

call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\LaunchDevCmd.bat" -arch=x64
if errorlevel 1 exit /b %errorlevel%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cargo test --manifest-path apps/ui/src-tauri/Cargo.toml
if errorlevel 1 exit /b %errorlevel%

pnpm.cmd tauri:build
if errorlevel 1 exit /b %errorlevel%
