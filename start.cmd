@echo off
rem Starts VLAIQ FLOW on this computer: backend (port 8787) and frontend (port 5173), then opens the browser.
rem Double-click this file, or run it from a terminal. Close the two windows to stop the servers.
cd /d "%~dp0"

where pnpm >nul 2>nul
if errorlevel 1 (
  echo pnpm nu este instalat. Ruleaza: npm.cmd install -g pnpm
  pause
  exit /b 1
)

if not exist node_modules (
  echo Instalez dependentele, o singura data...
  call pnpm install || (pause & exit /b 1)
)

start "VLAIQ backend (8787)" cmd /k pnpm -F backend dev
start "VLAIQ frontend (5173)" cmd /k pnpm -F frontend dev

rem Give the servers a few seconds to start before opening the page.
timeout /t 6 /nobreak >nul
start "" http://localhost:5173
