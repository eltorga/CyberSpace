@echo off
cd /d "%~dp0"
title Eltorga Foro v0.2.7 - Administrador
where py >nul 2>&1
if %errorlevel%==0 (
 py -3 admin\server.py
) else (
 python admin\server.py
)
if errorlevel 1 (
 echo.
 echo Instala Python 3 desde https://www.python.org/downloads/
 pause
)
