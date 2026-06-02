# 🛰️ traces — 会话过程追踪 (Session traces)

This folder **auto-collects** a trace of every Claude Code session in this project, so you can
analyze the process (steps, tools, tokens, timing) without digging into the raw transcript.

## How it's collected

A **Stop hook** (`.claude/hooks/trace_collect.ps1`) fires when the agent finishes a turn. It runs the
shared analyzer (`.claude/scripts/trace.ps1 -Collect traces`) against the current session's JSONL
transcript and writes:

```
traces/
├── <session-id>.md     # full human-readable report per session (refreshed every turn)
└── sessions.csv        # one row per session — cumulative, for cross-session analysis
```

The raw transcript itself lives outside the project at
`~/.claude/projects/<project-hash>/<session-id>.jsonl` — we keep only the compact report here,
not the 1–2 MB raw log.

## What's in a report

- session id, generated time, event/turn/user-msg counts, subagent event count, elapsed window
- **tokens**: input / output / cache_create / cache_read / sum
- **tool calls** ranked by count
- **slowest steps** (tool_use → tool_result wall-clock gap)
- **timeline**: every step (TEXT / THINK / TOOL) with timestamp, Δ, and `sub>` marker for subagent steps

## On-demand analysis

Run `/trace` anytime (doesn't need the hook):

```
/trace               # latest session report in chat
/trace --list        # list sessions
/trace --timeline    # full step-by-step
/trace --top 15      # more slowest steps
/trace <session-id>  # a specific session
```

## ⚠️ Caveat

"Slowest steps" are **wall-clock** gaps. For interactive tools (Bash awaiting input, AskUserQuestion)
this includes human think-time. **Subagent (`Agent`) gaps reflect real compute time.** For precise
per-request compute durations + cost, enable OpenTelemetry (`CLAUDE_CODE_ENABLE_TELEMETRY=1`).

## Cross-session analysis

`sessions.csv` is plain CSV — open in Excel, or:
```powershell
Import-Csv traces/sessions.csv | Sort-Object {[int]$_.sum_tokens} -Descending | Format-Table
```
