@echo off
REM Version 2 design 3: starts the live solver + viewer (one process) and opens it in the default browser.
cd /d "%~dp0"
if not exist viewer\dist\index.html (
  echo viewer\dist not found. Build it first:  cd viewer ^&^& npm install ^&^& npm run build
  pause
  exit /b 1
)
python server.py --open
