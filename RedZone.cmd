@echo off
setlocal
rem Starts RedZone (npm start) in a minimized console window. Arguments go to npm start,
rem e.g. RedZone.cmd --dry-run
cd /d "%~dp0"
if "%REDZONE_MINIMIZED%"=="1" goto run
set REDZONE_MINIMIZED=1
start "RedZone" /min "%ComSpec%" /c call "%~f0" %*
exit /b 0
:run
rem One block: cmd reads it whole, so an update that rewrites this file while RedZone runs cannot break it.
(
  call npm start -- %*
  if errorlevel 1 (
    echo.
    echo RedZone stopped with an error. To find out why, run "npm run doctor" in this folder
    echo or double-click "Setup RedZone.cmd".
    pause
  )
  exit /b
)
