@echo off
setlocal
"%SystemRoot%\System32\cscript.exe" //nologo //E:JScript "%~dp0install-launcher-windows.js" %*
exit /b %errorlevel%
