@echo off
setlocal
chcp 65001 >nul
cd /d "%~dp0"

"%~dp0VoiceHub.exe"
exit /b %errorlevel%

