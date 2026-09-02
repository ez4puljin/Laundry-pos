@echo off
setlocal enabledelayedexpansion
title Laundry POS

rem ============================================================
rem   UILDVERIIN GORIM (production)
rem   Neg Python protsess API ba veb hoyulang uilchilne.
rem   Vite dev server, --reload heregguii -> ~400 MB RAM hemnene.
rem
rem   Hogjuuleltiin gorim: Dev.bat
rem ============================================================

rem -- Tailscale IP avah -----------------------------------
set "TAILSCALE_IP=100.107.239.48"
set "TS_EXE=C:\Program Files\Tailscale\tailscale.exe"
if exist "%TS_EXE%" (
    for /f "tokens=*" %%i in ('"%TS_EXE%" ip -4 2^>nul') do (
        set "TAILSCALE_IP=%%i"
        goto :ts_done
    )
)
:ts_done

rem -- Veb interfeisiig beltgeh -----------------------------
cd /d "%~dp0frontend"
set "NEED_BUILD=0"
if not exist "dist\index.html" set "NEED_BUILD=1"
if /i "%~1"=="build" set "NEED_BUILD=1"

if "!NEED_BUILD!"=="1" (
    if not exist "node_modules" (
        echo Installing web dependencies...
        call npm install --legacy-peer-deps
    )
    echo Building web interface...
    call npm run build
    if errorlevel 1 (
        echo.
        echo [ALDAA] Veb interfeis bytsegdsengui. Dev.bat ashiglana uu.
        pause
        exit /b 1
    )
)

rem -- Port cheeleetei esehiig shalgah -------------------------
netstat -ano | findstr /R /C:":8001 .*LISTENING" >nul 2>&1
if not errorlevel 1 (
    echo.
    echo ================================================
    echo  8001 port al hediin ashiglagdaj baina.
    echo  Program neg hediin asaltai baij magadgui:
    echo     http://localhost:8001
    echo.
    echo  Dahin asaah bol ehleed Stop.bat -g ajilluulna uu.
    echo ================================================
    echo.
    ping -n 3 127.0.0.1 >nul
    start http://localhost:8001
    endlocal
    exit /b 0
)

rem -- Server --------------------------------------------------
echo.
echo ================================================
echo   LAUNDRY POS
echo   Local:     http://localhost:8001
echo   Setweer:   http://%TAILSCALE_IP%:8001
echo ================================================
echo.

cd /d "%~dp0backend"
start "Laundry POS Server" cmd /k "venv\Scripts\activate && uvicorn main:app --host 0.0.0.0 --port 8001"

rem -- Mobile (Expo) - zovhon "Run.bat mobile" gej duudval --
if /i "%~1"=="mobile" (
    cd /d "%~dp0mobile"
    > .env (
        echo EXPO_PUBLIC_SERVER_IP=%TAILSCALE_IP%
        echo EXPO_PUBLIC_SERVER_PORT=8001
    )
    if not exist "node_modules" call npm install --legacy-peer-deps
    echo Starting Expo Go server...
    start "Laundry Expo" cmd /k "set REACT_NATIVE_PACKAGER_HOSTNAME=%TAILSCALE_IP% && npx expo start --lan"
)

rem -- Server belen bolohyg huleeh --------------------------------
rem    Hatuu timeout ni sul PC deer hurehgui, hotoch "holbogdoj
rem    chadsangui" gej haruuldag baisan.
echo Server asch baina...
set "READY=0"
for /L %%i in (1,1,60) do (
    if "!READY!"=="0" (
        powershell -NoProfile -Command "try { $null = Invoke-WebRequest 'http://127.0.0.1:8001/health' -TimeoutSec 2 -UseBasicParsing; exit 0 } catch { exit 1 }" >nul 2>&1
        if not errorlevel 1 (
            set "READY=1"
        ) else (
            ping -n 2 127.0.0.1 >nul
        )
    )
)

if "!READY!"=="1" (
    echo   [OK] Server belen.
    start http://localhost:8001
) else (
    echo.
    echo   [X] Server 60 sekundad asaagui.
    echo       "Laundry POS Server" tsonhnoos aldaag harna uu.
    echo.
    pause
)
endlocal
