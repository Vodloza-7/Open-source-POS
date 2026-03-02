@echo off
setlocal
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File ".\Setup-Open-POS.ps1"
if errorlevel 1 (
  echo.
  echo Installation did not complete successfully.
  pause
  exit /b 1
)
echo.
echo Installation complete.
pause
endlocal
