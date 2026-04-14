@echo off
title MediaFlow Launcher
echo ==========================================
echo       Starting MediaFlow System...
echo ==========================================

:: 1. Start Backend Server
echo [1/2] Launching Backend (Python)...
start "MediaFlow Backend" cmd /k "npm run backend:dev"

:: 2. Start Frontend Application
echo [2/2] Launching Frontend (Electron)...
start "MediaFlow Frontend" cmd /k "npm run dev"

echo.
echo ==========================================
echo    System Started! 
echo    - Backend running in separate window
echo    - Frontend launching...
echo ==========================================
