@echo off
setlocal enabledelayedexpansion
title Laundry POS - Starting...

rem ── Tailscale IP авах ───────────────────────────────────
set "TAILSCALE_IP=100.107.239.48"
set "TS_EXE=C:\Program Files\Tailscale\tailscale.exe"
if exist "%TS_EXE%" (
    for /f "tokens=*" %%i in ('"%TS_EXE%" ip -4 2^>nul') do (
        set "TAILSCALE_IP=%%i"
        goto :ts_done
    )
)
:ts_done

echo ================================================
echo   LAUNDRY POS
echo   Tailscale IP: %TAILSCALE_IP%
echo ================================================

rem ── Backend ─────────────────────────────────────────────
echo Starting Backend...
cd /d "%~dp0backend"
start "Laundry Backend" cmd /k "venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

rem ── Frontend ────────────────────────────────────────────
echo Starting Frontend...
cd /d "%~dp0frontend"
start "Laundry Frontend" cmd /k "npm run dev"

rem ── Mobile (Expo) ───────────────────────────────────────
cd /d "%~dp0mobile"

rem mobile/.env файл дахь Tailscale IP-г шинэчлэх
> .env (
    echo EXPO_PUBLIC_SERVER_IP=%TAILSCALE_IP%
    echo EXPO_PUBLIC_SERVER_PORT=5173
)

rem Хэрэв expo SDK 51 (хуучин) суусан байвал дахин суулгах
set "NEED_INSTALL=0"
if not exist "node_modules" set "NEED_INSTALL=1"
if exist "node_modules\expo\package.json" (
    findstr /C:"\"version\": \"51" "node_modules\expo\package.json" >nul 2>&1
    if !errorlevel! equ 0 set "NEED_INSTALL=1"
)

if "!NEED_INSTALL!"=="1" (
    echo Installing Expo SDK 54 dependencies ^(anh hudadch 2-3 minut^)...
    if exist "node_modules" rmdir /S /Q node_modules
    if exist "package-lock.json" del /Q package-lock.json
    call npm install --legacy-peer-deps
)

echo Starting Expo Go server...
start "Laundry Expo" cmd /k "set REACT_NATIVE_PACKAGER_HOSTNAME=%TAILSCALE_IP% && npx expo start --lan"

rem ── Summary ────────────────────────────────────────────
echo.
echo ================================================
echo   Laundry POS started!
echo   Backend:  http://%TAILSCALE_IP%:8001
echo   Frontend: http://%TAILSCALE_IP%:5173
echo   Expo:     QR код Expo цонхноос уншуулна уу
echo ================================================
echo.
timeout /t 3 >nul
start http://localhost:5173
endlocal
