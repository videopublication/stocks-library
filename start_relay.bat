@echo off
title Stocks Library Relay Server
cd /d "%~dp0"

echo ======================================================================
echo  STOCKS LIBRARY • STUDIO MEDIA ARCHIVE ^& DOWNLOAD RELAY
echo ======================================================================
echo  Launching relay server with auto-detected studio LAN IP...
echo ======================================================================
echo.

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Please run setup first.
    pause
    exit /b 1
)

:: Free port 5000 if an existing or background instance is occupying it
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5000" ^| findstr "LISTENING"') do (
    taskkill /F /PID %%a >nul 2>&1
)

.\venv\Scripts\python run_relay.py --os-agent
pause
