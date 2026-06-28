---
description: Show knowledge-base stats and health (counts, orphans, broken links, stubs)
allowed-tools: Bash, Glob, Grep, Read, Edit
---

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
