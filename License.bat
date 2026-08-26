@echo off
chcp 65001 >nul
title Laundry POS - Лицензийн удирдлага

cd /d "%~dp0backend"
set "LICPY=venv\Scripts\python.exe"

if not exist "%LICPY%" (
    echo.
    echo   [X] Python venv олдсонгүй.
    echo       Эхлээд install.bat -г ажиллуулна уу.
    echo.
    pause
    exit /b 1
)

rem ── Анхны тохиргоо хийгээгүй бол мастер нууц үг үүсгэнэ ──
if not exist "licensing\pubkey_data.py" (
    "%LICPY%" license_cli.py setup
    echo.
    pause
)

rem ── Бүх цэс, асуулт Python дотор ажиллана ──
"%LICPY%" license_cli.py menu

echo.
pause
