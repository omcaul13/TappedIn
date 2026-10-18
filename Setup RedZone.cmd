@echo off
rem One-click setup for RedZone: Node and Python (only if you agree), dependencies, castLabs signing,
rem a check, shortcuts, then RedZone opens. Safe to run again: it skips what is already done.
rem   "Setup RedZone.cmd" -CheckOnly    shows what is done and what is not, changing nothing.
cd /d "%~dp0"
rem One line on purpose: cmd reads a line whole before running it, so git pull rewriting this file
rem mid-run cannot break it (and a multi-line ( ) block loses the exit code under cmd /c).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\setup.ps1" %* & if errorlevel 1 (echo. & pause & exit /b 1) else (echo. & pause & exit /b 0)
