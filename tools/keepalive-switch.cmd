@echo off
chcp 437 >nul
setlocal EnableDelayedExpansion

REM Naruto cloud-gaming keepalive switch.
REM
REM This file must stay PURE ASCII. cmd.exe on this host reads batch files with
REM the ANSI codepage (gb2312). A UTF-8 file containing non-ASCII bytes gets
REM split mid-character and the mangled fragments break parsing -- which is
REM exactly what happened to v1 (the repo path literal corrupted the script).
REM Paths are therefore derived from %~dp0 instead of being hard-coded.
REM
REM Layout:  <repo>\tools\keepalive-switch.cmd   ->  %~dp0 = <repo>\tools\
REM
REM Scope: this switch controls the AGENT PROCESS ONLY.
REM   The old NarutoKeepAliveWatchdog scheduled task is gone from this script:
REM   its file is owned by BUILTIN\Administrators and the normal user account
REM   cannot enable, disable or delete it (schtasks returns "Access is denied").
REM   It is left permanently Disabled, so it never runs. The HKCU Run key that
REM   used to relaunch the agent at logon has been removed too -- otherwise the
REM   agent would come back by itself after a reboot and steal focus again.

set "TOOLS=%~dp0"
if "%TOOLS:~-1%"=="\" set "TOOLS=%TOOLS:~0,-1%"
for %%I in ("%TOOLS%\..") do set "REPO=%%~fI"

set "AGENT=%REPO%\tools\keepalive-agent.js"
set "VBS=%REPO%\tools\start-keepalive-agent.vbs"
set "NODEEXE=C:\Program Files\nodejs\node.exe"

REM --- Probe agent state via a temp file (avoids nested-quote fragility) ---
call :PROBE
set "AGENTPID=%PROBEPID%"

echo ============================================
echo    Naruto Keepalive Switch
echo ============================================
echo.
if defined AGENTPID (
  echo    Agent    : RUNNING   ^(PID !AGENTPID!^)
) else (
  echo    Agent    : STOPPED
)
echo.
echo    While the agent runs it periodically pulls the
echo    browser to the foreground, which steals keyboard
echo    focus from whatever you are doing. Leave it OFF
echo    while you are actively using this computer.
echo.
echo ============================================
echo.

if defined AGENTPID (
  echo    [1] Turn OFF   ^(stop the agent^)
  echo    [2] Exit
  echo.
  set /p "CH=   Choose [1/2]: "
  if "!CH!"=="1" goto STOP
  goto END
) else (
  echo    [1] Turn ON    ^(start the agent^)
  echo    [2] Exit
  echo.
  set /p "CH=   Choose [1/2]: "
  if "!CH!"=="1" goto START
  goto END
)

:START
echo.
echo    Starting agent ...
if exist "%VBS%" (
  start "" wscript.exe "%VBS%"
) else (
  start "" "%NODEEXE%" "%AGENT%"
)
REM Poll instead of a blind sleep: the agent needs a moment to bind.
set "NEWPID="
for /l %%N in (1,1,15) do (
  if not defined NEWPID (
    call :PROBE
    if defined PROBEPID set "NEWPID=!PROBEPID!"
    if not defined NEWPID timeout /t 1 /nobreak >nul
  )
)
if defined NEWPID (
  echo    Agent started. PID !NEWPID!
  echo.
  echo    DONE -- keepalive is ON.
) else (
  echo    [WARN] Agent did not start within 15s.
  echo           Check that Cent Browser is running with port 9222 open.
  echo.
  echo    FAILED -- keepalive is still OFF.
)
goto END

:STOP
echo.
echo    Stopping agent ...
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*keepalive-agent.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }" 2>nul
set "TMPF=%TEMP%\ka_kill_%RANDOM%.txt"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*keepalive-agent.js*' } | ForEach-Object { $_.ProcessId }" > "%TMPF%" 2>nul
for /f "usebackq tokens=1" %%P in ("%TMPF%") do echo    Killed PID %%P
del "%TMPF%" >nul 2>nul
echo.
echo    DONE -- keepalive is OFF. No more focus stealing.
goto END

REM ---------------------------------------------------------------------------
REM Sets PROBEPID to the first keepalive-agent.js PID, or clears it if none.
REM ---------------------------------------------------------------------------
:PROBE
set "PROBEPID="
set "TMPF=%TEMP%\ka_probe_%RANDOM%%RANDOM%.txt"
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*keepalive-agent.js*' } | ForEach-Object { $_.ProcessId }" > "%TMPF%" 2>nul
for /f "usebackq tokens=1" %%P in ("%TMPF%") do if not defined PROBEPID set "PROBEPID=%%P"
del "%TMPF%" >nul 2>nul
exit /b 0

:END
echo.
echo    Press any key to close ...
pause >nul
endlocal
