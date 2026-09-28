@echo off
setlocal

if exist "%~dp0VoiceHub.exe" (
  "%~dp0VoiceHub.exe" cli %*
  exit /b %errorlevel%
)

if exist "%~dp0backend\.venv\Scripts\python.exe" goto run_venv

where py.exe >nul 2>nul
if not errorlevel 1 (
  set "PYTHONPATH=%~dp0backend;%PYTHONPATH%"
  py.exe -3 -m app.cli %*
  exit /b %errorlevel%
)

where python.exe >nul 2>nul
if not errorlevel 1 (
  set "PYTHONPATH=%~dp0backend;%PYTHONPATH%"
  python.exe -m app.cli %*
  exit /b %errorlevel%
)

echo Voice Hub CLI requires Python 3.11 or later. Run start.ps1 once first.
exit /b 1

:run_venv
set "PYTHONPATH=%~dp0backend;%PYTHONPATH%"
"%~dp0backend\.venv\Scripts\python.exe" -m app.cli %*
exit /b %errorlevel%
