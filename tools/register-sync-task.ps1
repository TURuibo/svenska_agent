<#
.SYNOPSIS
  Register a Windows Scheduled Task that runs tools/sync-kb.ps1 every day.

.DESCRIPTION
  Run this ONCE. It creates a daily task ("SvenskaKB-DailySync") that pushes your
  Swedish KB to GitHub after the daily inbox import. The default time is 23:55,
  ~25 min after the Cowork import task (23:30) so today's notes are on disk first.

  If the PC is asleep/off at that time, the task runs as soon as possible after
  you next log on (StartWhenAvailable). It runs as you, so your saved GitHub
  credentials work.

.EXAMPLE
  powershell -ExecutionPolicy Bypass -File tools/register-sync-task.ps1
  powershell -ExecutionPolicy Bypass -File tools/register-sync-task.ps1 -At "07:00"
  powershell -ExecutionPolicy Bypass -File tools/register-sync-task.ps1 -Unregister
#>

param(
    [string]$At = "23:55",
    [string]$TaskName = "SvenskaKB-DailySync",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Removed scheduled task '$TaskName'." -ForegroundColor Yellow
    return
}

$repoRoot  = Split-Path -Parent $PSScriptRoot
$syncPath  = Join-Path $PSScriptRoot "sync-kb.ps1"
if (-not (Test-Path $syncPath)) { throw "sync-kb.ps1 not found at $syncPath" }

$action = New-ScheduledTaskAction `
    -Execute "powershell.exe" `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$syncPath`"" `
    -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal `
    -UserId "$env:USERDOMAIN\$env:USERNAME" `
    -LogonType Interactive `
    -RunLevel Limited

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Principal $principal `
    -Description "Daily push of the Swedish KB to GitHub (runs tools/sync-kb.ps1)." `
    -Force | Out-Null

Write-Host "Registered '$TaskName' to run every day at $At." -ForegroundColor Green
Write-Host "Test it now with:  Start-ScheduledTask -TaskName $TaskName" -ForegroundColor Cyan
Write-Host "Remove it with:    powershell -ExecutionPolicy Bypass -File tools/register-sync-task.ps1 -Unregister" -ForegroundColor Cyan
