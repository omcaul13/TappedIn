@echo off
setlocal
rem Starts RedZone (npm start) in a minimized console window. Arguments go to npm start,
rem e.g. RedZone.cmd --dry-run
cd /d "%~dp0"
if not "%REDZONE_MINIMIZED%"=="1" (
  set REDZONE_MINIMIZED=1
  start "RedZone" /min "%ComSpec%" /c ""%~f0" %*"
  exit /b 0
)
call npm start -- %*
if errorlevel 1 (
  echo.
  echo RedZone stopped with an error. To find out why, run "npm run doctor" in this folder
  echo or double-click "Setup RedZone.cmd".
  pause
)
