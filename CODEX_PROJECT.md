# Codex / Claude Code Compatibility

This project can be opened directly in both Claude Code and Codex.

## Entry Points

| Client | Reads first | Tool-specific config |
|--------|-------------|----------------------|
| Claude Code | `CLAUDE.md` | `.claude/` |
| Codex | `AGENTS.md` | `.agents/` and `.codex/` |

## Shared Behavior

- Swedish learning rules live in both `CLAUDE.md` and `AGENTS.md`.
- Codex skills live in `.agents/skills/`.
- Claude Code skills live in `.claude/skills/`.
- Both clients use the same durable state: `knowledge_base/`, `profile/level.md`, `review/schedule.md`, and `inbox/`.
- Do not introduce a database; all durable state stays in markdown.

## Codex Setup

- `AGENTS.md` is the Codex project instruction file.
- `.agents/skills/` contains the Swedish skills Codex should discover.
- `.codex/agents/` contains Codex-flavored agent definitions for the librarian, reviewer, and assessor.
- `.codex/config.toml` sets `SVENSK_AGENT=1`.
- `.codex/hooks/` mirrors the Claude Code PowerShell hooks where Codex hook support is available.

## Claude Code Setup

- `CLAUDE.md` remains the Claude Code project instruction file.
- `.claude/skills/`, `.claude/agents/`, `.claude/commands/`, and `.claude/hooks/` remain intact.
- Claude slash commands are still under `.claude/commands/`.

## Maintenance Rules

1. When changing project behavior, update both `CLAUDE.md` and `AGENTS.md`.
2. When changing a Swedish skill, mirror the change between `.claude/skills/` and `.agents/skills/`.
3. Codex references should point to `.agents/skills/`, not `.codex/skills/`.
4. Claude Code references should point to `.claude/skills/`.
5. Keep all absolute hook paths scoped to this project directory.
