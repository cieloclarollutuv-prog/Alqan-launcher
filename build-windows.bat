@echo off
REM Crea el instalador (.exe) y la version portable en la carpeta dist\
REM Muestra una barra de progreso. Requiere Node.js: https://nodejs.org
setlocal
cd /d "%~dp0"
title Alqan Launcher - Crear instalador
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build-windows.ps1"
set CODE=%ERRORLEVEL%
echo.
pause
exit /b %CODE%
