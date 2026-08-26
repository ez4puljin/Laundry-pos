@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion
title Laundry POS - Suulgats (Installer)

rem  ANHAAR: ene fail zowhon ASCII useg aguulna.
rem  Windows-iin konsol rastr fonttoi uyed kirill usgiig "?" bolgodog tul
rem  buh medegdliig latinaar bichsen. Ingesneer ali ch kompyutert zov haragdana.

set "ROOT=%~dp0"
set "ERR=0"

echo ================================================
echo   LAUNDRY POS - SUULGATS (INSTALLER)
echo   Shine kompyutert beltgeh skript
echo ================================================
echo.
echo Ene skript daraahyg avtomataar suulgana:
echo   - Python + Node.js ^(baihgui bol ooroo tataj suulgana^)
echo   - Backend  (Python venv + bagtsuud)
echo   - Frontend (npm install)
echo   - Mobile   (Expo / npm install)
echo   - Litsenz  (ashiglah hugatsaa tohiruulah)
echo.
echo Internet holbolt shaardlagatai. 5-15 minut urgeljilj magadgui.
echo.

rem ========================================================
rem  1. Shaardlagatai programuudyg shalgaj, dutuug SUULGAH
rem ========================================================
echo [1/5] Shaardlagatai programuudyg shalgaj baina...
echo.

rem -- Python / Node.js -g avtomataar suulgah (winget esvel shuud tatah) --
if exist "%ROOT%tools\bootstrap.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\bootstrap.ps1"
    if !errorlevel! neq 0 (
        echo.
        echo ================================================
        echo  Shaardlagatai programuudyg suulgaj chadsangui.
        echo  Deerh zaavraar garaar suulgaad install.bat-g
        echo  DAHIN ajilluulna uu.
        echo ================================================
        echo.
        pause
        exit /b 1
    )
    call :refresh_path
) else (
    echo   [!] tools\bootstrap.ps1 oldsongui - zowhon shalgana.
)

rem -- Suulgasny daraa dahin shalgaj, komanduudyg todorhoiloh --
set "PY="
where py >nul 2>&1
if !errorlevel! equ 0 set "PY=py"
if not defined PY (
    where python >nul 2>&1
    if !errorlevel! equ 0 set "PY=python"
)
if not defined PY (
    echo   [X] Python OLDSONGUI
    echo       https://www.python.org/downloads/ -ees Python 3.11+ suulgana uu.
    echo       Suulgahdaa "Add Python to PATH" -g ZAAVAL chagtlana uu.
    set "ERR=1"
)

where node >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] Node.js OLDSONGUI
    echo       https://nodejs.org/ -ees LTS huvilbaryg suulgana uu.
    set "ERR=1"
)

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] npm OLDSONGUI ^(Node.js dotor bagtdag^)
    set "ERR=1"
)

echo.
if "!ERR!"=="1" (
    echo ================================================
    echo  Dutuu programuudyg suulgaad install.bat-g
    echo  DAHIN ajilluulna uu.
    echo.
    echo  Herev dongoj saya suulgasan bol kompyuteree
    echo  DAHIN ASAAGAAD oroldono uu.
    echo ================================================
    echo.
    pause
    exit /b 1
)

rem -- Tailscale (zaaval bish - zowhon gar utasny app-d heregtei) --
set "TS_EXE=C:\Program Files\Tailscale\tailscale.exe"
if exist "%TS_EXE%" (
    echo   [OK] Tailscale suusan baina ^(gar utasny app ajillana^)
) else (
    echo   [!] Tailscale oldsongui - zaaval bish.
    echo       Veb POS ^(frontend^) localhost deer asuudalgui ajillana.
    echo       Gar utasny Expo app oor tohooromjoos holbogdohod
    echo       Tailscale heregtei: https://tailscale.com/download
)
echo.

rem ========================================================
rem  2. BACKEND - Python venv + bagtsuud
rem ========================================================
echo [2/5] Backend suulgaj baina (Python)...
cd /d "%ROOT%backend"

if exist "venv" (
    echo   - Huuchin venv-g ustgaj baina ^(shine PC deer ajillahgui^)...
    rmdir /S /Q venv
)
rem  Ustgaj chadaagui bol ihenhdee program ajillaj baigaagiin shinj -
rem  oilgomjgui aldaa ogohiin orond shaltgaanyg n helne.
if exist "venv" (
    echo.
    echo   [X] Huuchin venv-g ustgaj chadsangui.
    echo       Program ajillaj baival Stop.bat -g ajilluulj haagaad,
    echo       backend/frontend tsonhnuudyg haagaad dahin oroldono uu.
    echo.
    pause
    exit /b 1
)
echo   - Shine virtual environment uusgej baina...
!PY! -m venv venv
if !errorlevel! neq 0 (
    echo   [X] venv uusgehed aldaa garlaa.
    pause
    exit /b 1
)
echo   - pip shinechilj baina...
venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel
echo   - Python bagtsuudyg suulgaj baina ^(requirements.txt^)...
venv\Scripts\python.exe -m pip install -r requirements.txt
if !errorlevel! neq 0 (
    echo   [X] Python bagts suulgahad aldaa garlaa.
    pause
    exit /b 1
)
rem -- .env beltgeh - JWT nuuts tulhuuriig sanamsargui uusgene --
venv\Scripts\python.exe setup_env.py
echo   [OK] Backend belen bolloo.
echo.

