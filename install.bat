@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Laundry POS - Суулгац (Installer)

set "ROOT=%~dp0"
set "ERR=0"

echo ================================================
echo   LAUNDRY POS - СУУЛГАЦ (INSTALLER)
echo   Шинэ компьютерт бэлтгэх скрипт
echo ================================================
echo.
echo Энэ скрипт дараахыг автоматаар суулгана:
echo   - Backend  (Python venv + багцууд)
echo   - Frontend (npm install)
echo   - Mobile   (Expo / npm install)
echo.
echo Интернэт холболт шаардлагатай. 5-10 минут үргэлжилж магадгүй.
echo.

rem ════════════════════════════════════════════════════════
rem  1. Шаардлагатай програмуудыг шалгах
rem ════════════════════════════════════════════════════════
echo [1/4] Шаардлагатай програмуудыг шалгаж байна...
echo.

rem ── Python (py launcher-г эхэлж шалгана) ──
set "PY="
where py >nul 2>&1
if !errorlevel! equ 0 set "PY=py"
if not defined PY (
    where python >nul 2>&1
    if !errorlevel! equ 0 set "PY=python"
)
if not defined PY (
    echo   [X] Python ОЛДСОНГҮЙ
    echo       https://www.python.org/downloads/ -ээс Python 3.11+ суулгана уу.
    echo       Суулгахдаа "Add Python to PATH" -г ЗААВАЛ чагтлана уу.
    set "ERR=1"
) else (
    for /f "tokens=*" %%v in ('!PY! --version 2^>^&1') do echo   [OK] %%v
)

rem ── Node.js ──
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] Node.js ОЛДСОНГҮЙ
    echo       https://nodejs.org/ -ээс LTS хувилбарыг суулгана уу.
    set "ERR=1"
) else (
    for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo   [OK] Node.js %%v
)

rem ── npm (Node.js дотор багтдаг) ──
where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] npm ОЛДСОНГҮЙ ^(Node.js дотор багтдаг^)
    set "ERR=1"
) else (
    for /f "tokens=*" %%v in ('npm --version 2^>^&1') do echo   [OK] npm v%%v
)

echo.
if "!ERR!"=="1" (
    echo ================================================
    echo  Дутуу програмуудыг суулгаад install.bat-г
    echo  ДАХИН ажиллуулна уу.
    echo ================================================
    echo.
    pause
    exit /b 1
)

rem ── Tailscale (заавал биш — зөвхөн гар утасны апп-д хэрэгтэй) ──
set "TS_EXE=C:\Program Files\Tailscale\tailscale.exe"
if exist "%TS_EXE%" (
    echo   [OK] Tailscale суусан байна ^(гар утасны апп ажиллана^)
) else (
    echo   [!] Tailscale олдсонгүй — заавал биш.
    echo       Веб POS ^(frontend^) localhost дээр асуудалгүй ажиллана.
    echo       Гар утасны Expo апп өөр төхөөрөмжөөс холбогдоход
    echo       Tailscale хэрэгтэй: https://tailscale.com/download
)
echo.

rem ════════════════════════════════════════════════════════
rem  2. BACKEND — Python venv + багцууд
rem ════════════════════════════════════════════════════════
echo [2/4] Backend суулгаж байна (Python)...
cd /d "%ROOT%backend"

if exist "venv" (
    echo   - Хуучин venv-г устгаж байна ^(шинэ PC дээр ажиллахгүй^)...
    rmdir /S /Q venv
)
echo   - Шинэ virtual environment үүсгэж байна...
!PY! -m venv venv
if !errorlevel! neq 0 (
    echo   [X] venv үүсгэхэд алдаа гарлаа.
    pause
    exit /b 1
)
echo   - pip шинэчилж байна...
venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
echo   - Python багцуудыг суулгаж байна ^(requirements.txt^)...
venv\Scripts\python.exe -m pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo   [X] Python багц суулгахад алдаа гарлаа.
    pause
    exit /b 1
)
echo   [OK] Backend бэлэн боллоо.
echo.

rem ════════════════════════════════════════════════════════
rem  3. FRONTEND — npm install
rem ════════════════════════════════════════════════════════
echo [3/4] Frontend суулгаж байна (npm)...
cd /d "%ROOT%frontend"
if exist "node_modules" (
    echo   - Хуучин node_modules-г устгаж байна...
    rmdir /S /Q node_modules
)
call npm install
if !errorlevel! neq 0 (
    echo   [X] Frontend суулгахад алдаа гарлаа.
    pause
    exit /b 1
)
echo   [OK] Frontend бэлэн боллоо.
echo.

rem ════════════════════════════════════════════════════════
rem  4. MOBILE — Expo / npm install
rem ════════════════════════════════════════════════════════
echo [4/4] Mobile апп суулгаж байна (Expo)...
cd /d "%ROOT%mobile"
if exist "node_modules" (
    echo   - Хуучин node_modules-г устгаж байна...
    rmdir /S /Q node_modules
)
if exist "package-lock.json" del /Q package-lock.json
call npm install --legacy-peer-deps
if !errorlevel! neq 0 (
    echo   [X] Mobile суулгахад алдаа гарлаа.
    pause
    exit /b 1
)
echo   [OK] Mobile бэлэн боллоо.
echo.

cd /d "%ROOT%"

echo ================================================
echo   СУУЛГАЦ АМЖИЛТТАЙ ДУУСЛАА!
echo ================================================
echo.
echo  Програмыг асаахдаа:  run.bat  -г 2 дарж ажиллуулна уу.
echo.
echo  Backend:  http://localhost:8001
echo  Frontend: http://localhost:5173
echo  Expo:     run.bat дотор QR код гарч ирнэ.
echo.
pause
endlocal
