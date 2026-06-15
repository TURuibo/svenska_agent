<#
.SYNOPSIS
  Protection layer for headless `claude -p` runs used by the daily scripts, so a
  hung/idle model stream can NEVER leave a leftover claude.exe (or its spawned
  sub-agent children) running forever.

  Design is deliberately surgical — it only ever touches processes THIS layer
  launched, so an interactive Claude Code session is never at risk:

    Invoke-ClaudeHeadless   Run one `claude -p` with a hard wall-clock timeout.
                            On overrun, taskkill /T /F the whole process tree
                            (parent + spawned sub-agents). Records the PID while
                            running and clears it on exit. Returns exit/timeout/output.

    Clear-HeadlessLeftovers Reap claude processes a PRIOR run launched but never
                            cleaned (e.g. the script itself was killed mid-run, so
                            the timeout never fired). Reads the pidfile written by
                            Invoke-ClaudeHeadless — never guesses, never scans by
                            name, so interactive sessions are untouched. A grace
                            window protects a just-launched sibling job.

  NOTE: this does NOT try to identify "headless" processes by command line — that
  is unreliable (Win32_Process.CommandLine is often empty) and could misjudge a
  live interactive session. We only ever kill PIDs we recorded ourselves.

  ASCII-only on purpose: no UTF-8 BOM required for PS 5.1.
#>

Set-StrictMode -Off

$script:HeadlessPidFile = Join-Path $env:TEMP 'svensk-headless-pids.txt'

function Clear-HeadlessLeftovers {
  # Kill any still-alive PID we recorded in a previous run and never cleaned.
  # Safe: only PIDs written by Invoke-ClaudeHeadless are ever considered.
  param([int]$GraceMinutes = 5)
  try {
    if (-not (Test-Path $script:HeadlessPidFile)) { return }
    $cutoff = (Get-Date).AddMinutes(-1 * $GraceMinutes)
    $survivors = New-Object System.Collections.Generic.List[string]
    foreach ($line in (Get-Content $script:HeadlessPidFile -ErrorAction SilentlyContinue)) {
      $pidNum = 0
      if (-not [int]::TryParse($line.Trim(), [ref]$pidNum)) { continue }
      $p = Get-Process -Id $pidNum -ErrorAction SilentlyContinue
      if (-not $p) { continue }                                  # already gone — drop it
      try { if ($p.StartTime -gt $cutoff) { $survivors.Add("$pidNum"); continue } } catch {}  # too new — a live sibling
      try { & taskkill /PID $pidNum /T /F 2>$null | Out-Null } catch {}
    }
    if ($survivors.Count -gt 0) { Set-Content -Path $script:HeadlessPidFile -Value $survivors }
    else { Remove-Item $script:HeadlessPidFile -Force -ErrorAction SilentlyContinue }
  } catch {
    # cleanup must never break the caller
  }
}

function Remove-HeadlessPid {
  param([int]$TargetPid)   # NOT $Pid — that collides with the read-only automatic $PID
  try {
    if (-not (Test-Path $script:HeadlessPidFile)) { return }
    $keep = Get-Content $script:HeadlessPidFile -ErrorAction SilentlyContinue |
              Where-Object { $_.Trim() -ne "$TargetPid" -and $_.Trim() -ne '' }
    if ($keep) { Set-Content -Path $script:HeadlessPidFile -Value $keep }
    else { Remove-Item $script:HeadlessPidFile -Force -ErrorAction SilentlyContinue }
  } catch {}
}

function Invoke-ClaudeHeadless {
  param(
    [Parameter(Mandatory = $true)][string]$Claude,
    [Parameter(Mandatory = $true)][string]$Prompt,
    [string]$Model = 'claude-opus-4-8',
    [string]$AllowedTools = 'Read,Glob,Grep,Edit,Write',
    [int]$TimeoutMinutes = 15
  )

  # Launch claude via cmd.exe using .NET Process (reliable ExitCode + stream capture).
  # cmd runs `claude ... <nul` so claude's stdin is NUL (never blocks); cmd's stdout/err
  # (inherited by claude) are redirected to async readers. We hold the cmd PID for the
  # timeout watchdog and kill the WHOLE tree (cmd -> claude -> sub-agents) on overrun.
  $inner = '"' + $Claude + '" -p "' + $Prompt + '" --model ' + $Model + ' --allowedTools ' + $AllowedTools + ' <nul'

  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName               = $env:ComSpec       # cmd.exe
  $psi.Arguments              = '/c "' + $inner + '"'
  $psi.UseShellExecute        = $false
  $psi.CreateNoWindow         = $true
  $psi.RedirectStandardOutput = $true
  $psi.RedirectStandardError  = $true

  $timedOut = $false
  $exit = 1
  $out  = ''
  $proc = $null
  try {
    $proc = [System.Diagnostics.Process]::Start($psi)
    try { Add-Content -Path $script:HeadlessPidFile -Value "$($proc.Id)" } catch {}
    $outTask = $proc.StandardOutput.ReadToEndAsync()   # async read avoids pipe-buffer deadlock
    $errTask = $proc.StandardError.ReadToEndAsync()

    if ($proc.WaitForExit($TimeoutMinutes * 60 * 1000)) {
      $exit = $proc.ExitCode                            # cmd /c propagates claude's exit code
      try { $out = $outTask.Result + $errTask.Result } catch {}
    } else {
      try { & taskkill /PID $proc.Id /T /F 2>$null | Out-Null } catch {}
      $timedOut = $true
      $exit = 124
      try { $out = $outTask.Result + $errTask.Result } catch {}
      $out += "`n[Invoke-ClaudeHeadless] TIMEOUT after $TimeoutMinutes min - process tree killed."
    }
  } catch {
    $exit = 1
    $out  = "[Invoke-ClaudeHeadless] launch error: $($_.Exception.Message)"
  } finally {
    if ($proc) { Remove-HeadlessPid -TargetPid $proc.Id }
  }

  return [pscustomobject]@{ ExitCode = $exit; TimedOut = $timedOut; Output = $out }
}
