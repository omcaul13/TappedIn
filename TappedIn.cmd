@echo off
setlocal
rem Starts TappedIn (npm start, or the installer's bundled Node) in a minimized console window. Arguments go to npm start,
rem e.g. TappedIn.cmd --dry-run
cd /d "%~dp0"
if "%TAPPEDIN_MINIMIZED%"=="1" goto run
set TAPPEDIN_MINIMIZED=1
start "TappedIn" /min "%ComSpec%" /c call "%~f0" %*
exit /b 0
:run
rem One block: cmd reads it whole, so an update that rewrites this file while TappedIn runs cannot break it.
(
  rem The installer ships its own Node in runtime\; a source checkout uses npm.
  if exist "runtime\node.exe" (
    "runtime\node.exe" node_modules\tsx\dist\cli.mjs scripts\start.ts %*
  ) else (
    call npm start -- %*
  )
  if errorlevel 1 (
    echo.
    echo TappedIn stopped with an error. If you installed it with TappedIn-Setup.exe, run that
    echo installer again. Otherwise run "npm run doctor" in this folder or double-click "Setup TappedIn.cmd".
    pause
  )
  exit /b
)
