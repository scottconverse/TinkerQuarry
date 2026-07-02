@echo off
setlocal

set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "LAUNCH_DEV_CMD="

if exist "%VSWHERE%" (
  for /f "usebackq tokens=*" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do (
    set "LAUNCH_DEV_CMD=%%i\Common7\Tools\LaunchDevCmd.bat"
  )
)

if not defined LAUNCH_DEV_CMD (
  set "LAUNCH_DEV_CMD=%ProgramFiles(x86)%\Microsoft Visual Studio\2022\BuildTools\Common7\Tools\LaunchDevCmd.bat"
)

if not exist "%LAUNCH_DEV_CMD%" (
  echo ERROR: Could not find Visual Studio Build Tools LaunchDevCmd.bat.
  echo Install Visual Studio 2022 Build Tools with the C++ toolchain, or ensure vswhere.exe can find it.
  exit /b 2
)

call "%LAUNCH_DEV_CMD%" -arch=x64
if errorlevel 1 exit /b %errorlevel%

set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"

cargo test --manifest-path apps/ui/src-tauri/Cargo.toml
if errorlevel 1 exit /b %errorlevel%

pnpm.cmd --dir apps/ui exec tauri build --bundles nsis
if errorlevel 1 exit /b %errorlevel%
