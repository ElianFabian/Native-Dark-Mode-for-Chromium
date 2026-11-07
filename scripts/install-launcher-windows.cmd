@echo off
setlocal
"%SystemRoot%\System32\cscript.exe" //nologo //E:JScript "%~dp0install-launcher-windows.js" %*
set "INSTALL_RESULT=%errorlevel%"
set /p "INSTALL_DISMISS=Press Enter to close..."
exit /b %INSTALL_RESULT%
