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

set "ENABLE_EXPERIMENTAL_PREPROCESSING=false"
set "VITE_ENABLE_EXPERIMENTAL_PREPROCESSING=false"

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

if not exist "%ROOT_DIR%\frontend\electron-builder.yml" (
  echo [ERROR] Frontend packaging config not found: %ROOT_DIR%\frontend\electron-builder.yml
  exit /b 1
)

if not exist "%ROOT_DIR%\frontend\resources\icon.ico" (
  echo [ERROR] Windows icon not found: %ROOT_DIR%\frontend\resources\icon.ico
  exit /b 1
)

echo [1/5] Checking PyInstaller...
python -c "import PyInstaller" >nul 2>nul
if errorlevel 1 (
  echo PyInstaller not found. Installing...
  python -m pip install pyinstaller
  if errorlevel 1 (
    echo [ERROR] Failed to install PyInstaller.
    exit /b 1
  )
)

echo [2/5] Installing frontend dependencies...
pushd "%ROOT_DIR%\frontend"
call npm install
if errorlevel 1 (
  popd
  echo [ERROR] Frontend dependency installation failed.
  exit /b 1
)
popd

echo [3/5] Building backend with PyInstaller...
pushd "%ROOT_DIR%"
call python scripts\build_backend.py
if errorlevel 1 (
  popd
  echo [ERROR] Backend build failed.
  exit /b 1
)
popd

if not exist "%ROOT_DIR%\dist-backend\mediaflow-backend" (
  echo [ERROR] Backend output not found: %ROOT_DIR%\dist-backend\mediaflow-backend
  exit /b 1
)

echo [4/5] Building desktop frontend package...
pushd "%ROOT_DIR%\frontend"
call npm run build
if errorlevel 1 (
  popd
  echo [ERROR] Frontend desktop packaging failed.
  exit /b 1
)
popd

if not exist "%ROOT_DIR%\frontend\release" (
  echo [ERROR] Desktop package output not found: %ROOT_DIR%\frontend\release
  exit /b 1
)

dir /b "%ROOT_DIR%\frontend\release\MediaFlow-Portable-*.exe" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Portable package not found under: %ROOT_DIR%\frontend\release
  exit /b 1
)

echo [5/5] Build completed.
echo.
echo Backend output:
echo   %ROOT_DIR%\dist-backend\mediaflow-backend
echo.
echo Desktop package output:
echo   %ROOT_DIR%\frontend\release
echo.
echo ==================================================
echo                  Build Success
echo ==================================================
exit /b 0
