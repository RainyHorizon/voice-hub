@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

"%~dp0VoxNest.exe"
exit /b %errorlevel%

