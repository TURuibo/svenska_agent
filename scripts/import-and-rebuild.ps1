<#
.SYNOPSIS
  把一个 inbox 文件录入知识库并重建网页查看器，成功后归档到 imported/。
  由每日生成脚本在产出文件后调用，也可手动：
    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\import-and-rebuild.ps1 -File "inbox\scenario-2026-06-15-xxx.md"

  返回：成功 exit 0；import 或 rebuild 失败 exit 1（失败时不归档，文件留在 inbox 供重试）。
#>
param(
  [Parameter(Mandatory = $true)][string]$File   # inbox 文件路径（绝对或相对项目根）
)

$ErrorActionPreference = 'Stop'
$Proj     = 'C:\Users\ruibo\Documents\svenska_agent'
$Imported = Join-Path $Proj 'imported'
$Log      = Join-Path $Proj 'scripts\import-rebuild.log'
$Model    = 'claude-opus-4-8'   # import 要跑 swedish-dictionary 补全词条，质量优先；想省成本改 claude-sonnet-4-6

Set-Location $Proj
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') import+rebuild start (File='$File') ====" | Add-Content -Encoding utf8 $Log

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
$line = "`"$claude`" -p `"$prompt`" --model $Model --allowedTools Read,Glob,Grep,Edit,Write,Task < nul 2>&1"
$out  = cmd /c $line | Out-String
$out | Add-Content -Encoding utf8 $Log
$importExit = $LASTEXITCODE
"claude /import exit=$importExit" | Add-Content -Encoding utf8 $Log
if ($importExit -ne 0) { "ERROR: import failed, not archiving" | Add-Content -Encoding utf8 $Log; exit 1 }

# --- 2) 重建站点：node tools/build-kb-site.js ---
$buildOut = cmd /c "node tools\build-kb-site.js 2>&1" | Out-String
$buildOut | Add-Content -Encoding utf8 $Log
$buildExit = $LASTEXITCODE
"node build exit=$buildExit" | Add-Content -Encoding utf8 $Log
if ($buildExit -ne 0) { "ERROR: rebuild failed, not archiving" | Add-Content -Encoding utf8 $Log; exit 1 }

# --- 3) 归档到 imported/ ---
if (-not (Test-Path $Imported)) { New-Item -ItemType Directory -Path $Imported | Out-Null }
Move-Item -Path $path -Destination (Join-Path $Imported $base) -Force
"OK: imported + rebuilt + archived $base" | Add-Content -Encoding utf8 $Log
"==== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') import+rebuild end ====" | Add-Content -Encoding utf8 $Log
exit 0
