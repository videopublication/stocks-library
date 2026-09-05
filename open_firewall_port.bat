@echo off
title Open Port 5000 in Windows Firewall
cd /d "%~dp0"

echo ======================================================================
echo  STOCKS LIBRARY • OPEN PORT 5000 IN WINDOWS FIREWALL
echo ======================================================================
echo.

:: Check for administrative rights
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [REQUESTING ADMIN PRIVILEGES]
    powershell -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

echo [1/2] Adding inbound rule for TCP Port 5000 on all network profiles...
netsh advfirewall firewall delete rule name="Stocks Library Relay (Port 5000)" >nul 2>&1
netsh advfirewall firewall add rule name="Stocks Library Relay (Port 5000)" dir=in action=allow protocol=TCP localport=5000 profile=any

echo [2/2] Adding application rule for Python in venv...
netsh advfirewall firewall delete rule name="Stocks Library Python" >nul 2>&1
netsh advfirewall firewall add rule name="Stocks Library Python" dir=in action=allow program="%~dp0venv\Scripts\python.exe" profile=any

echo.
echo ======================================================================
echo  [SUCCESS] Port 5000 is now completely UNBLOCKED in Windows Firewall!
echo  Other computers on your Wi-Fi and Ethernet can now connect.
echo ======================================================================
echo.
pause
