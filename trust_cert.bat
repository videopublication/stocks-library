@echo off
:: Installs the Stocks Library local certificate into Windows Trusted Root CA
echo ======================================================================
echo  Installing Stocks Library Local SSL Certificate to Windows Trust Store
echo ======================================================================
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Please right-click this script and select "Run as Administrator".
    pause
    exit /b 1
)

certutil -addstore -f "ROOT" "%~dp0ca_cert.crt"
if %errorLevel% equ 0 (
    echo.
    echo [SUCCESS] Root CA Certificate installed into Windows Trusted Root Store!
    echo Chrome and Edge will now trust connections to 192.168.202.91.
) else (
    echo.
    echo [ERROR] Failed to install certificate.
)
pause
