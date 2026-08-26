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
echo   - Python + Node.js ^(байхгүй бол өөрөө татаж суулгана^)
echo   - Backend  (Python venv + багцууд)
echo   - Frontend (npm install)
echo   - Mobile   (Expo / npm install)
echo   - Лиценз    (ашиглах хугацаа тохируулах)
echo.
echo Интернэт холболт шаардлагатай. 5-15 минут үргэлжилж магадгүй.
echo.

rem ════════════════════════════════════════════════════════
rem  1. Шаардлагатай програмуудыг шалгаж, дутууг СУУЛГАХ
rem ════════════════════════════════════════════════════════
echo [1/5] Шаардлагатай програмуудыг шалгаж байна...
echo.

rem ── Python / Node.js -г автоматаар суулгах (winget эсвэл шууд татах) ──
if exist "%ROOT%tools\bootstrap.ps1" (
    powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%tools\bootstrap.ps1"
    if !errorlevel! neq 0 (
        echo.
        echo ================================================
        echo  Шаардлагатай програмуудыг суулгаж чадсангүй.
        echo  Дээрх заавраар гараар суулгаад install.bat-г
        echo  ДАХИН ажиллуулна уу.
        echo ================================================
        echo.
        pause
        exit /b 1
    )
    call :refresh_path
) else (
    echo   [!] tools\bootstrap.ps1 олдсонгүй — зөвхөн шалгана.
)

rem ── Суулгасны дараа дахин шалгаж, командуудыг тодорхойлох ──
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
)

where node >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] Node.js ОЛДСОНГҮЙ
    echo       https://nodejs.org/ -ээс LTS хувилбарыг суулгана уу.
    set "ERR=1"
)

where npm >nul 2>&1
if !errorlevel! neq 0 (
    echo   [X] npm ОЛДСОНГҮЙ ^(Node.js дотор багтдаг^)
    set "ERR=1"
)

echo.
if "!ERR!"=="1" (
    echo ================================================
    echo  Дутуу програмуудыг суулгаад install.bat-г
    echo  ДАХИН ажиллуулна уу.
    echo.
    echo  Хэрэв дөнгөж сая суулгасан бол компьютерээ
    echo  ДАХИН АСААГААД оролдоно уу.
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
echo [2/5] Backend суулгаж байна (Python)...
cd /d "%ROOT%backend"

if exist "venv" (
    echo   - Хуучин venv-г устгаж байна ^(шинэ PC дээр ажиллахгүй^)...
    rmdir /S /Q venv
)
rem  Устгаж чадаагүй бол ихэвчлэн програм ажиллаж байгаагийн шинж —
rem  ойлгомжгүй алдаа өгөхийн оронд шалтгааныг нь хэлнэ.
if exist "venv" (
    echo.
    echo   [X] Хуучин venv-г устгаж чадсангүй.
    echo       Програм ажиллаж байвал Stop.bat -г ажиллуулж хаагаад,
    echo       backend/frontend цонхнуудыг хаагаад дахин оролдоно уу.
    echo.
    pause
    exit /b 1
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
rem ── .env бэлтгэх — JWT нууц түлхүүрийг санамсаргүй үүсгэнэ ──
venv\Scripts\python.exe setup_env.py
echo   [OK] Backend бэлэн боллоо.
echo.

rem ════════════════════════════════════════════════════════
rem  3. FRONTEND — npm install
rem ════════════════════════════════════════════════════════
echo [3/5] Frontend суулгаж байна (npm)...
cd /d "%ROOT%frontend"
if exist "node_modules" (
    echo   - Хуучин node_modules-г устгаж байна...
    rmdir /S /Q node_modules
)
if exist "node_modules" (
    echo.
    echo   [X] Хуучин node_modules-г устгаж чадсангүй.
    echo       Stop.bat -г ажиллуулж програмыг хаагаад дахин оролдоно уу.
    echo.
    pause
    exit /b 1
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
echo [4/5] Mobile апп суулгаж байна (Expo)...
cd /d "%ROOT%mobile"
if exist "node_modules" (
    echo   - Хуучин node_modules-г устгаж байна...
    rmdir /S /Q node_modules
)
if exist "node_modules" (
    echo.
    echo   [X] Хуучин node_modules-г устгаж чадсангүй.
    echo       Stop.bat -г ажиллуулж програмыг хаагаад дахин оролдоно уу.
    echo.
    pause
    exit /b 1
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

rem ════════════════════════════════════════════════════════
rem  5. ЛИЦЕНЗ — ашиглах хугацаа тохируулах
rem ════════════════════════════════════════════════════════
echo [5/5] Лицензийн тохиргоо...
echo.
cd /d "%ROOT%backend"
set "LICPY=venv\Scripts\python.exe"

rem ── Лицензийн түлхүүр байгаа эсэхийг шалгах ──────────────
rem  ЭНД мастер нууц үг ҮҮСГЭХГҮЙ. Хэрэв үүсгэвэл хэрэглэгч бүр
rem  өөрийн түлхүүртэй болж, хамгаалалт утгагүй болно.
rem  Түлхүүрийг зөвхөн эзэмшигч License.bat -аар нэг удаа үүсгэнэ.
if exist "licensing\pubkey_data.py" goto :lic_check
if exist "licensing\vault.dat" goto :lic_check
echo   [X] Лицензийн түлхүүр олдсонгүй.
echo.
echo       Энэ хувилбар дутуу бэлтгэгдсэн байна:
echo         backend\licensing\vault.dat
echo         backend\licensing\pubkey_data.py
echo.
echo       Эдгээр 2 файл git-д commit хийгдсэн байх ёстой.
echo       Програм нийлүүлэгчид хандана уу.
echo.
pause
exit /b 1

rem ── Ашиглах хугацааг сонгох (бүх асуултыг Python хариуцна) ──
:lic_check
"%LICPY%" license_cli.py wizard

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
echo  Хугацаа дуусахад програм өөрөө түгжигдэж, мастер нууц үг
echo  эсвэл идэвхжүүлэх түлхүүр асуух болно.
echo.
pause
endlocal
exit /b 0


rem ════════════════════════════════════════════════════════
rem  Дэд програм: шинээр суусан програмуудын PATH-ыг татах
rem ════════════════════════════════════════════════════════
rem  Суулгагч PATH-ыг registry-д бичдэг ч ажиллаж буй cmd-д
rem  тусдаггүй. bootstrap.ps1 шинэ PATH-ыг файлд үлдээсэн байна.
:refresh_path
set "NEWPATH="
if exist "%TEMP%\lpos_path.txt" (
    set /p NEWPATH=<"%TEMP%\lpos_path.txt"
    del "%TEMP%\lpos_path.txt" >nul 2>&1
)
if defined NEWPATH set "PATH=!NEWPATH!"
goto :eof
