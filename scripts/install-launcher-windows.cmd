@echo off
setlocal
"%SystemRoot%\System32\cscript.exe" //nologo //E:JScript "%~dp0internal\install-launcher-windows.js" %*
set "INSTALL_RESULT=%errorlevel%"
set /p "INSTALL_DISMISS=Press Enter to close..."
exit /b %INSTALL_RESULT%
