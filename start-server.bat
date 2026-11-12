@echo off
chcp 65001 >nul
title Feod - server
cd /d "%~dp0"

rem 1) Портативний Node.js у теці runtime (встановлення не потрібне)
if exist "%~dp0runtime\node.exe" (
  set "NODE=%~dp0runtime\node.exe"
  goto run
)
rem 2) Встановлений у системі Node.js
where node >nul 2>nul
if errorlevel 1 goto nonode
set "NODE=node"

:run
"%NODE%" server\server.js
echo.
echo Сервер зупинено.
pause
exit /b 0

:nonode
echo Node.js не знайдено.
echo Покладіть node.exe у теку runtime поруч із цим файлом
echo (портативна версія з https://nodejs.org/dist/ - архів win-x64.zip, встановлення не потрібне)
echo або встановіть Node.js LTS.
pause
exit /b 1
