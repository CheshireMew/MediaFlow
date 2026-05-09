@echo off
title MediaFlow Launcher
echo ==========================================
echo       Starting MediaFlow System...
echo ==========================================

:: Start the single dev supervisor. It owns backend, Vite, and Electron.
echo Launching MediaFlow dev supervisor...
node scripts/dev.mjs

echo.
echo ==========================================
echo    System Started! 
echo    - Backend, Vite, and Electron are owned by one process
echo ==========================================
