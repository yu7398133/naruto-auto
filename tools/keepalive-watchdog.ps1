# Keepalive agent watchdog (v1)
#
# Background: 2026-10-09 -- keepalive-agent.js died the previous day at 17:01.
#   The userscript then fired 26 keepalive requests with nobody answering, and
#   the cloud session idled out after ~3 hours. The HKCU Run key only fires at
#   logon, so a dead agent never comes back. A Scheduled Task calls this script
#   every 2 minutes: if the agent is not running, relaunch it.
#
# NOTE: this file must stay pure ASCII. The host runs Windows PowerShell 5.1
#   with an ANSI codepage of gb2312; a UTF-8 file without BOM containing
#   non-ASCII bytes gets mis-decoded and fails to parse. Keep paths ASCII-only
#   by resolving the repo root relative to this script's own location.
#
# Match on the process COMMAND LINE, not the process name -- several node.exe
#   processes exist (serve8899.cjs etc.); matching on "node.exe" alone would
#   always report "alive".

$ErrorActionPreference = 'Stop'

# tools\ -> repo root
$repo    = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$agentJs = Join-Path $repo 'tools\keepalive-agent.js'
$nodeExe = 'C:\Program Files\nodejs\node.exe'
$vbs     = Join-Path $repo 'tools\start-keepalive-agent.vbs'
$logFile = Join-Path $repo 'logs\keepalive-watchdog.log'

function Write-WdLog($msg) {
    $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg
    $dir = Split-Path $logFile -Parent
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

function Get-AgentProc {
    Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
        Where-Object { $_.CommandLine -and $_.CommandLine -like '*keepalive-agent.js*' }
}

try {
    if (-not (Test-Path $agentJs)) { Write-WdLog "ERROR agent script missing: $agentJs"; exit 1 }
    if (-not (Test-Path $nodeExe)) { Write-WdLog "ERROR node missing: $nodeExe"; exit 1 }

    $running = Get-AgentProc
    if ($running) {
        # Already alive -- exit silently. Logging every 2 minutes would just
        # rotate useful history out of the file.
        exit 0
    }

    Write-WdLog 'agent not running -> starting'

    # Prefer the VBS launcher: starting node.exe directly pops a console window.
    if (Test-Path $vbs) {
        Start-Process -FilePath 'wscript.exe' -ArgumentList "`"$vbs`"" -WindowStyle Hidden
    } else {
        Start-Process -FilePath $nodeExe -ArgumentList "`"$agentJs`"" -WindowStyle Hidden
    }

    Start-Sleep -Seconds 4

    $now = Get-AgentProc
    if ($now) {
        Write-WdLog ("started OK (PID " + (($now | ForEach-Object { $_.ProcessId }) -join ',') + ")")
    } else {
        Write-WdLog 'ERROR agent still absent after launch -- manual check needed'
    }
} catch {
    Write-WdLog "ERROR watchdog exception: $($_.Exception.Message)"
    exit 1
}
