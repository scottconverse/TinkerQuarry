@echo off
setlocal

rem VsDevCmd.bat (NOT LaunchDevCmd.bat): LaunchDevCmd spawns an interactive `cmd /k` developer
rem prompt that waits on stdin forever, hanging any unattended run (it stalled the v1.4.0 release
rem gate for 76 minutes). VsDevCmd sets the environment in-place and returns.
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VS_DEV_CMD="

if exist "%VSWHERE%" (
  for /f "usebackq tokens=*" %%i in (`""%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath"`) do (
    set "VS_DEV_CMD=%%i\Common7\Tools\VsDevCmd.bat"
  )
)

if not defined VS_DEV_CMD (
  set "VS_DEV_CMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\VsDevCmd.bat"
)

if not exist "%VS_DEV_CMD%" (
  echo ERROR: Could not find Visual Studio Build Tools VsDevCmd.bat.
  echo Install Visual Studio 2022 Build Tools with the C++ toolchain, or ensure vswhere.exe can find it.
  exit /b 2
)

call "%VS_DEV_CMD%" -arch=x64 -no_logo
if errorlevel 1 exit /b %errorlevel%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cargo test --manifest-path apps/ui/src-tauri/Cargo.toml
if errorlevel 1 exit /b %errorlevel%

pnpm.cmd --dir apps/ui exec tauri build --bundles nsis
if errorlevel 1 exit /b %errorlevel%
