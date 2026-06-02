---
description: Analyze a Claude Code session trace (steps, tools, tokens, timing) from the JSONL transcript
argument-hint: [--list | --timeline | --top N | <session-id>]
allowed-tools: Bash(powershell:*)
---

Analyze the Claude Code session trace for this project. Arguments: **$ARGUMENTS**

Run the trace analyzer and present the report:

- Default (no args): latest session →
  `powershell -NoProfile -ExecutionPolicy Bypass -File .claude/scripts/trace.ps1`
- `--list` → list available sessions: add `-List`
- `--timeline` → include the full step-by-step timeline: add `-Timeline`
- `--top N` → change slowest-steps count: add `-Top N`
- a bare `<session-id>` → add `-Session <id>`

After running, briefly interpret the output for the user: total tokens (note cache_read is the
re-read prompt cache, billed ~0.1x), tool-call distribution, and the slowest steps.

⚠️ Caveat to mention: the "slowest steps" are measured as wall-clock gaps between a tool's
`tool_use` and its `tool_result`. For interactive tools (Bash awaiting input, AskUserQuestion) this
includes human think-time, not compute. Subagent (`Agent`) gaps DO reflect real compute time.
