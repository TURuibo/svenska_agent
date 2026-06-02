# trace_collect.ps1 — Stop hook.
# When the agent finishes a turn, persist a compact trace report for the current session
# into the project's traces/ folder (one <session>.md, refreshed each turn) and upsert a
# row into traces/sessions.csv for cross-session analysis. Silent on success; never blocks.

$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::InputEncoding  = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'

try {
  $raw = [Console]::In.ReadToEnd()
  if (-not $raw) { exit 0 }
  $data = $raw | ConvertFrom-Json

  $tp = $data.transcript_path
  if (-not $tp -or -not (Test-Path $tp)) { exit 0 }

  $root = $env:CLAUDE_PROJECT_DIR
  if (-not $root) { $root = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
  $traces = Join-Path $root 'traces'
  $script = Join-Path $root '.claude\scripts\trace.ps1'
  if (-not (Test-Path $script)) { exit 0 }

  & powershell -NoProfile -ExecutionPolicy Bypass -File $script -Path $tp -Collect $traces | Out-Null
} catch { }
exit 0
