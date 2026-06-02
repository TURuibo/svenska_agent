# kb_stats.ps1 — knowledge-base dashboard.
# Used by: SessionStart hook (prints a dashboard) and the /kb command.
# Safe & read-only. Never fails the session.

$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)   # project root
$kb   = Join-Path $root 'knowledge_base'

function Count-Type($folder) {
    $p = Join-Path $kb $folder
    if (Test-Path $p) { @(Get-ChildItem -Path $p -Filter *.md -File).Count } else { 0 }
}

$words     = Count-Type 'words'
$phrases   = Count-Type 'phrases'
$sentences = Count-Type 'sentences'
$grammar   = Count-Type 'grammar'
$topics    = Count-Type 'topics'
$sources   = Count-Type 'sources'
$total     = $words + $phrases + $sentences + $grammar

# known: count notes whose frontmatter has 'known: true'
$known = 0
foreach ($f in 'words','phrases','sentences','grammar') {
    $p = Join-Path $kb $f
    if (Test-Path $p) {
        $known += @(Select-String -Path (Join-Path $p '*.md') -Pattern '^known:\s*true' -SimpleMatch:$false).Count
    }
}

# level from profile/level.md (first 'overall' line, best-effort)
$level = 'not assessed'
$prof  = Join-Path $root 'profile\level.md'
if (Test-Path $prof) {
    $m = Select-String -Path $prof -Pattern 'CEFR|SFI|级别|band' -List | Select-Object -First 1
    if ($m) { $level = ($m.Line -replace '[#>*`]', '').Trim() }
}

Write-Output "📚 Swedish KB  |  词 $words · 词组 $phrases · 句子 $sentences · 语法 $grammar · 主题 $topics · 来源 $sources"
Write-Output "✅ 已掌握(known): $known / $total reviewable    🎯 水平: $level"
