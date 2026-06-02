---
description: Import a svensk-export v1 block (pasted or from inbox/) into the knowledge base with dedup + linking
argument-hint: "[粘贴 svensk-export 块 | inbox 文件名 | 留空=扫描 inbox/]"
allowed-tools: Read, Glob, Grep, Edit, Write, Agent(sv-librarian)
---

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

## 4. Give the concise receipt

Output the receipt as specified in sv-import §7 — counts only, no file contents.
