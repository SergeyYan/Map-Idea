@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "LOG_DIR=%CD%\.inkmap_logs"
set "PID_FILE=%LOG_DIR%\uvicorn.pid"

powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ErrorActionPreference='SilentlyContinue';" ^
  "$pidFile = [System.IO.Path]::GetFullPath('%PID_FILE%');" ^
  "$stopped = $false;" ^
  "if (Test-Path -LiteralPath $pidFile) {" ^
  "  $savedPid = [int]((Get-Content -LiteralPath $pidFile -ErrorAction SilentlyContinue | Select-Object -First 1));" ^
  "  if ($savedPid -gt 0) {" ^
  "    $p = Get-Process -Id $savedPid -ErrorAction SilentlyContinue;" ^
  "    if ($p) {" ^
  "      Stop-Process -Id $savedPid -Force -ErrorAction SilentlyContinue;" ^
  "      Start-Sleep -Milliseconds 300;" ^
  "      if (-not (Get-Process -Id $savedPid -ErrorAction SilentlyContinue)) { $stopped = $true }" ^
  "    }" ^
  "  }" ^
  "};" ^
  "if (-not $stopped) {" ^
  "  $listeners = @(Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue);" ^
  "  foreach ($c in $listeners) {" ^
  "    $ownerPid = [int]$c.OwningProcess;" ^
  "    if ($ownerPid -gt 0) {" ^
  "      Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue;" ^
  "      Start-Sleep -Milliseconds 300;" ^
  "      if (-not (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue)) { $stopped = $true }" ^
  "    }" ^
  "  }" ^
  "};" ^
  "Remove-Item -LiteralPath $pidFile -Force -ErrorAction SilentlyContinue;" ^
  "$left = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue;" ^
  "if ($left) { exit 2 } else { exit 0 }"

exit /b %ERRORLEVEL%
