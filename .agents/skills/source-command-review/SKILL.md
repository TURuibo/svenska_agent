---
name: "source-command-review"
description: "Start a spaced-repetition review session from the knowledge base"
---

# source-command-review

Use this skill when the user runs `/review` or asks to run the migrated Claude Code command `review` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

Run a review session. Constraints (optional): **$ARGUMENTS**

Use the `sv-review` skill. Spawn the `sv-reviewer` subagent to select due items from `knowledge_base/`
and `review/schedule.md` (respect any type/count/topic in the arguments; default 10 mixed items, skip
`known`). Then quiz the user **one item at a time** in the chat, grade with SM-2-lite, and update each
note's frontmatter + `review/schedule.md`. End with a short scoreboard and the next due date.
Reinforce links between related items (synonyms, same topic) as you go.