# trace.ps1 — Claude Code session trace analyzer.
# Parses a session JSONL transcript into a readable report:
#   step timeline, tool table, tokens-per-turn, slowest steps, subagent breakdown.
#
# Interactive (via /trace):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .claude/scripts/trace.ps1            # latest session
#   ... trace.ps1 -List                       # list sessions for this project
#   ... trace.ps1 -Session <id>               # a specific session id
#   ... trace.ps1 -Path <file.jsonl>          # an explicit file
#   ... trace.ps1 -Timeline                   # also print the full step-by-step timeline
#   ... trace.ps1 -Top 15                      # change how many slowest steps to show
#
# Collect (used by the Stop hook to persist a report into the project):
#   ... trace.ps1 -Path <file.jsonl> -Collect <dir>   # writes <dir>/<session>.md + upserts <dir>/sessions.csv

param(
  [string]$Path,
  [string]$Session,
  [switch]$List,
  [switch]$Timeline,
  [int]$Top = 10,
  [string]$Collect
)

$OutputEncoding = [System.Text.Encoding]::UTF8
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }
$ErrorActionPreference = 'SilentlyContinue'

# Collect mode always includes the full timeline in the persisted report.
if ($Collect) { $Timeline = $true }

# --- locate the project's transcript directory ---
$projDir = $env:CLAUDE_PROJECT_DIR
if (-not $projDir) { $projDir = (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) }
$hash = ($projDir -replace '[^A-Za-z0-9]', '-')
$txDir = Join-Path $HOME (".claude\projects\$hash")

if ($List) {
  if (-not (Test-Path $txDir)) { Write-Output "No transcript dir: $txDir"; return }
  Write-Output "Sessions for this project ($txDir):"
  Get-ChildItem $txDir -Filter *.jsonl | Sort-Object LastWriteTime -Descending | ForEach-Object {
    "  {0}  {1,8:N0} KB  {2}" -f $_.LastWriteTime.ToString('yyyy-MM-dd HH:mm'), ($_.Length/1KB), $_.BaseName
  }
  return
}

# --- pick the file ---
if (-not $Path) {
  if ($Session) {
    $Path = Join-Path $txDir "$Session.jsonl"
  } elseif (Test-Path $txDir) {
    $latest = Get-ChildItem $txDir -Filter *.jsonl | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest) { $Path = $latest.FullName }
  }
}
if (-not $Path -or -not (Test-Path $Path)) {
  if (-not $Collect) { Write-Output "Transcript file not found. Try -List." }
  return
}
$sid = [System.IO.Path]::GetFileNameWithoutExtension($Path)

# --- parse ---
$lines = Get-Content $Path -Encoding UTF8
$events = New-Object System.Collections.ArrayList
foreach ($l in $lines) {
  if (-not $l.Trim()) { continue }
  try { [void]$events.Add(($l | ConvertFrom-Json)) } catch { }
}

$inTok=0; $outTok=0; $cCreate=0; $cRead=0
$tools = @{}
$firstTs=$null; $lastTs=$null
$turns=0; $sidechain=0; $userMsgs=0
$toolStart = @{}
$toolDur = New-Object System.Collections.ArrayList
$timeline = New-Object System.Collections.ArrayList

function To-Dt($s){ try { [datetimeoffset]::Parse($s) } catch { $null } }

foreach ($e in $events) {
  $ts = $e.timestamp
  if ($ts) { if (-not $firstTs){$firstTs=$ts}; $lastTs=$ts }
  if ($e.isSidechain) { $sidechain++ }
  $m = $e.message
  if (-not $m) { continue }

  if ($m.usage) {
    $u = $m.usage
    $inTok   += [int]$u.input_tokens
    $outTok  += [int]$u.output_tokens
    $cCreate += [int]$u.cache_creation_input_tokens
    $cRead   += [int]$u.cache_read_input_tokens
  }
  if ($e.type -eq 'assistant' -and $m.stop_reason) { $turns++ }
  if ($e.type -eq 'user') { $userMsgs++ }

  if ($m.content) {
    foreach ($c in $m.content) {
      switch ($c.type) {
        'tool_use' {
          $tools[$c.name]++
          if ($c.id) { $toolStart[$c.id] = @{ name=$c.name; ts=$ts } }
          $argSummary = ''
          if ($c.input) {
            $k = ($c.input.PSObject.Properties | Select-Object -First 1)
            if ($k) { $argSummary = "$($k.Name)=$([string]$k.Value)"; if($argSummary.Length -gt 60){$argSummary=$argSummary.Substring(0,60)+'...'} }
          }
          [void]$timeline.Add([pscustomobject]@{ ts=$ts; kind='TOOL'; detail="$($c.name)($argSummary)"; out=[int]$m.usage.output_tokens; side=[bool]$e.isSidechain })
        }
        'tool_result' {
          if ($c.tool_use_id -and $toolStart.ContainsKey($c.tool_use_id)) {
            $s = $toolStart[$c.tool_use_id]
            $d1 = To-Dt $s.ts; $d2 = To-Dt $ts
            if ($d1 -and $d2) {
              [void]$toolDur.Add([pscustomobject]@{ name=$s.name; sec=[math]::Round(($d2-$d1).TotalSeconds,1); at=$s.ts })
            }
          }
        }
        'text' {
          $t = ([string]$c.text).Trim() -replace '\s+',' '
          if ($t.Length -gt 0) { if($t.Length -gt 70){$t=$t.Substring(0,70)+'...'}; [void]$timeline.Add([pscustomobject]@{ ts=$ts; kind='TEXT'; detail=$t; out=[int]$m.usage.output_tokens; side=[bool]$e.isSidechain }) }
        }
        'thinking' {
          [void]$timeline.Add([pscustomobject]@{ ts=$ts; kind='THINK'; detail='(reasoning)'; out=0; side=[bool]$e.isSidechain })
        }
      }
    }
  }
}

