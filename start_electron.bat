@echo off
chcp 65001 > nul
setlocal

set "ROOT=%~dp0"
set "VITE_BIN=%ROOT%sys_vue\node_modules\.bin\vite.cmd"
set "ELECTRON_BIN=%ROOT%sys_electron\node_modules\.bin\electron.cmd"

if not exist "%VITE_BIN%" (
    set "VITE_BIN=%ROOT%node_modules\.bin\vite.cmd"
)

if not exist "%ELECTRON_BIN%" (
    set "ELECTRON_BIN=%ROOT%node_modules\.bin\electron.cmd"
)

if not exist "%VITE_BIN%" (
    echo Vite not found. Please install frontend dependencies first.
    pause
    exit /b 1
)

if not exist "%ELECTRON_BIN%" (
    echo Electron not found. Please install Electron dependencies first.
    pause
    exit /b 1
)

echo Starting Vue dev server...
start "LLMusic Vite" /D "%ROOT%sys_vue" /min "%VITE_BIN%" --host 127.0.0.1 --port 9753

echo Waiting for Vue dev server to be ready...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$deadline=(Get-Date).AddSeconds(60); do { try { Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:9753' -TimeoutSec 2 | Out-Null; exit 0 } catch { Start-Sleep -Milliseconds 500 } } while ((Get-Date) -lt $deadline); exit 1"
if errorlevel 1 (
    echo Vue dev server startup timed out. Check the Vite window for errors.
    pause
    exit /b 1
)

echo Starting Electron...
"%ELECTRON_BIN%" "%ROOT%sys_electron"

endlocal
