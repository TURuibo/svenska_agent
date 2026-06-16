<#
.SYNOPSIS
  每日 08:00 由 Windows 任务计划调用：跑 headless Claude Code 生成今天的
  adjektiv+substantiv 四式变形页到 inbox/，然后弹一个 Windows 系统通知。

  手动测试： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily-adjsubst.ps1
  生成指定日期： ... -File scripts\daily-adjsubst.ps1 -Date 2026-06-09
#>
param(
  [string]$Date = '',  # 空 = 今天；否则 YYYY-MM-DD
  [switch]$Force        # 强制重新生成（即使今天的文件已在 inbox 未导入）；手动多次生成时用
)

$ErrorActionPreference = 'Stop'
$Proj  = 'C:\Users\ruibo\Documents\svenska_agent'
$Inbox = Join-Path $Proj 'inbox'
$Log   = Join-Path $Proj 'scripts\adjsubst-run.log'
$Model = 'claude-opus-4-8'   # 语法要求高，用 opus；想省成本可改 claude-sonnet-4-6
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

# --- 算好 date + theme，传给命令（headless 运行就不需要再做任何计算/Bash）---
$d = if ($Date) { [datetime]::ParseExact($Date, 'yyyy-MM-dd', $null) } else { Get-Date }
$dateStr = $d.ToString('yyyy-MM-dd')
$theme   = $d.DayOfYear % 10

# --- 断点续跑：今天的练习文件若还躺在 inbox（成功跑完会被 import-and-rebuild 移到 imported/，
#     不会留在 inbox），说明上次「生成成功但 import/建站/归档/push 没跑完就被中断」。
#     这种情况跳过生成，直接补跑后半截 import-and-rebuild，避免再生成一篇 + 旧文件成孤儿。
#     -Force 可强制重新生成（手动想多出一篇时用）。---
$pending = Get-ChildItem -Path $Inbox -Filter "adjsubst-$dateStr-*.md" -ErrorAction SilentlyContinue |
           Sort-Object LastWriteTime -Descending | Select-Object -First 1
$resume = ($null -ne $pending -and -not $Force)

if ($resume) {
  "RESUME: $($pending.Name) 已在 inbox 未导入（上次被中断）—— 跳过生成，直接 import+rebuild" | Add-Content -Encoding utf8 $Log
} else {
  $prompt  = "/adjsubst $dateStr $theme"
  "prompt: $prompt" | Add-Content -Encoding utf8 $Log

  # --- 跑 headless claude：带超时 + 进程树清理（见 headless-claude.ps1），只开放文件工具，不给 Bash ---
  $r = Invoke-ClaudeHeadless -Claude $claude -Prompt $prompt -Model $Model `
         -AllowedTools 'Read,Glob,Edit,Write' -TimeoutMinutes $TimeoutMin
  $r.Output | Add-Content -Encoding utf8 $Log
  if ($r.TimedOut) { "ERROR: generation TIMED OUT (${TimeoutMin}m), tree killed" | Add-Content -Encoding utf8 $Log }
  "claude exit=$($r.ExitCode)" | Add-Content -Encoding utf8 $Log
}

# --- 找今天（或指定日期）生成的文件 ---
$stamp = $dateStr
$file  = Get-ChildItem -Path $Inbox -Filter "adjsubst-$stamp-*.md" -ErrorAction SilentlyContinue |
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
    Show-Toast "🇸🇪 今日练习已生成并录入" "$($file.BaseName)  —  已进知识库 · 站点已重建"
  } else {
    Show-Toast "⚠️ 练习已生成但录入失败" "$($file.BaseName) 仍在 inbox，详见 scripts\import-rebuild.log"
  }
} else {
  "ERROR: no inbox file for $stamp" | Add-Content -Encoding utf8 $Log
  Show-Toast "⚠️ adjsubst 生成失败" "未找到 $stamp 的文件，详见 scripts\adjsubst-run.log"
}

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') end ====" | Add-Content -Encoding utf8 $Log
