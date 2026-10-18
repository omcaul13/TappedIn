@echo off
rem Updates RedZone: newest version (git pull, or explains the zip download), dependencies, a new
rem Widevine signature only if Electron changed (asks first), then a check.
rem   "Update RedZone.cmd" -CheckOnly    shows what an update would do, changing nothing.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1" %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
