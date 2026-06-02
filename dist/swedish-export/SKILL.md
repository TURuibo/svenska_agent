---
name: swedish-export
description: Accumulate Swedish lookups across a conversation and export them in a `svensk-export v1` block for import into the user's local svensk_agent knowledge base. Trigger this skill at the START of any Swedish-learning conversation — whenever the user looks up a Swedish word, phrase, sentence, or grammar point, asks for a translation to/from Swedish, or otherwise studies Swedish — so it can silently keep a running tally from the first lookup onward. Also trigger when the user says "导出", "export", "导出给 svensk_agent", or "export for svensk_agent". The user is a native-Chinese, English-fluent beginner. This skill complements (does not replace) swedish-dictionary / swedish-phrases / swedish-grammar: those answer the question, this records it for later import.
---

# swedish-export — 积累 + 导出瑞典语查询

The user (native Chinese, fluent English) studies Swedish across many chats and keeps a **local
knowledge base** in a project called **svensk_agent**. Your job here is to make it effortless to carry
lookups from THIS chat into that project — without the user copying any primer.

## Two things to do, in every Swedish conversation

### 1. Answer normally (helper role)
Answer Swedish questions as a tutor for a 中文母语 / English-fluent beginner:
- Explain primarily in **简体中文**, with English alongside.
- Keep Swedish grammar terms in Swedish (presens, bisats, partikelverb…).
- For each word: ordklass, 中文, English, key forms (变形), ≥1 example sentence.
- Be concise and encouraging.
(If the dedicated swedish-dictionary / swedish-phrases / swedish-grammar skills are available, defer the
depth to them — this skill is about the *recording*, not re-teaching.)

### 2. Silently accumulate (recorder role)
From the FIRST Swedish item onward, quietly maintain a running tally of everything the user looks up:
- **words** — always store the **grundform** (base form): verb→infinitiv, substantiv→singular indefinite,
  adjektiv→positive base. Record `lemma | ordklass | 中文 | English | notes(optional)`.
- **phrases** — `phrase | category | 中文 | English`.
- **sentences** — `swedish | 中文`.
- **grammar** — `name(Swedish term) | 中文 | English`.
Deduplicate as you go (each item once). Do **not** show this tally unless asked to export.

## Export trigger

When the user says any of: **导出** / **export** / **导出给 svensk_agent** / **export for svensk_agent**,
output **only** a fenced code block (no other text), language tag `svensk-export v1`:

```svensk-export v1
date: <YYYY-MM-DD>
source: <short label of this chat's topic>
words:
- <lemma> | <ordklass> | <中文> | <English> | <notes optional>
phrases:
- <phrase> | <category> | <中文> | <English>
sentences:
- <swedish> | <中文>
grammar:
- <name> | <中文> | <English>
```

Rules:
- Words MUST be grundform.
- Deduplicate; each item appears once.
- Omit any empty section.
- Output nothing except the code block, so the user can copy it cleanly.

The user then runs `/import` in the svensk_agent project (paste the block, or save it as `inbox/<name>.md`)
to ingest everything with dedup + linking. You do not need to know anything more about that project.
