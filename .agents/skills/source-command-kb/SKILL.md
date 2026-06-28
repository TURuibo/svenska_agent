---
name: "source-command-kb"
description: "Show knowledge-base stats and health (counts, orphans, broken links, stubs)"
---

# source-command-kb

Use this skill when the user runs `/kb` or asks to run the migrated Claude Code command `kb` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

Report on the knowledge base health and refresh the index.

1. Get live counts with Bash (Linux/remote — no PowerShell):
   ```bash
   for d in words phrases sentences grammar topics sources; do
     printf '%-10s %s\n' "$d" "$(ls knowledge_base/$d/*.md 2>/dev/null | wc -l)"
   done
   echo "known:     $(grep -rl '^known: true' knowledge_base/words/ 2>/dev/null | wc -l)"
   ```
2. Find **broken/stub links**: `[[targets]]` with no matching file (Grep for `\[\[` across
   `knowledge_base/`, compare to existing slugs). List them as "stubs worth creating".
3. Find **orphan notes**: notes with no inbound or outbound `[[wikilinks]]`.
4. Refresh `knowledge_base/index.md` (counts by type + a short "recently added" list).
5. Give a concise health summary: totals, known ratio, top stubs, orphans, suggestions.