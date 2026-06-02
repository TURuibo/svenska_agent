---
name: sv-knowledge-base
description: "Storage and linking rules for the local Swedish markdown knowledge base in this project. Use this skill whenever you are about to save, update, dedup, slug, or link any Swedish word, phrase, sentence, grammar point, topic, or source into knowledge_base/. It defines the file schema, filename/slug rules, the deduplication procedure, and the Obsidian-style [[wikilink]] relationships to maintain. Trigger it together with the swedish-* skills: those decide what to extract; this decides how to store it. Also use it when asked about KB health, broken links, orphan notes, or the index."
---

# sv-knowledge-base — 本地知识库存储规则

This skill governs the markdown knowledge base under `knowledge_base/`. The Swedish content skills
(`swedish-dictionary`, `swedish-phrases`, `swedish-grammar`, `swedish-text-analysis`) decide **what** to
extract and how deep. **This skill decides how it is slugged, deduplicated, structured, and linked.**

No database. Plain markdown. Links are Obsidian `[[wikilinks]]`. Templates live in
`knowledge_base/_templates/`.

## 1. 文件类型与路径 (Note types & paths)

| type | path | one note per |
|------|------|--------------|
| word | `knowledge_base/words/<slug>.md` | base form (grundform) of a word |
| phrase | `knowledge_base/phrases/<slug>.md` | phrase / idiom / partikelverb |
| sentence | `knowledge_base/sentences/<slug>.md` | a noteworthy sentence |
| grammar | `knowledge_base/grammar/<slug>.md` | a grammar point |
| topic | `knowledge_base/topics/<slug>.md` | a semantic field / synonym group |
| source | `knowledge_base/sources/<slug>.md` | an analyzed text or image |

Always start from the matching template in `_templates/`. Fill the YAML frontmatter completely; leave a
field empty (`""` / `[]`) rather than deleting it.

## 2. Slug 规则 (Filename slugs)

The slug is the filename **and** the `[[wikilink]]` target. Make it deterministic so dedup works.

- **word**: the lemma, lowercased, spaces→`-`. Keep Swedish letters `å ä ö` as-is.
  `arbeta` → `arbeta.md`; `stå ut` is a phrase, not a word.
- **phrase**: lowercased phrase, spaces→`-`, drop trailing punctuation.
  `ta det lugnt` → `ta-det-lugnt.md`; `på grund av` → `på-grund-av.md`.
- **grammar**: Swedish term, lowercased, spaces→`-`, **prefix `grammar-`**.
  V2 word order → `grammar-v2-ordfoljd.md`; bisats BIFF → `grammar-bisats-biff.md`.
- **topic**: theme, lowercased, **prefix `topic-`**. Furniture → `topic-mobler.md`;
  synonyms of glad → `topic-synonym-glad.md`.
- **sentence**: first 4–6 significant words, lowercased, spaces→`-`, **prefix `sent-`**, truncate ~50 chars.
  If a collision exists, append `-2`, `-3`. `Jag har inte sett filmen än.` → `sent-jag-har-inte-sett-filmen.md`.
- **source**: `source-YYYY-MM-DD-<short-topic>.md`.

When you write a `[[wikilink]]`, use the slug **without** the `.md` extension and without the folder,
e.g. `[[arbeta]]`, `[[grammar-v2-ordfoljd]]`, `[[topic-mobler]]`, `[[sent-jag-har-inte-sett-filmen]]`.

## 3. 查重流程 (Dedup — do this BEFORE writing)

1. Compute the slug (§2).
2. `Glob` the expected path. If a file exists → **duplicate**: do not recreate.
   - Answer the user from the existing note.
   - Enrich it **only** if the new context adds a genuinely new sense, collocation, example sentence,
     or link that's missing. Append; don't rewrite wholesale.
3. For phrases/sentences (fuzzy slugs), also `Grep` the folder for the key lemma before creating, to
   catch near-duplicates with a slightly different slug.
4. Only if nothing matches → copy the template and create the note.

Tell the user the outcome: `📁 已录入: …` (new) or `📁 已存在: … (未重复录入)` (dup).

## 4. 链接关系 (Links to maintain — bidirectional)

Whenever you create or touch a note, wire up **both directions**:

| relationship | on side A | on side B |
|--------------|-----------|-----------|
| 句子 ↔ 单词 | sentence `words:` + body link | word `sentences:` + body link |
| 句子 ↔ 词组 | sentence `phrases:` | phrase `sentences:` |
| 句子 ↔ 语法 | sentence `grammar:` | grammar `examples:` |
| 词组 ↔ head word | phrase `head_words:` | word body "appears in phrase" |
| 词组 ↔ 语法 | phrase `grammar:` | grammar `examples:` (if a full sentence) |
| 单词 ↔ 单词 (同义) | word A `synonyms:` | word B `synonyms:` |
| 单词 ↔ 单词 (反义) | word A `antonyms:` | word B `antonyms:` |
| 单词 ↔ 词族 | word A `family:` | each family member `family:` |
| 单词/词组 ↔ 主题 | note `topics:` | topic note `members:` |

**Topic links are how you connect words "in the same context"** (e.g. all furniture, all kitchen verbs,
all synonyms of a feeling). When you add the 3rd+ word of an obvious semantic field, create or update a
`topic-*` note and link all members to it. Synonym groups can be a `topic-synonym-*` note AND direct
`synonyms:` links.

If a `[[wikilink]]` target doesn't exist yet, still write the link — it marks a note worth creating
later. The `/kb` command and the librarian surface these as "stubs to create".

## 5. Frontmatter 学习字段 (Learning metadata — every reviewable note)

`words`, `phrases`, `sentences`, `grammar` notes carry SRS fields used by `sv-review`:
`known`, `reviewed`, `review_count`, `ease` (default 2.5), `interval` (days, default 0).
Set `created:` to today's absolute date. Do not invent `reviewed:` — leave empty until first review.

## 6. 索引 (Index)

`knowledge_base/index.md` is the MOC. After a batch import (or when asked `/kb`), refresh its counts and
the "recently added" list. A SessionStart hook also prints live counts, so the index need not be perfect
in real time — keep it human-readable, not machine-critical.

## 7. 单条 vs 批量 (Single item vs batch)

- **Single** word/phrase/sentence/grammar from a direct question → store inline yourself (1–3 files).
- **Whole text or image** (many items) → after the `swedish-text-analysis` digest, spawn the
  `sv-librarian` subagent with the extracted lists so it can create/link everything without cluttering
  the main conversation. Always create the `source-*` note first and pass its slug to the librarian.
