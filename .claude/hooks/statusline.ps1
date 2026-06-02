# statusline.ps1 — custom status line for this project.
# Receives session JSON on stdin from Claude Code; prints ONE line.
# Shows model + live KB counts + current level so the learner always sees progress.

$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { [Console]::InputEncoding  = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'
$model = ''
try {
    $raw = [Console]::In.ReadToEnd()
    if ($raw) {
        $data  = $raw | ConvertFrom-Json
        $model = $data.model.display_name
        $cwd   = $data.workspace.current_dir
    }
} catch { }
if (-not $cwd) { $cwd = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$kb   = Join-Path $root 'knowledge_base'

function C($f){ $p = Join-Path $kb $f; if (Test-Path $p){ @(Get-ChildItem $p -Filter *.md -File).Count } else { 0 } }
$w = C 'words'; $p = C 'phrases'; $s = C 'sentences'; $g = C 'grammar'

$level = '?'
$prof  = Join-Path $root 'profile\level.md'
if (Test-Path $prof) {
    $m = Select-String -Path $prof -Pattern 'A1|A2|B1|B2|C1' -List | Select-Object -First 1
    if ($m -and $m.Matches.Count -gt 0) { $level = $m.Matches[0].Value }
}

Write-Output "🇸🇪 svensk_agent | $model | 词$w 组$p 句$s 法$g | 水平 $level"
