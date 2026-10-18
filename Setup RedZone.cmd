@echo off
rem One-click setup for RedZone: Node and Python (only if you agree), dependencies, castLabs signing,
rem a check, shortcuts, then RedZone opens. Safe to run again: it skips what is already done.
rem   "Setup RedZone.cmd" -CheckOnly    shows what is done and what is not, changing nothing.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %*
set RC=%ERRORLEVEL%
echo.
pause
exit /b %RC%
