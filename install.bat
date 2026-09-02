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
echo   - Backend  ^(Python venv^) ba Frontend ^(npm^) - ZEREGTSEE
echo   - Veb interfeisiig beltgeh ^(build^)
echo   - Litsenz  ^(ashiglah hugatsaa tohiruulah^)
echo.
if /i "%~1"=="mobile" (
    echo   + Mobile ^(Expo^) - songoson baina
) else (
    echo Mobile ^(Expo^) app suugahgui - ter ni zowhon gar utasnaas
    echo holbogdohod heregtei. Heregtei bol:  install.bat mobile
)
echo.
echo Internet holbolt shaardlagatai. 3-8 minut urgeljilj magadgui.
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
rem  2. BACKEND ba FRONTEND - ZEREGTSEE suulgana
rem ========================================================
rem  Hoyulaa setgeeneesee tatdag tul zeregtsee ajilluulahad
rem  hugatsaa 2 dahin oirtson hemnegdene. Backend ard talaas
rem  ajillaj, ur dungee %TEMP%\lpos_backend.done faild bichne.
echo [2/4] Backend ba Frontend-g ZEREGTSEE suulgaj baina...
echo.

set "BK_DONE=%TEMP%\lpos_backend.done"
set "BK_LOG=%TEMP%\lpos_backend.log"
if exist "%BK_DONE%" del /Q "%BK_DONE%" >nul 2>&1

echo   - Backend ard talaas ehellee ^(Python venv + bagtsuud^)...
rem  cmd /c -g ZAAVAL zaana: start ni .bat-g shuud duudval /K ashiglaj
rem  tsonhyg neelttei uldeej, ergen duudlaga hulzej bolno.
start "Laundry - Backend suulgats" /min cmd /c ""%ROOT%tools\install_backend.bat" "%ROOT%backend" "!PY!""

rem -- Frontend-g ene tsonhond suulgana --
echo   - Frontend suulgaj baina ^(npm^)...
cd /d "%ROOT%frontend"
rem  npm ci ni node_modules-g OOROO tseverledeg tul garaar rmdir
rem  hiihgui - 10 mynga fail ustgah ni udaan.
if exist "package-lock.json" (
    call npm ci --no-audit --no-fund
) else (
    if exist "node_modules" rmdir /S /Q node_modules
    call npm install --no-audit --no-fund
)
if !errorlevel! neq 0 (
    echo   [X] Frontend suulgahad aldaa garlaa.
    pause
    exit /b 1
)
echo   [OK] Frontend belen bolloo.

rem -- Backend duusahyg huleene --
echo   - Backend duusahyg huleej baina...
rem  Hasaltai ( ) blok dotor "set /p X=<fail" ni utgaa avdaggui tul
rem  shoshgot davtalt ashiglana.
set "BK_RC="
set /a BK_WAIT=0

:wait_backend
if exist "%BK_DONE%" goto :read_backend
ping -n 2 127.0.0.1 >nul
set /a BK_WAIT+=1
if !BK_WAIT! lss 900 goto :wait_backend
echo   [X] Backend suulgats 15 minutad duusaagui.
echo       Delgerengui: %BK_LOG%
pause
exit /b 1

:read_backend
set /p BK_RC=<"%BK_DONE%"
if not "!BK_RC!"=="0" (
    echo.
    echo   [X] Backend suulgahad aldaa garlaa. Delgerengui:
    echo   ------------------------------------------------
    type "%BK_LOG%"
    echo   ------------------------------------------------
    pause
    exit /b 1
)
echo   [OK] Backend belen bolloo.
echo.

rem ========================================================
rem  3. VEB INTERFEIS - build
rem ========================================================
rem  End bytsvel Run.bat ehnii udaa shuud asna.
echo [3/4] Veb interfeisiig beltgej baina...
cd /d "%ROOT%frontend"
call npm run build
if !errorlevel! neq 0 (
    echo   [X] Veb interfeis bytsegdsengui.
    pause
    exit /b 1
)
echo   [OK] Veb interfeis belen.
echo.

rem ========================================================
rem  MOBILE - zowhon "install.bat mobile" gej duudval
rem ========================================================
rem  Mobile app ni zowhon veb hesgiig gar utsand haruuldag boodol.
rem  21 mynga fail suugah tul anhnaas ni suugahgui - hereg boloh
rem  uyed  install.bat mobile  gej ajilluulna.
if /i not "%~1"=="mobile" goto :skip_mobile

echo [+] Mobile app suulgaj baina (Expo)...
cd /d "%ROOT%mobile"
if exist "package-lock.json" (
    call npm ci --legacy-peer-deps --no-audit --no-fund
) else (
    if exist "node_modules" rmdir /S /Q node_modules
    call npm install --legacy-peer-deps --no-audit --no-fund
)
if !errorlevel! neq 0 (
    echo   [X] Mobile suulgahad aldaa garlaa.
    pause
    exit /b 1
)
echo   [OK] Mobile belen bolloo.
echo.
:skip_mobile

rem  npm konsolyn codepage-g solij magadgui tul dahin batalgaajuulna
chcp 65001 >nul

rem ========================================================
rem  5. LITSENZ - ashiglah hugatsaa tohiruulah
rem ========================================================
echo [4/4] Litsenziin tohirgoo...
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
echo  Programyg asaahdaa:  Run.bat  -g 2 darj ajilluulna uu.
echo.
echo  Program:  http://localhost:8001
echo            ^(veb ba API neg hayagt - tusdaa server heregguii^)
echo.
echo  Gar utas:  install.bat mobile   daraa n:  Run.bat mobile
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
