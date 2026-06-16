<#
.SYNOPSIS
  Sync the Swedish KB to GitHub and refresh the live site.

.DESCRIPTION
  Run this on your own machine (it needs your git credentials).
  It:
    1. Clears a stale .git/index.lock (left by a crashed git process).
    2. Rebuilds site/kb-data.js from knowledge_base/ (node tools/build-kb-site.js).
    3. Stages ONLY real content (knowledge_base/, review/schedule.md, profile/,
       .gitattributes, site/kb-data.js) - never local-only files
       (settings.local.json, traces/, inbox/).
    4. Commits with a dated message (skips commit if nothing changed).
    5. Pushes to origin/main.
  The GitHub Action (.github/workflows/kb-site.yml) then republishes site/ to
  the gh-pages branch -> your GitHub Pages site updates automatically.

.EXAMPLE
  pwsh -File tools/sync-kb.ps1
  pwsh -File tools/sync-kb.ps1 -Message "Import kropp & halsa (50 words)"
#>

param(
    [string]$Message = "",
    [switch]$NoPush
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

# Log every run to .git\sync-kb.log (kept out of git, never committed)
$logFile = Join-Path $repoRoot ".git\sync-kb.log"
try { Start-Transcript -Path $logFile -Append | Out-Null } catch {}
Write-Host "===== sync-kb run $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') =====" -ForegroundColor Cyan

Write-Host "==> Repo: $repoRoot" -ForegroundColor Cyan

# 1. Clear a stale index lock if present
$lock = Join-Path $repoRoot ".git/index.lock"
if (Test-Path $lock) {
    Write-Host "==> Removing stale .git/index.lock" -ForegroundColor Yellow
    Remove-Item $lock -Force
}

# 2. Rebuild the site data (KB viewer + reading data)
Write-Host "==> Rebuilding site/kb-data.js" -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot "build-kb-site.js")
if ($LASTEXITCODE -ne 0) { throw "build-kb-site.js failed (exit $LASTEXITCODE)" }

Write-Host "==> Rebuilding site/reading/reading-data.js" -ForegroundColor Cyan
& node (Join-Path $PSScriptRoot "build-reading-site.js")
if ($LASTEXITCODE -ne 0) { throw "build-reading-site.js failed (exit $LASTEXITCODE)" }

# 3. Stage only content paths that exist
$paths = @(".gitattributes", "knowledge_base", "imported", "review/schedule.md", "profile",
           "site/kb-data.js", "site/reading/reading-data.js", "tools") |
    Where-Object { Test-Path $_ }
git add -- $paths

# 4. Commit only if something is staged
git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "==> Nothing to commit - working tree already in sync." -ForegroundColor Green
    exit 0
}

$staged = (git diff --cached --name-only | Measure-Object -Line).Lines
if (-not $Message) {
    $Message = "KB sync $(Get-Date -Format 'yyyy-MM-dd') ($staged files)"
}
Write-Host "==> Committing: $Message" -ForegroundColor Cyan
git commit -m $Message

# 5. Integrate any remote changes, then push (robust against "fetch first" rejects)
if ($NoPush) {
    Write-Host "==> -NoPush set; commit created but not pushed." -ForegroundColor Yellow
    exit 0
}
Write-Host "==> Pulling remote changes (rebase, autostash)" -ForegroundColor Cyan
git pull --rebase --autostash -X theirs origin main
if ($LASTEXITCODE -ne 0) { throw "git pull failed (exit $LASTEXITCODE) - resolve manually" }

Write-Host "==> Pushing to origin/main" -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) { throw "git push failed (exit $LASTEXITCODE)" }
Write-Host "==> Done. GitHub Action will republish the site to gh-pages." -ForegroundColor Green
