@echo off
title MediaFlow Launcher
chcp 65001 >nul

:: 获取脚本所在目录
cd /d "%~dp0"

echo ==========================================
echo       Starting MediaFlow System...
echo ==========================================
echo.

:: Kill existing backend processes
echo [Pre] Cleaning up existing processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000') do (
    echo Killing PID %%a on port 8000...
    taskkill /F /PID %%a >nul 2>&1
)
timeout /t 1 /nobreak >nul

:: 1. Start Backend Server
echo [1/2] Launching Backend (Python)...
start "MediaFlow Backend" cmd /k "call venv\Scripts\activate.bat && set PYTHONPATH=. && python run.py"

:: Wait for backend to initialize
echo Waiting for backend to start...
timeout /t 5 /nobreak >nul

:: 2. Start Frontend Application
echo [2/2] Launching Frontend (Electron)...
start "MediaFlow Frontend" cmd /k "cd frontend && npm run electron:dev"

echo.
echo ==========================================
echo    System Started! 
echo    - Backend: http://127.0.0.1:8000
echo    - API Docs: http://127.0.0.1:8000/docs
echo    - Backend running in separate window
echo    - Frontend launching...
echo ==========================================
echo.
echo Press any key to exit this window...
pause >nul