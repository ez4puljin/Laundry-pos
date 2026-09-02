@echo off
rem ============================================================
rem  Backend suulgats - install.bat ARD TALAAS zeregtsee duudna.
rem  Frontend-iin npm suulgalttai zeregtsee ajillaj hugatsaa hemnene.
rem
rem  Ur dun:  %TEMP%\lpos_backend.done   0 = amjilttai, 1 = aldaa
rem  Log:     %TEMP%\lpos_backend.log
rem  Arg:     %1 = backend zam,  %2 = python komand
rem
rem  ANHAAR: neg komand = neg mor. Hasaltai ( ) blok dotor ^ mor
rem  urgeljluuleh ni cmd-d parse aldaa ogdog tul ashiglahgui.
rem ============================================================
setlocal
set "BKDIR=%~1"
set "PY=%~2"
set "LOG=%TEMP%\lpos_backend.log"
set "DONE=%TEMP%\lpos_backend.done"
if exist "%DONE%" del /Q "%DONE%" >nul 2>&1

cd /d "%BKDIR%" || goto :fail
echo === Backend suulgats === > "%LOG%" 2>&1

if exist "venv" rmdir /S /Q venv
if exist "venv" (
    echo [X] Huuchin venv ustsangui - program ajillaj baina. >> "%LOG%" 2>&1
    goto :fail
)

echo - Virtual environment uusgej baina... >> "%LOG%" 2>&1
"%PY%" -m venv venv >> "%LOG%" 2>&1
if errorlevel 1 goto :fail
if not exist "venv\Scripts\python.exe" goto :fail

echo - pip beltgej baina... >> "%LOG%" 2>&1
venv\Scripts\python.exe -m pip install --upgrade pip setuptools wheel --quiet --disable-pip-version-check --no-input >> "%LOG%" 2>&1

echo - Python bagtsuudyg suulgaj baina... >> "%LOG%" 2>&1
venv\Scripts\python.exe -m pip install -r requirements.txt --quiet --disable-pip-version-check --no-input >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo - .env beltgej baina... >> "%LOG%" 2>&1
venv\Scripts\python.exe setup_env.py >> "%LOG%" 2>&1
if errorlevel 1 goto :fail

echo === Backend BELEN === >> "%LOG%" 2>&1
> "%DONE%" echo 0
endlocal
exit /b 0

:fail
echo === Backend ALDAA === >> "%LOG%" 2>&1
> "%DONE%" echo 1
endlocal
exit /b 1
