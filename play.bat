@echo off
rem Double-click to play Ore & Equity locally at http://localhost:8000
rem Close this window to stop the server.
cd /d "%~dp0"
title Ore ^& Equity - local server
start "" http://localhost:8000
where python >nul 2>nul && (python -m http.server 8000 --bind 127.0.0.1) || (py -m http.server 8000 --bind 127.0.0.1)
pause
