@echo off
rem Updates TappedIn: newest version (git pull, or explains the zip download), dependencies, a new
rem Widevine signature only if Electron changed (asks first), then a check.
rem   "Update TappedIn.cmd" -CheckOnly    shows what an update would do, changing nothing.
cd /d "%~dp0"
rem One line on purpose: cmd reads a line whole before running it, so git pull rewriting this file
rem mid-run cannot break it (and a multi-line ( ) block loses the exit code under cmd /c).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\update.ps1" %* & if errorlevel 1 (echo. & pause & exit /b 1) else (echo. & pause & exit /b 0)
