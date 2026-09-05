@echo off
title Stocks Library • Disaster Recovery Restoration
cd /d "%~dp0"

echo ======================================================================
echo  STOCKS LIBRARY • DISASTER RECOVERY RESTORE WIZARD
echo ======================================================================
echo  Restore database, accounts, and library index from backup.
echo ======================================================================
echo.

if not exist "venv\Scripts\python.exe" (
    echo [ERROR] Virtual environment not found. Please ensure Python is installed.
    pause
    exit /b 1
)

.\venv\Scripts\python restore_backup.py %*
pause
