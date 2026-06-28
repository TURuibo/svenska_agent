---
name: "source-command-import"
description: "Import a svensk-export v1 block (pasted or from inbox/) into the knowledge base with dedup + linking"
---

# source-command-import

Use this skill when the user runs `/import` or asks to run the migrated Claude Code command `import` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

Use the `sv-import` skill to ingest Swedish lookups exported from another chat.

## 1. Resolve the input source

Determine where the export block comes from — in this order:

**A. $ARGUMENTS contains a fenced `svensk-export` block** (the user pasted it directly):
- The block is the input. Parse it per sv-import §2.

**B. $ARGUMENTS looks like a filename** (no newlines; a short string ending in `.md` or containing
no spaces that matches an inbox entry):
- Read `inbox/<argument>` (try `inbox/<argument>.md` if no `.md` extension).
- Extract the `svensk-export` block from that file.

**C. $ARGUMENTS is empty**:
- `Glob inbox/*.md` to list all inbox files.
- `Grep` each one for the pattern ` ```svensk-export` to find which contain export blocks.
- Process all matches found, one at a time.
- If no export blocks are found anywhere, tell the user: no import blocks found in inbox/ — paste
  a `svensk-export v1` block directly or add a file to `inbox/`.

## 2. Parse + enrich

For each resolved block, follow sv-import §2 (parse), §3 (fill gaps using Swedish skills), and
§4a (level check against `profile/level.md`).

## 3. Dedup + store

Follow sv-import §4b and §5:
- **≤ 3 items total**: store inline (create notes + wire links yourself), then update
  `review/schedule.md` (sv-import §6).
- **> 3 items total**: create the `sources/source-<date>-<topic>.md` note first, then spawn
  `sv-librarian` with the enriched lists and the source slug.

## 4. Archive + rebuild

Follow sv-import §8: if the source was an inbox file, move it to the tracked root `imported/` folder
after a successful store, then rebuild both generated sites:
- `powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-kb-site.ps1` (KB viewer + slug manifest)
- `node tools/build-reading-site.js` (Läsning reading data — surfaces the archived scenario/article)

## 5. Give the concise receipt

Output the receipt as specified in sv-import §7 — counts only, no file contents.