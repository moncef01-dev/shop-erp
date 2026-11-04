@echo off
title Shop ERP - Production
cd /d "%~dp0"

echo Starting Shop ERP...

start "Shop ERP Server" /D "%~dp0" cmd /k "npm run start"

echo Waiting for server...

powershell -NoProfile -Command "$ready=$false; for($i=0;$i -lt 90;$i++){try{$c=New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',3000); $c.Close(); $ready=$true; break}catch{Start-Sleep -Seconds 2}}; if($ready){exit 0}else{exit 1}"

if errorlevel 1 (
    echo Server failed to start.
    pause
    exit /b 1
)

start "" "http://localhost:3000"
exit