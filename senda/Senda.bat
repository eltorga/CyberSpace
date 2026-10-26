@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Senda - Panel local

set "PYTHONUTF8=1"
set "PORT=8787"
set "SENDA_PORT=%PORT%"

echo.
echo  ============================================
echo             SENDA - BIBLIA DE ESTUDIO
echo             Panel local de administracion
echo  ============================================
echo.
echo  [INFO] Buscando Python...
where py >nul 2>nul
if %errorlevel%==0 (
  set "PY=py -3"
) else (
  where python >nul 2>nul
  if %errorlevel%==0 (
    set "PY=python"
  ) else (
    echo  [ERROR] Python no esta instalado o no esta en PATH.
    echo  Instala Python 3 desde python.org y vuelve a ejecutar Senda.bat
    pause
    exit /b 1
  )
)

echo  [OK] Python encontrado.
echo  [INFO] Administrador: http://127.0.0.1:%PORT%
echo  [INFO] Sitio publico: http://127.0.0.1:%PORT%/sitio/
echo  [INFO] Esta ventana registra los cambios y errores.
echo.
echo  [INFO] Para detener Senda: cierra esta ventana o presiona CTRL+C.
echo.

echo  [INFO] El navegador se abrira cuando el servidor este preparado.

%PY% server.py
set "EXITCODE=%errorlevel%"

echo.
if not "%EXITCODE%"=="0" (
  echo  [ERROR] Senda se detuvo con codigo %EXITCODE%.
) else (
  echo  [OK] Senda se detuvo correctamente.
)
pause
