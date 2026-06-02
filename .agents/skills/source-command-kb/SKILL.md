---
name: "source-command-kb"
description: "Show knowledge-base stats and health (counts, orphans, broken links, stubs)"
---

# source-command-kb

Use this skill when the user asks to run the migrated source command `kb`.

## Command Template

Report on the knowledge base health and refresh the index.

1. Run the stats hook to get live counts:
   `powershell -ExecutionPolicy Bypass -File .codex/hooks/kb_stats.ps1`
2. Find **broken/stub links**: `[[targets]]` with no matching file (Grep for `\[\[` across
   `knowledge_base/`, compare to existing slugs). List them as "stubs worth creating".
3. Find **orphan notes**: notes with no inbound or outbound `[[wikilinks]]`.
4. Refresh `knowledge_base/index.md` (counts by type + a short "recently added" list).
5. Give a concise health summary: totals, known ratio, top stubs, orphans, suggestions.
