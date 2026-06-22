---
name: sv-import
description: >
  Batch-importer for Swedish lookups accumulated in other chats and exported as a `svensk-export v1`
  block. Trigger this skill whenever: the user pastes a fenced ```svensk-export block into the chat;
  the user runs /import (with or without an argument); the user says they want to "import" or "ingest"
  lookups from another chat; or an inbox/ file is identified as containing a svensk-export block.
  This skill parses the block, resolves missing fields using the Swedish skills, deduplicates against
  the live KB, checks the learner profile, routes small batches inline and large batches to sv-librarian,
  and returns a concise receipt.
---

# sv-import — 跨聊天导入技能

Read `CLAUDE.md` (golden rules §0, dedup §3, playbook §4) and
`.claude/skills/sv-knowledge-base/SKILL.md` (storage §1–§7) before running any import.
This skill is the bridge between the export format and those two specs.

---

## 1. 识别输入 (Recognising the input)

### From $ARGUMENTS / pasted text

If the user pasted content containing a fenced block with the language tag `svensk-export`, that IS
the export block to import.

Trigger pattern (flexible — the block may have version tag or not):

```
```svensk-export[ v1]
...
```
```

### From an inbox file

If the argument looks like a filename (no newlines, ends with `.md` or is a bare name), read
`inbox/<argument>` (or `inbox/<argument>.md` if no extension). Scan its content for a
`svensk-export` block.

### Scanning inbox/

If $ARGUMENTS is empty, `Glob inbox/*.md` and `Grep` each file for ` ```svensk-export`. Process all
matches found.

---

## 2. 解析规则 (Parsing the block)

**⚠️ 只处理 fenced block 内部内容。** inbox 文件中 `svensk-export` 围栏之外的所有文本（复习表、
教学注释、标题、人读材料等）一律忽略。不得从围栏外部提取词/句/语法传给 librarian。如果围栏块内
无 `sentences:` 段，则 sentences=0，即使文件其他部分出现了完整瑞典语句子也不导入。

Split the block body into:
- Header lines: `date:` and `source:` (single values, optional).
- Section markers: `words:`, `phrases:`, `sentences:`, `grammar:`.
- Item lines: lines starting with `- ` under each section marker.

### Pipe-split item lines

**words** (fields 1–5, all pipe-separated):
1. `lemma` — required; must be grundform (base form).
2. `ordklass` — e.g. `substantiv en`, `verb v.1`, `adjektiv`; may be empty.
3. `zh` — Chinese translation; may be empty.
4. `en` — English translation; may be empty.
5. `notes` — optional extra (forms, collocations, etc.).

**phrases** (fields 1–4):
1. `phrase` — the full phrase in canonical form.
2. `category` — type label (e.g. `partikelverb`, `习语`, `动词搭配`); may be empty.
3. `zh` — may be empty.
4. `en` — may be empty.

**sentences** (fields 1–2):
1. `swedish` — the Swedish sentence.
2. `zh` — Chinese translation; may be empty.

**grammar** (fields 1–3):
1. `name` — Swedish grammar term, lowercased.
2. `zh` — Chinese label; may be empty.
3. `en` — English label; may be empty.

Strip leading/trailing whitespace from every field. Ignore blank lines and lines not starting with `- `.

### Intra-block dedup

Before hitting the KB, deduplicate within the parsed lists:
- Words: same lemma → keep the richer entry (more fields filled).
- Phrases: same phrase text → keep first occurrence.
- Sentences: same Swedish text → keep first.
- Grammar: same name → keep first.

### Defaults for missing header fields

- `date` missing → use today's absolute date (format `YYYY-MM-DD`).
- `source` missing → `"cross-chat import"`.

---

## 3. 补全残缺字段 (Fill gaps before storing)

**Do NOT store a half-empty note.** If a word line is missing `ordklass`, `zh`, `en`, or basic
inflected forms — use `swedish-dictionary` to look it up fully before creating the note.
Similarly:
- Phrase missing `category` / `zh` / `en` → use `swedish-phrases`.
- Grammar missing `zh` / `en` → use `swedish-grammar`.
- Sentence missing `zh` → translate inline.

Apply this enrichment step per-item, only for items that actually need it. This keeps the KB at the
same quality standard as a direct `/learn` lookup.

---

## 4. 查重 + 水平检查 (Dedup + level check per item)

For each item, before creating anything:

### 4a. Check learner profile

Read `profile/level.md`. If the word/phrase appears in the known vocabulary list or its KB note has
`known: true` — skip it entirely. Report: `KNOWN-skipped: [lemma]`.

### 4b. Dedup against the KB (sv-knowledge-base §3)

**Step 0 — load slug manifest (fast path):**
Read `knowledge_base/_index/slugs.json` ONCE at the start of the import. This file is generated
by `tools/build-kb-site.js` and lists every existing slug grouped by type. Load it into memory and
use it to check every item's slug without additional Glob/Grep calls.

If `slugs.json` does not exist (manifest not yet generated), fall back to the per-item path below.

**Per-item check:**
1. Compute the slug (per sv-knowledge-base §2 rules):
   - word → slug = lemma (lowercased, spaces→`-`)
   - phrase → slug = lowercased phrase, spaces→`-`
   - sentence → slug = `sent-` + first 4–6 significant words
   - grammar → slug = `grammar-` + term
2. Check the slug against the in-memory manifest. If found → **DUP**.
3. For phrases and sentences only (fuzzy slugs): if NOT found in manifest, also `Grep` the folder
   for key words as a near-duplicate guard.
4. If found (either manifest or Grep) → **DUP**: skip creation. Enrich only if the import adds a
   genuinely new sense, collocation, or example sentence absent from the existing note.
   Report: `DUP-skipped: [slug]`.
5. If not found → proceed to store.

---

## 5. 录入路由 (Routing: inline vs sv-librarian)

### Detect drill imports (skip_examples flag)

Before routing, inspect the export block header for the `kind:` field:
- If `kind: drill` (or the spawn prompt / $ARGUMENTS contains `skip_examples` or `drill`) →
  set **`skip_examples = true`** for this import run.
- The daily adjsubst böjning generator (via `/adjsubst`) always produces `kind: drill` headers —
  these imports must always skip example-sentence generation.

### Small batch (≤ 3 items total across all sections)

Store inline:
- Create each note directly using the matching template from `knowledge_base/_templates/`.
- Wire forward `[[wikilinks]]` per sv-knowledge-base §4 (reverse links derived at build time).
- **Word 例句 (sense-aware count):** for every `words/` note, generate example sentences in the
  `## 例句` section by meaning:
  - 多个不同义项 (multiple distinct senses) → **每个义项至少 1 个例句**，按义项分组标注。
  - 单一义项 / 义项含义相近 (single or near-identical senses) → **至少 3 个例句**。
- If `skip_examples = true`, omit the `## 例句` section entirely (do not generate inline examples).
- Add reviewable notes to `review/schedule.md` with immediate `due:` date.

### Large batch (> 3 items total)

1. **Create the source note first**:
   Slug: `source-<date>-<short-topic>` where `<short-topic>` is a 1–3 word kebab-case summary of
   the `source:` field (e.g. `source-2026-06-02-resor-vocab`).
   Path: `knowledge_base/sources/<slug>.md`
   Frontmatter must include:
   ```yaml
   kind: import
   source_label: "<original source: field value>"
   date: <date>
   words: []      # librarian fills these
   phrases: []
   sentences: []
   grammar: []
   ```
2. **Spawn the `sv-librarian` subagent** with:
   - The source note slug.
   - The fully-enriched (gap-filled), intra-block-deduped item lists.
   - The `date:` to use for `created:` frontmatter.
   - Instruction to add new reviewable notes to `review/schedule.md`.
   - If `skip_examples = true`, explicitly pass: `skip_examples: true` in the spawn prompt so
     the librarian skips generating example sentences for every word note in this batch.
3. Await the librarian's manifest report.

---

## 6. 更新复习计划 (review/schedule.md)

For inline-stored items (small batch), append each new reviewable slug to `review/schedule.md` with:
```
- slug: <slug>
  due: <date>
  ease: 2.5
  interval: 0
```
(Large-batch: the librarian handles this.)

---

## 7. 收据输出 (Chat receipt)

After the import finishes, output a concise receipt in the chat. No file contents — just counts and paths.

Format:
```
📥 导入完成 — <source label>
  NEW:        words=[n]  phrases=[n]  sentences=[n]  grammar=[n]
  DUP-skipped: [slug, slug, …]  (or "none")
  KNOWN-skipped: [lemma, …]  (or "none")
  📁 source: knowledge_base/sources/<slug>.md
  🔗 <total new notes> 新笔记已建链
```

If inbox file(s) were processed, also note the inbox filename. If multiple inbox files were
processed, one receipt block per file.

Follow CLAUDE.md §0 rule 2: concise in chat, full detail in files.

---

## 8. 归档已处理的 inbox 文件 (Archive processed inbox files)

**Only when the source was an inbox file** (not a pasted block): after the items have been
successfully stored, move the file to the **tracked** `imported/` folder at the repo root so it is no
longer counted as "pending" — and, crucially, so its **readable text is preserved in git** and shows up
in the Läsning reading site (`site/reading/`):

```
inbox/<file>.md  →  imported/<file>.md
```

Use PowerShell via Bash (`imported/` exists and is git-tracked):
```
powershell -NoProfile -Command "Move-Item -LiteralPath 'inbox\<file>.md' -Destination 'imported\<file>.md' -Force"
```

Rules:
- Move **after** a successful store, never before.
- Archive to the **root `imported/`** dir (tracked) — NOT `inbox/imported/`. The reading-site builder
  (`tools/build-reading-site.js`) scans `inbox/` (待导入) and `imported/` (已导入); keeping the readable
  scenario/paste file there is how `/scenario` output stays readable as an article after import.
- If a file had **no** `svensk-export` block, leave it in `inbox/` (do not archive).
- A pasted-in block (no source file) has nothing to archive — but you may still drop a readable
  `imported/paste-<date>-<slug>.md` copy if you want it in the reading site.

This keeps `inbox/` showing only un-imported files, which is what the SessionStart hook and the
background `sv-importer` agent use to detect pending work (see CLAUDE.md §4.3).

Per the project memory, rebuild **both** generated sites after any KB write so viewer data stays current:
```
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-kb-site.ps1   # KB viewer + slugs.json
node tools/build-reading-site.js                                              # Läsning reading data
```

> **Remote routine（Claude Code on the web）收尾另见 `CLAUDE.md §4.7`：** 重建后**只提交** `slugs.json`
> （dedup 依赖）+（听力时）`site/listening/listening-data.js`；**不要提交** `site/kb-data.js`、
> `site/reading/reading-data.js` —— GitHub Action 会在 push 到 main 后自动重建并提交这两个，routine
> 一起提交只会和 Action 抢、每次 PR merge 后必冲突。用 `node tools/build-kb-site.js`（remote 无 PowerShell）。
