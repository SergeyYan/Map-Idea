@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

title InkMap server launcher

set "VENV_PY=%CD%\.venv\Scripts\python.exe"
set "MCP_SCRIPT=%CD%\inkmap_mcp.py"
set "REQ_FILE=%CD%\requirements.txt"
set "LOG_DIR=%CD%\.inkmap_logs"

if not exist "%LOG_DIR%" mkdir "%LOG_DIR%" >nul 2>&1

echo [1/5] Проверка файлов...
if not exist "%REQ_FILE%" (
    echo [ERROR] Не найден файл: "%REQ_FILE%"
    goto :fail
)
if not exist "%MCP_SCRIPT%" (
    echo [ERROR] Не найден файл: "%MCP_SCRIPT%"
    goto :fail
)

if not exist "%VENV_PY%" (
    echo [2/5] Создание виртуального окружения .venv...
    where python >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Команда python не найдена в PATH.
        echo Установите Python или добавьте python.exe в PATH.
        goto :fail
    )
    python -m venv .venv
    if errorlevel 1 (
        echo [ERROR] Не удалось создать .venv.
        goto :fail
    )
) else (
    echo [2/5] Виртуальное окружение уже существует.
)

echo [3/5] Проверка/установка зависимостей...
"%VENV_PY%" -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
    echo [ERROR] pip install завершился с ошибкой.
    goto :fail
)

REM Если порт уже слушается, второй uvicorn не запускаем.
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$c = New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',8000); exit 0 } catch { exit 1 } finally { $c.Dispose() }" >nul 2>&1
if errorlevel 1 (
    echo [4/5] Запуск Uvicorn скрыто в фоне...
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
      "$py = (Resolve-Path '%VENV_PY%').Path;" ^
      "$wd = (Get-Location).Path;" ^
      "$out = Join-Path $wd '.inkmap_logs\uvicorn.out.log';" ^
      "$err = Join-Path $wd '.inkmap_logs\uvicorn.err.log';" ^
      "$args = @('-m','uvicorn','server:app','--host','127.0.0.1','--port','8000');" ^
      "Start-Process -FilePath $py -ArgumentList $args -WorkingDirectory $wd -WindowStyle Hidden -RedirectStandardOutput $out -RedirectStandardError $err"
    if errorlevel 1 (
        echo [ERROR] Не удалось запустить Uvicorn.
        goto :fail
    )

    REM Ждём до 10 секунд, пока сервер начнёт слушать порт 8000.
    powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; 1..20 | ForEach-Object { $c=New-Object Net.Sockets.TcpClient; try { $c.Connect('127.0.0.1',8000); $ok=$true; $c.Dispose(); break } catch { $c.Dispose(); Start-Sleep -Milliseconds 500 } }; if($ok){exit 0}else{exit 1}" >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Сервер не открыл порт 8000.
        echo Проверьте лог: "%LOG_DIR%\uvicorn.err.log"
        goto :fail
    )
) else (
    echo [4/5] Порт 8000 уже занят/сервер уже запущен. Второй экземпляр не запускаю.
)

echo [5/5] Настройка MCP для Codex...
where codex >nul 2>&1
if errorlevel 1 (
    echo [WARNING] Команда codex не найдена в PATH.
    echo Сервер запущен, но MCP inkmap не зарегистрирован.
    echo После установки/добавления Codex CLI в PATH запустите этот файл снова.
    goto :success
)

REM Повторный запуск должен быть безопасным: обновляем существующую запись inkmap.
codex mcp get inkmap >nul 2>&1
if not errorlevel 1 (
    codex mcp remove inkmap >nul 2>&1
    if errorlevel 1 (
        echo [ERROR] Не удалось удалить старую запись MCP inkmap.
        goto :fail
    )
)

codex mcp add inkmap --env INKMAP_URL=http://127.0.0.1:8000 -- "%VENV_PY%" "%MCP_SCRIPT%"
if errorlevel 1 (
    echo [ERROR] Не удалось добавить MCP inkmap.
    echo Для диагностики выполните: codex mcp add --help
    goto :fail
)

echo.
codex mcp list
if errorlevel 1 (
    echo [WARNING] MCP добавлен, но codex mcp list вернул ошибку.
)

:success
echo.
echo Готово.
echo Сервер: http://127.0.0.1:8000
echo Логи:  "%LOG_DIR%"
echo Uvicorn работает скрыто в фоне; это окно можно закрыть.
exit /b 0

:fail
echo.
echo Запуск завершён с ошибкой.
echo Если ошибка относится к серверу, смотрите:
echo   "%LOG_DIR%\uvicorn.err.log"
echo.
pause
exit /b 1
