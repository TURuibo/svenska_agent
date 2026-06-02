# kb_changelog.ps1 — PostToolUse hook (Write|Edit).
# Observational only: when a knowledge_base note is written/edited, append a line to a changelog
# and (advisory) warn if the note is missing YAML frontmatter. Never blocks the tool (always exit 0).

$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
try { [Console]::InputEncoding  = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'
try {
    $raw = [Console]::In.ReadToEnd()
    if (-not $raw) { exit 0 }
    $data = $raw | ConvertFrom-Json
    $fp = $data.tool_input.file_path
    if (-not $fp) { exit 0 }

    $root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
    $kb   = Join-Path $root 'knowledge_base'
    if ($fp -notlike "*knowledge_base*" -or $fp -notlike '*.md') { exit 0 }

    # append to changelog
    $log = Join-Path $root 'review\.kb-changelog.log'
    $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    $rel = $fp.Replace($root, '').TrimStart('\','/')
    Add-Content -Path $log -Value "$stamp  $($data.tool_name)  $rel" -Encoding utf8

    # advisory frontmatter check (does not block)
    if ((Test-Path $fp) -and ($fp -notlike '*_templates*')) {
        $first = Get-Content -Path $fp -TotalCount 1
        if ($first -ne '---') {
            Write-Output "ℹ️ KB note '$rel' has no YAML frontmatter — add a 'type:' block per sv-knowledge-base skill."
        }
    }
} catch { }
exit 0
