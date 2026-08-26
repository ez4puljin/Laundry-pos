@echo off
title Laundry POS - Stopping...

echo Stopping servers...
taskkill /FI "WINDOWTITLE eq Laundry Backend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Laundry Frontend*" /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Laundry Expo*" /F >nul 2>&1

rem Zarim protsess tsonhny garchgaa ooerchilsen baij magadgui -> portoor taslah
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8001" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":5173" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":8081" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":19000" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":19001" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -aon ^| find ":19002" ^| find "LISTENING"') do taskkill /F /PID %%a >nul 2>&1

echo.
echo Laundry POS stopped!
timeout /t 2 >nul
