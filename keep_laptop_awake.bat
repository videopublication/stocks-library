@echo off
title Stocks Library • Laptop Stay-Awake Keepalive
cd /d "%~dp0"
color 0A
cls

if exist "venv\Scripts\python.exe" (
    .\venv\Scripts\python scripts\keep_awake.py
) else (
    python scripts\keep_awake.py
)

pause
