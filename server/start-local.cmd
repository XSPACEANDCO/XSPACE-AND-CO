@echo off
rem Start the Xspace portal backend on this computer, for the phone app.
rem Leave this window open while you use the app. Close it to stop the server.
cd /d "%~dp0"
if not exist node_modules call npm install
echo.
echo Xspace backend starting on port 10000...
echo On your phone (same Wi-Fi) the app connects to this computer's Wi-Fi IP.
echo.
node src/index.js
pause
