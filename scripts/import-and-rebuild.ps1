<#
.SYNOPSIS
  把一个 inbox 文件录入知识库并重建网页查看器，成功后归档到 imported/。
  由每日生成脚本在产出文件后调用，也可手动：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-and-rebuild.ps1 -File "inbox\scenario-2026-06-15-xxx.md"

  返回：成功 exit 0；import 或 rebuild 失败 exit 1（失败时不归档，文件留在 inbox 供重试）。
#>
param(
  [Parameter(Mandatory = $true)][string]$File,  # inbox 文件路径（绝对或相对项目根）
  [switch]$NoPush                                # 加上则跳过 push（只本地导入+重建+归档）
)

$ErrorActionPreference = 'Stop'
$Proj     = 'C:\Users\ruibo\Documents\svenska_agent'
$Imported = Join-Path $Proj 'imported'
$Log      = Join-Path $Proj 'scripts\import-rebuild.log'
$Model    = 'claude-opus-4-8'   # import 要跑 swedish-dictionary 补全词条，质量优先；想省成本改 claude-sonnet-4-6
$TimeoutMin = 20                 # import + librarian 上限；超时则杀进程树，不留 leftover
$LockFile   = Join-Path $env:TEMP 'svensk-import-rebuild.lock'   # 全局互斥：串行化并发的 import-and-rebuild
$LockWaitMin = 30                # 抢锁最多等多久（要 > 一次 import 的 $TimeoutMin，让第二个实例排队而非失败）

. (Join-Path $PSScriptRoot 'headless-claude.ps1')   # Invoke-ClaudeHeadless / Clear-HeadlessLeftovers

# --- 抢全局独占锁，串行化并发运行 ---------------------------------------------
# 两条每日流水线（scenario + adjsubst）若重叠会同时写 import-rebuild.log（Add-Content 撞文件锁
# 在 Stop 模式下抛异常中止）、同时 `node build-kb-site.js` 写同一份 site/kb-data.js、同时动 git
# index。一个独占文件锁把整个临界区串起来：第二个实例排队等（最多 $LockWaitMin），不并发、不失败。
# FileShare.None 保证同一时刻只有一个进程持有；本进程退出时句柄由 OS 释放（每次都是独立 powershell.exe）。
$lockStream = $null
$lockDeadline = (Get-Date).AddMinutes($LockWaitMin)
while ($null -eq $lockStream) {
  try {
    $lockStream = [System.IO.File]::Open($LockFile, 'OpenOrCreate', 'ReadWrite', 'None')
  } catch {
    if ((Get-Date) -ge $lockDeadline) {
      try { "ERROR: 抢锁超时(${LockWaitMin}m)，另一个 import-and-rebuild 仍在运行，放弃本次（文件留 inbox 下次重试）" | Add-Content -Encoding utf8 $Log } catch {}
      exit 1
    }
    Start-Sleep -Seconds 10
  }
}

Set-Location $Proj
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') import+rebuild start (File='$File') ====" | Add-Content -Encoding utf8 $Log
Clear-HeadlessLeftovers   # reap leftover headless PIDs from a prior run that died mid-run (safe: only PIDs we recorded)

# --- 解析文件 ---
$path = if ([System.IO.Path]::IsPathRooted($File)) { $File } else { Join-Path $Proj $File }
if (-not (Test-Path $path)) { "ERROR: file not found: $path" | Add-Content -Encoding utf8 $Log; throw "file not found: $path" }
$base = Split-Path $path -Leaf

# --- 解析 claude.exe ---
$claude = (Get-Command claude -ErrorAction SilentlyContinue).Source
if (-not $claude) {
  $fallback = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Anthropic.ClaudeCode_Microsoft.Winget.Source_8wekyb3d8bbwe\claude.exe"
  if (Test-Path $fallback) { $claude = $fallback }
}
if (-not $claude) { "ERROR: claude.exe not found on PATH" | Add-Content -Encoding utf8 $Log; throw "claude.exe not found" }

# --- 1) 录入：headless /import <文件名> ---
# 需要 Task 工具：sv-import 对 >3 项会 spawn sv-librarian 子智能体；其内部用 Read/Write/Edit/Glob/Grep。
$prompt = "/import $base"
"prompt: $prompt" | Add-Content -Encoding utf8 $Log
$r = Invoke-ClaudeHeadless -Claude $claude -Prompt $prompt -Model $Model `
       -AllowedTools 'Read,Glob,Grep,Edit,Write,Task' -TimeoutMinutes $TimeoutMin
$r.Output | Add-Content -Encoding utf8 $Log
$importExit = $r.ExitCode
if ($r.TimedOut) { "ERROR: import TIMED OUT (${TimeoutMin}m), tree killed, not archiving" | Add-Content -Encoding utf8 $Log }
"claude /import exit=$importExit" | Add-Content -Encoding utf8 $Log
if ($importExit -ne 0) { "ERROR: import failed, not archiving" | Add-Content -Encoding utf8 $Log; exit 1 }

# --- 2) 重建站点：node tools/build-kb-site.js ---
$buildOut = cmd /c "node tools\build-kb-site.js 2>&1" | Out-String
$buildOut | Add-Content -Encoding utf8 $Log
$buildExit = $LASTEXITCODE
"node build exit=$buildExit" | Add-Content -Encoding utf8 $Log
if ($buildExit -ne 0) { "ERROR: rebuild failed, not archiving" | Add-Content -Encoding utf8 $Log; exit 1 }

# --- 3) 归档到 root imported/（self-correcting）---
# headless /import 没有 Bash、不该自己搬文件，但保险起见：无论它把文件留在 inbox\、
# inbox\imported\ 还是已在 root imported\，都把它落到 root imported\。
if (-not (Test-Path $Imported)) { New-Item -ItemType Directory -Path $Imported | Out-Null }
$dest = Join-Path $Imported $base
$candidates = @($path, (Join-Path $Proj "inbox\imported\$base"), $dest)
$src = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($src -and ($src -ne $dest)) { Move-Item -Path $src -Destination $dest -Force }
if (Test-Path $dest) { "OK: imported + kb-rebuilt + archived -> imported\$base" | Add-Content -Encoding utf8 $Log }
else { "WARN: could not locate file to archive ($base) - left as-is" | Add-Content -Encoding utf8 $Log }

# --- 4) 推送到 GitHub（best-effort：push 失败不影响已成功的导入/归档）---
if (-not $NoPush) {
  try {
    Write-Host "==> push via tools/sync-kb.ps1"
    & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $Proj 'tools\sync-kb.ps1') `
        -Message "Daily auto-import $base"
    "sync-kb exit=$LASTEXITCODE" | Add-Content -Encoding utf8 $Log
  } catch {
    "WARN: push failed (import succeeded, will sync next time): $($_.Exception.Message)" | Add-Content -Encoding utf8 $Log
  }
} else {
  "push skipped (-NoPush)" | Add-Content -Encoding utf8 $Log
}

"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') import+rebuild end ====" | Add-Content -Encoding utf8 $Log
exit 0
