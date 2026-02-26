@echo off
setlocal

cd /d "%~dp0"

REM Check if npm is installed
where /q npm.cmd
if errorlevel 1 (
  echo.
  echo ERROR: npm not found. Please install Node.js first.
  echo Download from: https://nodejs.org/
  echo.
  pause
  exit /b 1
)

REM Read app port from config/server.config.js (fallback to 3000)
set "PORT=3000"
for /f %%p in ('node -e "try{const cfg=require('./config/server.config'); console.log((cfg.app ? cfg.app.port : 3000) || 3000)}catch(e){console.log(3000)}"') do set "PORT=%%p"

echo.
echo ========================================
echo  Open POS - Starting...
echo ========================================
echo Port: %PORT%
echo.

REM Start server in a separate window
start "Open POS Server" cmd /k "cd /d "%~dp0" && title Open POS Server && npm.cmd start"

REM Wait for server to be ready
echo Waiting for server to start...
timeout /t 4 /nobreak >nul

REM Open POS in default browser
echo Opening browser...
start "" "http://localhost:%PORT%"

echo.
echo SUCCESS: Browser opened at http://localhost:%PORT%
echo Keep the "Open POS Server" window running.
echo.
echo To stop: Close the "Open POS Server" window or press Ctrl+C in it.
echo.
timeout /t 3 /nobreak >nul

endlocal
