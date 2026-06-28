---
name: "source-command-learn"
description: "Analyze a Swedish word/phrase/sentence/text/image and store it into the knowledge base"
---

# source-command-learn

Use this skill when the user runs `/learn` or asks to run the migrated Claude Code command `learn` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

The user wants to learn and store: **$ARGUMENTS**
(If they attached an image, analyze the image instead.)

Follow the project playbook in `AGENTS.md` §4 and the storage rules in
`.agents/skills/sv-knowledge-base/SKILL.md`:

1. Decide the input type (word / phrase / sentence / grammar / whole text / image) and apply the matching
   Swedish skill (`swedish-dictionary` / `swedish-phrases` / `swedish-grammar` / `swedish-text-analysis`).
2. Check `profile/level.md` — if it's a `known` word, give a one-line confirmation and stop (no re-store).
3. **Dedup**, then store the full detail into `knowledge_base/` with bidirectional `[[wikilinks]]`.
   - Single item → store inline.
   - Whole text/image → create the `source-*` note, then spawn the `sv-librarian` subagent for the batch.
4. Reply with a **concise chat digest** + a `📁 已录入: <path>` pointer. Do not ask for permission to store.