@echo off
title Glamia Dev Server
cd /d "%~dp0"
set "PATH=%LOCALAPPDATA%\Programs\nodejs;%PATH%"

echo ================================================
echo   Glamia dev server - http://localhost:8787
echo   Keep this window open. Press Ctrl+C to stop.
echo ================================================
echo.

npx wrangler dev --port 8787

pause
