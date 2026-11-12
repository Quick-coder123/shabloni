@echo off
chcp 65001 >nul
title Feod - server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node server\server.js
echo.
echo Сервер зупинено.
pause
exit /b 0

:nonode
echo Node.js не знайдено.
echo Встановіть Node.js LTS (версія 18 або новіша) з https://nodejs.org і запустіть цей файл знову.
pause
exit /b 1