$d1 = To-Dt $firstTs; $d2 = To-Dt $lastTs
$elapsed = if ($d1 -and $d2) { '{0:hh\:mm\:ss}' -f ($d2-$d1) } else { '?' }
$toolTotal = 0; $tools.Values | ForEach-Object { $toolTotal += $_ }
$sumTok = $inTok+$outTok+$cCreate+$cRead

# --- build report lines (captured via array subexpression; no helper-scope pitfalls) ---
$bar = ('=' * 64)
$RPT = @(
  $bar
  "CLAUDE CODE SESSION TRACE"
  $bar
  ("Session   : {0}" -f $sid)
  ("Generated : {0}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'))
  ("Events    : {0}   Turns(API resp): {1}   User msgs: {2}   Sidechain(subagent) events: {3}" -f $events.Count, $turns, $userMsgs, $sidechain)
  ("Window    : {0}  ->  {1}   (elapsed {2})" -f $firstTs, $lastTs, $elapsed)
  ""
  "-- TOKENS --"
  ("  input            : {0,12:N0}" -f $inTok)
  ("  output           : {0,12:N0}" -f $outTok)
  ("  cache_create     : {0,12:N0}" -f $cCreate)
  ("  cache_read       : {0,12:N0}  (re-read prompt cache, billed ~0.1x)" -f $cRead)
  ("  sum              : {0,12:N0}" -f $sumTok)
  ""
  "-- TOOL CALLS --"
  ($tools.GetEnumerator() | Sort-Object Value -Descending | ForEach-Object { "  {0,-26} {1}" -f $_.Key, $_.Value })
  ""
  ("-- SLOWEST STEPS (top {0}, by tool_use -> tool_result wall-clock gap) --" -f $Top)
  ($toolDur | Sort-Object sec -Descending | Select-Object -First $Top | ForEach-Object { "  {0,8:N1}s  {1,-22} {2}" -f $_.sec, $_.name, $_.at })
  if ($Timeline) {
    ""
    "-- TIMELINE --"
    $prev = $null
    foreach ($row in $timeline) {
      $dd = To-Dt $row.ts
      $delta = ''
      if ($prev -and $dd) { $delta = '{0,6:N1}s' -f ($dd-$prev).TotalSeconds }
      if ($dd) { $prev = $dd }
      $tcol = if ($dd) { $dd.ToString('HH:mm:ss') } else { '--:--:--' }
      $tag = if ($row.side) { 'sub>' } else { '    ' }
      "  {0} {1} {2,8} [{3,-5}] {4}" -f $tcol, $tag, $delta, $row.kind, $row.detail
    }
  }
  $bar
)

# --- emit ---
if ($Collect) {
  if (-not (Test-Path $Collect)) { New-Item -ItemType Directory -Path $Collect -Force | Out-Null }
  $mdPath = Join-Path $Collect "$sid.md"
  $utf8bom = New-Object System.Text.UTF8Encoding($true)
  [System.IO.File]::WriteAllText($mdPath, (($RPT -join "`r`n") + "`r`n"), $utf8bom)

  # upsert one row per session into sessions.csv
  $csv = Join-Path $Collect 'sessions.csv'
  $row = [pscustomobject]@{
    session      = $sid
    updated      = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
    events       = $events.Count
    turns        = $turns
    user_msgs    = $userMsgs
    elapsed      = $elapsed
    input        = $inTok
    output       = $outTok
    cache_create = $cCreate
    cache_read   = $cRead
    sum_tokens   = $sumTok
    tool_calls   = $toolTotal
  }
  $rows = @()
  if (Test-Path $csv) { $rows = @(Import-Csv $csv | Where-Object { $_.session -ne $sid }) }
  $rows += $row
  $rows | Export-Csv -Path $csv -NoTypeInformation -Encoding UTF8
  return
}

$RPT | ForEach-Object { Write-Output $_ }
