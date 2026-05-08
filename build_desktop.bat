@echo off
setlocal enabledelayedexpansion

title MediaFlow Desktop Builder

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

echo ==================================================
echo            MediaFlow Desktop Build
echo ==================================================
echo Root: %ROOT_DIR%
echo.

where python >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Python not found in PATH.
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  exit /b 1
)

if not exist "%ROOT_DIR%\pyproject.toml" (
  echo [ERROR] Backend project metadata not found: %ROOT_DIR%\pyproject.toml
  exit /b 1
)

if not exist "%ROOT_DIR%\run.py" (
  echo [ERROR] Backend entrypoint not found: %ROOT_DIR%\run.py
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\package-lock.json" (
  echo [ERROR] Frontend lockfile not found: %ROOT_DIR%\frontend\package-lock.json
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\electron-builder.yml" (
  echo [ERROR] Frontend packaging config not found: %ROOT_DIR%\frontend\electron-builder.yml
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\resources\icon.ico" (
  echo [ERROR] Windows icon not found: %ROOT_DIR%\frontend\resources\icon.ico
  exit /b 1
)

if not exist "%ROOT_DIR%\bin\ffmpeg.exe" (
  echo [ERROR] Bundled ffmpeg not found: %ROOT_DIR%\bin\ffmpeg.exe
  exit /b 1
)

if not exist "%ROOT_DIR%\bin\ffprobe.exe" (
  echo [ERROR] Bundled ffprobe not found: %ROOT_DIR%\bin\ffprobe.exe
  exit /b 1
)

for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content '%ROOT_DIR%\package.json' -Raw | ConvertFrom-Json).version"`) do set "ROOT_VERSION=%%V"
for /f "usebackq delims=" %%V in (`powershell -NoProfile -Command "(Get-Content '%ROOT_DIR%\frontend\package.json' -Raw | ConvertFrom-Json).version"`) do set "FRONTEND_VERSION=%%V"

if not defined ROOT_VERSION (
  echo [ERROR] Failed to read root package version.
  exit /b 1
)

if not defined FRONTEND_VERSION (
  echo [ERROR] Failed to read frontend package version.
  exit /b 1
)

if /i not "%ROOT_VERSION%"=="%FRONTEND_VERSION%" (
  echo [ERROR] Version mismatch: root package.json=%ROOT_VERSION%, frontend package.json=%FRONTEND_VERSION%.
  echo         Align both files before building a release package.
  exit /b 1
)

if "%FRONTEND_VERSION%"=="0.0.0" (
  echo [ERROR] Frontend release version is still 0.0.0.
  exit /b 1
)

echo Release version: %FRONTEND_VERSION%
echo.

echo [1/6] Installing backend build dependencies...
pushd "%ROOT_DIR%"
call python -m pip install -e ".[build]"
if errorlevel 1 (
  popd
  echo [ERROR] Backend dependency installation failed.
  exit /b 1
)
popd

echo [2/6] Installing frontend dependencies...
pushd "%ROOT_DIR%\frontend"
call npm ci
if errorlevel 1 (
  popd
  echo [ERROR] Frontend dependency installation failed.
  exit /b 1
)
popd

echo [3/6] Cleaning previous build outputs...
if exist "%ROOT_DIR%\build" rmdir /s /q "%ROOT_DIR%\build"
if exist "%ROOT_DIR%\build-desktop-backend" rmdir /s /q "%ROOT_DIR%\build-desktop-backend"
if exist "%ROOT_DIR%\dist" rmdir /s /q "%ROOT_DIR%\dist"
if exist "%ROOT_DIR%\dist-desktop-backend" rmdir /s /q "%ROOT_DIR%\dist-desktop-backend"
if exist "%ROOT_DIR%\frontend\dist" rmdir /s /q "%ROOT_DIR%\frontend\dist"
if exist "%ROOT_DIR%\frontend\dist-electron" rmdir /s /q "%ROOT_DIR%\frontend\dist-electron"
if exist "%ROOT_DIR%\frontend\release" rmdir /s /q "%ROOT_DIR%\frontend\release"

echo [4/6] Building backend runtime with PyInstaller...
pushd "%ROOT_DIR%"
call python scripts\build_desktop_backend.py
if errorlevel 1 (
  popd
  echo [ERROR] Backend runtime build failed.
  exit /b 1
)
popd

if not exist "%ROOT_DIR%\dist-desktop-backend\mediaflow-backend\mediaflow-backend.exe" (
  echo [ERROR] Backend runtime executable not found: %ROOT_DIR%\dist-desktop-backend\mediaflow-backend\mediaflow-backend.exe
  exit /b 1
)

echo [5/6] Building desktop frontend package...
pushd "%ROOT_DIR%\frontend"
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] Frontend desktop packaging failed.
  exit /b 1
)
popd

echo [6/6] Verifying packaged desktop runtime...
if not exist "%ROOT_DIR%\frontend\release\win-unpacked\MediaFlow.exe" (
  echo [ERROR] Unpacked Electron executable not found: %ROOT_DIR%\frontend\release\win-unpacked\MediaFlow.exe
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\release\win-unpacked\resources\backend\mediaflow-backend.exe" (
  echo [ERROR] Packaged backend runtime executable not found: %ROOT_DIR%\frontend\release\win-unpacked\resources\backend\mediaflow-backend.exe
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\release\win-unpacked\resources\bin\ffmpeg.exe" (
  echo [ERROR] Packaged ffmpeg not found: %ROOT_DIR%\frontend\release\win-unpacked\resources\bin\ffmpeg.exe
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\release\win-unpacked\resources\bin\ffprobe.exe" (
  echo [ERROR] Packaged ffprobe not found: %ROOT_DIR%\frontend\release\win-unpacked\resources\bin\ffprobe.exe
  exit /b 1
)

dir /b "%ROOT_DIR%\frontend\release\MediaFlow-Portable-%FRONTEND_VERSION%.exe" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Portable package not found under: %ROOT_DIR%\frontend\release\MediaFlow-Portable-%FRONTEND_VERSION%.exe
  exit /b 1
)

echo Build completed successfully.
echo.
echo Backend runtime output:
echo   %ROOT_DIR%\dist-desktop-backend\mediaflow-backend
echo.
echo Desktop package output:
echo   %ROOT_DIR%\frontend\release
echo.
echo ==================================================
echo                  Build Success
echo ==================================================
exit /b 0
