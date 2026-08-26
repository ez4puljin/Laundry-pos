@echo off
chcp 65001 >nul
title Laundry POS - Litsenziin udirdlaga

rem  ANHAAR: ene fail zowhon ASCII useg aguulna (kirill useg konsold
rem  "?" bolj haragddag tul). Delgerenguig LICENSING.md -ees uzne uu.

cd /d "%~dp0backend"
set "LICPY=venv\Scripts\python.exe"

if not exist "%LICPY%" (
    echo.
    echo   [X] Python venv oldsongui.
    echo       Ehleed install.bat -g ajilluulna uu.
    echo.
    pause
    exit /b 1
)

rem -- Anhny tohirgoo hiigeegui bol master nuuts ug uusgene --
if not exist "licensing\pubkey_data.py" (
    "%LICPY%" license_cli.py setup
    echo.
    pause
)

rem -- Buh tses, asuult Python dotor ajillana --
"%LICPY%" license_cli.py menu

echo.
pause
