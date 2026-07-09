@echo off
setlocal

rem VsDevCmd.bat (NOT LaunchDevCmd.bat): LaunchDevCmd spawns an interactive `cmd /k` developer
rem prompt that blocks on stdin forever, hanging any unattended test:release run (it stalled the
rem v1.4.0 release gate for 76 minutes). VsDevCmd sets the environment in-place and returns.
rem Known install locations are probed directly; vswhere-in-for/f quoting breaks on the ")" in
rem "%ProgramFiles(x86)%" inside parenthesized blocks, so no vswhere and no ( ) blocks here.
set "VS_DEV_CMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VS_DEV_CMD%" set "VS_DEV_CMD=%ProgramFiles%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
if not exist "%VS_DEV_CMD%" set "VS_DEV_CMD=%ProgramFiles%\Microsoft Visual Studio\2022\Community\Common7\Tools\VsDevCmd.bat"
if not exist "%VS_DEV_CMD%" set "VS_DEV_CMD=%ProgramFiles%\Microsoft Visual Studio\2022\Professional\Common7\Tools\VsDevCmd.bat"
if not exist "%VS_DEV_CMD%" set "VS_DEV_CMD=%ProgramFiles%\Microsoft Visual Studio\2022\Enterprise\Common7\Tools\VsDevCmd.bat"

if not exist "%VS_DEV_CMD%" echo ERROR: Could not find Visual Studio 2022 VsDevCmd.bat. Install VS 2022 Build Tools with the C++ toolchain.
if not exist "%VS_DEV_CMD%" exit /b 2

call "%VS_DEV_CMD%" -arch=x64 -no_logo
if errorlevel 1 exit /b %errorlevel%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cargo test --manifest-path apps/ui/src-tauri/Cargo.toml
if errorlevel 1 exit /b %errorlevel%

pnpm.cmd --dir apps/ui exec tauri build --bundles nsis
if errorlevel 1 exit /b %errorlevel%

rem Refresh the raw exe's resource-dir engine from staging: tauri does not overwrite an existing
rem target\release\engine tree on rebuild, so the runtime smoke was exercising a stale engine
rem (0.9.3) while the NSIS payload shipped fresh (0.9.4). robocopy exit codes below 8 = success.
robocopy packages\engine\dist\staging apps\ui\src-tauri\target\release\engine /MIR /NFL /NDL /NJH /NJS /NP
if %errorlevel% GEQ 8 exit /b %errorlevel%
exit /b 0
