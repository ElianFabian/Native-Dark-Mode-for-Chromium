@echo off
setlocal
"%SystemRoot%\System32\cscript.exe" //nologo //E:JScript "%~dp0internal\install-launcher-windows.js" --restore %*
exit /b %errorlevel%
