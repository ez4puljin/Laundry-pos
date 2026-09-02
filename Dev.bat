@echo off
setlocal enabledelayedexpansion
title Laundry POS - DEV

rem ============================================================
rem   HOGJUULELTIIN GORIM
rem   Vite dev server (5173) + uvicorn --reload (8001) + Expo.
rem   Kod zassan dor shineerne, gehdee RAM/CPU iluu iddeg.
rem
rem   Hereglegchid ogoh uyed Run.bat ashiglana.
rem ============================================================

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
echo   LAUNDRY POS - DEV
echo   Tailscale IP: %TAILSCALE_IP%
echo ================================================

echo Starting Backend (reload)...
cd /d "%~dp0backend"
start "Laundry Backend DEV" cmd /k "venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8001 --reload"

echo Starting Frontend (vite)...
cd /d "%~dp0frontend"
if not exist "node_modules" call npm install --legacy-peer-deps
start "Laundry Frontend DEV" cmd /k "npm run dev"

if /i "%~1"=="mobile" (
    cd /d "%~dp0mobile"
    > .env (
        echo EXPO_PUBLIC_SERVER_IP=%TAILSCALE_IP%
        echo EXPO_PUBLIC_SERVER_PORT=5173
    )
    if not exist "node_modules" call npm install --legacy-peer-deps
    start "Laundry Expo" cmd /k "set REACT_NATIVE_PACKAGER_HOSTNAME=%TAILSCALE_IP% && npx expo start --lan"
)

echo.
echo   Backend:  http://%TAILSCALE_IP%:8001
echo   Frontend: http://%TAILSCALE_IP%:5173
echo.
ping -n 4 127.0.0.1 >nul
start http://localhost:5173
endlocal
