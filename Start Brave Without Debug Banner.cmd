@echo off
setlocal

rem This launcher changes only this Brave launch, not installed shortcuts.
set "BRAVE_EXE=%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
if exist "%BRAVE_EXE%" goto found
set "BRAVE_EXE=%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe"
if exist "%BRAVE_EXE%" goto found
set "BRAVE_EXE=%LOCALAPPDATA%\BraveSoftware\Brave-Browser\Application\brave.exe"
if exist "%BRAVE_EXE%" goto found

echo Brave could not be found in the standard installation locations.
if /I not "%~1"=="/check" pause
exit /b 1

:found
if /I "%~1"=="/check" goto check

"%SystemRoot%\System32\tasklist.exe" /FI "IMAGENAME eq brave.exe" /NH | "%SystemRoot%\System32\find.exe" /I "brave.exe" >nul
if not errorlevel 1 goto running

rem Suppresses debugger-extension banners for all extensions in this launch.
start "" "%BRAVE_EXE%" --silent-debugger-extension-api
exit /b 0

:running
echo Brave is still running. Close all Brave windows using Exit first.
echo This launcher will not close browser windows or terminate processes.
echo If background Brave processes remain, end them yourself after saving your work.
echo Then run this launcher again.
pause
exit /b 2

:check
echo Brave installation found: "%BRAVE_EXE%"
echo Launch option: --silent-debugger-extension-api
echo Check only: Brave has not been launched or closed.
exit /b 0
