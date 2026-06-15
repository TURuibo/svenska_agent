<#
.SYNOPSIS
  每日由 Windows 任务计划调用：跑 headless Claude Code 生成今天的情景练习
  （对话 / 功能文本 / 小故事）到 inbox/，然后弹一个 Windows 系统通知。

  手动测试： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily-scenario.ps1
  生成指定日期： ... -File scripts\daily-scenario.ps1 -Date 2026-06-15
#>
param(
  [string]$Date = ''   # 空 = 今天；否则 YYYY-MM-DD
)

$ErrorActionPreference = 'Stop'
$Proj  = 'C:\Users\ruibo\Documents\svenska_agent'
$Inbox = Join-Path $Proj 'inbox'
$Log   = Join-Path $Proj 'scripts\scenario-run.log'
$Model = 'claude-opus-4-8'   # 语言质量要求高，用 opus；想省成本可改 claude-sonnet-4-6
$TimeoutMin = 12             # 生成上限；超时杀进程树，不留 leftover

. (Join-Path $PSScriptRoot 'headless-claude.ps1')   # Invoke-ClaudeHeadless / Clear-HeadlessLeftovers

Set-Location $Proj
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') start (Date='$Date') ====" | Add-Content -Encoding utf8 $Log
Clear-HeadlessLeftovers   # reap leftover headless PIDs from a prior run that died mid-run (safe: only PIDs we recorded)

# --- 解析 claude.exe 路径（任务计划环境 PATH 可能不全）---
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
  $fallback = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\claude.exe"
  if (Test-Path $fallback) { $claude = $fallback }
}
if (-not $claude) { "ERROR: claude.exe not found on PATH" | Add-Content -Encoding utf8 $Log; throw "claude.exe not found" }

# --- 算好 date + index，传给命令（headless 运行就不需要再做任何计算/Bash）---
$d = if ($Date) { [datetime]::ParseExact($Date, 'yyyy-MM-dd', $null) } else { Get-Date }
$dateStr = $d.ToString('yyyy-MM-dd')
$index   = $d.DayOfYear % 14
$prompt  = "/dagens-scenario $dateStr $index"
"prompt: $prompt" | Add-Content -Encoding utf8 $Log

# --- 跑 headless claude：带超时 + 进程树清理（见 headless-claude.ps1），只开放读写/查找工具，不给 Bash ---
$r = Invoke-ClaudeHeadless -Claude $claude -Prompt $prompt -Model $Model `
       -AllowedTools 'Read,Glob,Grep,Edit,Write' -TimeoutMinutes $TimeoutMin
$r.Output | Add-Content -Encoding utf8 $Log
if ($r.TimedOut) { "ERROR: generation TIMED OUT (${TimeoutMin}m), tree killed" | Add-Content -Encoding utf8 $Log }
"claude exit=$($r.ExitCode)" | Add-Content -Encoding utf8 $Log

# --- 找今天（或指定日期）生成的文件 ---
$stamp = $dateStr
$file  = Get-ChildItem -Path $Inbox -Filter "scenario-$stamp-*.md" -ErrorAction SilentlyContinue |
         Sort-Object LastWriteTime -Descending | Select-Object -First 1

# --- 通知函数：WinRT toast，失败回退到气泡提示 ---
function Show-Toast([string]$Title, [string]$Text) {
  try {
    [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
    [Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom, ContentType = WindowsRuntime] | Out-Null
    $tpl  = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
    $txt  = $tpl.GetElementsByTagName('text')
    $txt.Item(0).AppendChild($tpl.CreateTextNode($Title)) | Out-Null
    $txt.Item(1).AppendChild($tpl.CreateTextNode($Text))  | Out-Null
    $toast = [Windows.UI.Notifications.ToastNotification]::new($tpl)
    $appId = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe'
    [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier($appId).Show($toast)
  } catch {
    try {
      Add-Type -AssemblyName System.Windows.Forms
      $n = New-Object System.Windows.Forms.NotifyIcon
      $n.Icon = [System.Drawing.SystemIcons]::Information
      $n.Visible = $true
      $n.ShowBalloonTip(15000, $Title, $Text, [System.Windows.Forms.ToolTipIcon]::Info)
      Start-Sleep -Seconds 12
      $n.Dispose()
    } catch { "WARN: toast failed: $_" | Add-Content -Encoding utf8 $Log }
  }
}

if ($file) {
  "OK generated: $($file.Name)" | Add-Content -Encoding utf8 $Log
  # --- 自动 import + rebuild + 归档（共享助手脚本）---
  $ir = Join-Path $Proj 'scripts\import-and-rebuild.ps1'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $ir -File $file.FullName
  $irExit = $LASTEXITCODE
  "import-and-rebuild exit=$irExit" | Add-Content -Encoding utf8 $Log
  if ($irExit -eq 0) {
    Show-Toast "🇸🇪 今日情景已生成并录入" "$($file.BaseName)  —  已进知识库 · 站点已重建"
  } else {
    Show-Toast "⚠️ 情景已生成但录入失败" "$($file.BaseName) 仍在 inbox，详见 scripts\import-rebuild.log"
  }
} else {
  "ERROR: no inbox file for $stamp" | Add-Content -Encoding utf8 $Log
  Show-Toast "⚠️ scenario 生成失败" "未找到 $stamp 的文件，详见 scripts\scenario-run.log"
}

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') end ====" | Add-Content -Encoding utf8 $Log
