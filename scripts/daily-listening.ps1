<#
.SYNOPSIS
  每日由 Claude Code routine（或 Windows 任务计划）调用：跑 headless Claude Code
  抓取最新一集 SVT「Nyheter på lätt svenska」字幕(原文+时间轴)，配中文翻译+生词，
  写 listening/svt-latt-<DATE>.json，重建 Lyssna 听力站并 push，然后弹 Windows 通知。

  手动测试： powershell -NoProfile -ExecutionPolicy Bypass -File scripts\daily-listening.ps1
#>
param(
  [string]$VideoId = ''   # 可选：指定 SVT video id；缺省取最新一集
)

$ErrorActionPreference = 'Stop'
$Proj  = 'C:\Users\ruibo\Documents\svenska_agent'
$Lst   = Join-Path $Proj 'listening'
$Log   = Join-Path $Proj 'scripts\listening-run.log'
$Model = 'claude-opus-4-8'   # 翻译质量优先；想省成本改 claude-sonnet-4-6
$TimeoutMin = 12             # 抓取+翻译上限；超时杀进程树，不留 leftover

. (Join-Path $PSScriptRoot 'headless-claude.ps1')   # Invoke-ClaudeHeadless / Clear-HeadlessLeftovers

Set-Location $Proj
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') start (VideoId='$VideoId') ====" | Add-Content -Encoding utf8 $Log
Clear-HeadlessLeftovers

# --- 解析 claude.exe 路径（任务计划环境 PATH 可能不全）---
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
  $fallback = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\claude.exe"
  if (Test-Path $fallback) { $claude = $fallback }
}
if (-not $claude) { "ERROR: claude.exe not found on PATH" | Add-Content -Encoding utf8 $Log; throw "claude.exe not found" }

# --- 记录抓取前已有的最新一集文件，用于判断这次有没有新增 ---
function Latest-LstFile { Get-ChildItem -Path $Lst -Filter 'svt-latt-*.json' -ErrorAction SilentlyContinue |
  Sort-Object Name -Descending | Select-Object -First 1 }
$before = Latest-LstFile

# --- 跑 headless claude：命令需要 Web 工具抓 SVT 接口 + Bash 跑 node 重建 ---
$prompt = if ($VideoId) { "/dagens-horovning $VideoId" } else { "/dagens-horovning" }
"prompt: $prompt" | Add-Content -Encoding utf8 $Log
$r = Invoke-ClaudeHeadless -Claude $claude -Prompt $prompt -Model $Model `
       -AllowedTools 'WebSearch,WebFetch,Read,Glob,Grep,Write,Bash' -TimeoutMinutes $TimeoutMin
$r.Output | Add-Content -Encoding utf8 $Log
if ($r.TimedOut) { "ERROR: generation TIMED OUT (${TimeoutMin}m), tree killed" | Add-Content -Encoding utf8 $Log }
"claude exit=$($r.ExitCode)" | Add-Content -Encoding utf8 $Log

# --- 重建听力站数据（幂等：即使命令已自己跑过 node 也无妨）---
$buildOut = cmd /c "node tools\build-listening-site.js 2>&1" | Out-String
$buildOut | Add-Content -Encoding utf8 $Log
"node build-listening-site exit=$LASTEXITCODE" | Add-Content -Encoding utf8 $Log

$after = Latest-LstFile

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

if ($after -and ($null -eq $before -or $after.Name -ne $before.Name)) {
  "OK new episode: $($after.Name)" | Add-Content -Encoding utf8 $Log
  # --- push（best-effort：sync-kb 会重建听力数据并暂存 listening/ + site/listening/）---
  try {
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Proj 'tools\sync-kb.ps1') `
        -Message "Daily SVT listening $($after.BaseName)"
    "sync-kb exit=$LASTEXITCODE" | Add-Content -Encoding utf8 $Log
  } catch {
    "WARN: push failed (data generated, will sync next time): $($_.Exception.Message)" | Add-Content -Encoding utf8 $Log
  }
  Show-Toast "🎧 今日 SVT 听力已就绪" "$($after.BaseName)  —  打开主站侧栏 🎧 Lyssna 练习"
} elseif ($after) {
  "INFO: no new episode (latest already present: $($after.Name))" | Add-Content -Encoding utf8 $Log
  Show-Toast "🎧 SVT 听力：暂无新一集" "最新一集已在站点：$($after.BaseName)"
} else {
  "ERROR: no listening json produced" | Add-Content -Encoding utf8 $Log
  Show-Toast "⚠️ SVT 听力抓取失败" "未生成数据，详见 scripts\listening-run.log"
}

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') end ====" | Add-Content -Encoding utf8 $Log