rem ========================================================
rem  3. FRONTEND - npm install
rem ========================================================
echo [3/5] Frontend suulgaj baina (npm)...
cd /d "%ROOT%frontend"
if exist "node_modules" (
    echo   - Huuchin node_modules-g ustgaj baina...
    rmdir /S /Q node_modules
)
if exist "node_modules" (
    echo.
    echo   [X] Huuchin node_modules-g ustgaj chadsangui.
    echo       Stop.bat -g ajilluulj programyg haagaad dahin oroldono uu.
    echo.
    pause
    exit /b 1
)
call npm install
if !errorlevel! neq 0 (
    echo   [X] Frontend suulgahad aldaa garlaa.
    pause
    exit /b 1
)
echo   [OK] Frontend belen bolloo.
echo.

rem ========================================================
rem  4. MOBILE - Expo / npm install
rem ========================================================
echo [4/5] Mobile app suulgaj baina (Expo)...
cd /d "%ROOT%mobile"
if exist "node_modules" (
    echo   - Huuchin node_modules-g ustgaj baina...
    rmdir /S /Q node_modules
)
if exist "node_modules" (
    echo.
    echo   [X] Huuchin node_modules-g ustgaj chadsangui.
    echo       Stop.bat -g ajilluulj programyg haagaad dahin oroldono uu.
    echo.
    pause
    exit /b 1
)
if exist "package-lock.json" del /Q package-lock.json
call npm install --legacy-peer-deps
if !errorlevel! neq 0 (
    echo   [X] Mobile suulgahad aldaa garlaa.
    pause
    exit /b 1
)
echo   [OK] Mobile belen bolloo.
echo.

rem  npm konsolyn codepage-g solij magadgui tul dahin batalgaajuulna
chcp 65001 >nul

rem ========================================================
rem  5. LITSENZ - ashiglah hugatsaa tohiruulah
rem ========================================================
echo [5/5] Litsenziin tohirgoo...
echo.
cd /d "%ROOT%backend"
set "LICPY=venv\Scripts\python.exe"

rem -- Litsenziin tulhuur baigaa esehiig shalgah --
rem  END master nuuts ug UUSGEHGUI. Herev uusgevel heregleegch bur
rem  ooriin tulhuurtei bolj, hamgaalalt utgagui bolno.
rem  Tulhuuriig zowhon ezemshigch License.bat -aar neg udaa uusgene.
if exist "licensing\pubkey_data.py" goto :lic_check
if exist "licensing\vault.dat" goto :lic_check
echo   [X] Litsenziin tulhuur oldsongui.
echo.
echo       Ene huvilbar dutuu beltgegdsen baina:
echo         backend\licensing\vault.dat
echo         backend\licensing\pubkey_data.py
echo.
echo       Edgeer 2 fail git-d commit hiigdsen baih yostoi.
echo       Program niiluulegchid handana uu.
echo.
pause
exit /b 1

rem -- Ashiglah hugatsaag songoh (buh asuultyg Python hariutsana) --
:lic_check
"%LICPY%" license_cli.py wizard

echo.
cd /d "%ROOT%"

echo ================================================
echo   SUULGATS AMJILTTAI DUUSLAA!
echo ================================================
echo.
echo  Programyg asaahdaa:  run.bat  -g 2 darj ajilluulna uu.
echo.
echo  Backend:  http://localhost:8001
echo  Frontend: http://localhost:5173
echo  Expo:     run.bat dotor QR kod garch irne.
echo.
echo  Hugatsaa duusahad program ooroo tugjigdej, master nuuts ug
echo  esvel idevhjuuleh tulhuur asuuh bolno.
echo.
pause
endlocal
exit /b 0


rem ========================================================
rem  Ded program: shineer suusan programuudyn PATH-yg tatah
rem ========================================================
rem  Suulgagch PATH-yg registry-d bichdeg ch ajillaj bui cmd-d
rem  tusdaggui. bootstrap.ps1 shine PATH-yg faild uldeesen baina.
:refresh_path
set "NEWPATH="
if exist "%TEMP%\lpos_path.txt" (
    set /p NEWPATH=<"%TEMP%\lpos_path.txt"
    del "%TEMP%\lpos_path.txt" >nul 2>&1
)
if defined NEWPATH set "PATH=!NEWPATH!"
goto :eof
