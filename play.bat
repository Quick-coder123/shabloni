@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "PORT=3000"
if not "%FEOD_PORT%"=="" set "PORT=%FEOD_PORT%"

rem Особистий секретний ключ гравця. Лежить у профілі Windows (%APPDATA%),
rem тож інші облікові записи не можуть його прочитати й зайти у ваше село.
set "KEYDIR=%APPDATA%\Feod"
set "KEYFILE=%KEYDIR%\key.txt"
if exist "%KEYFILE%" goto havekey
if not exist "%KEYDIR%" mkdir "%KEYDIR%"
>"%KEYFILE%" echo %RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%%RANDOM%
:havekey
set /p KEY=<"%KEYFILE%"
set "URL=http://localhost:%PORT%/?acc=%USERNAME%&key=%KEY%"

rem Перевіряємо, чи запущено сервер (curl є у Windows 10 1803+)
where curl >nul 2>nul
if errorlevel 1 goto open
curl -s -o nul "http://localhost:%PORT%/"
if errorlevel 1 goto noserver

:open
rem Edge у режимі застосунку (окреме вікно без адресного рядка), інакше — браузер за замовчуванням
set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if not exist "%EDGE%" goto default
start "" "%EDGE%" --app="%URL%"
exit /b 0
:default
start "" "%URL%"
exit /b 0

:noserver
echo Сервер гри не відповідає на порту %PORT%.
echo Попросіть господаря комп'ютера запустити start-server.bat.
pause
exit /b 1
