@echo off
setlocal
rem Starts TappedIn (npm start) in a minimized console window. Arguments go to npm start,
rem e.g. TappedIn.cmd --dry-run
cd /d "%~dp0"
if "%TAPPEDIN_MINIMIZED%"=="1" goto run
set TAPPEDIN_MINIMIZED=1
start "TappedIn" /min "%ComSpec%" /c call "%~f0" %*
exit /b 0
:run
rem One block: cmd reads it whole, so an update that rewrites this file while TappedIn runs cannot break it.
(
  call npm start -- %*
  if errorlevel 1 (
    echo.
    echo TappedIn stopped with an error. To find out why, run "npm run doctor" in this folder
    echo or double-click "Setup TappedIn.cmd".
    pause
  )
  exit /b
)
