@echo off
rem Local launcher: serves this folder over http and opens the game.
rem No internet, no service worker, no cache. Close this window to stop.
setlocal
cd /d "%~dp0"
set PORT=8138
set URL=http://127.0.0.1:%PORT%/

where python >nul 2>nul
if %errorlevel%==0 (
  set PY=python
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set PY=py
  ) else (
    echo [!] Python not found. Install Python 3 and run this again.
    pause
    exit /b 1
  )
)

echo Serving %CD% at %URL%
echo Close this window to stop.
start "" cmd /c "timeout /t 2 >nul & start "" %URL%"
%PY% -m http.server %PORT% --bind 127.0.0.1
