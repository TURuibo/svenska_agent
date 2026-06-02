---
name: sv-review
description: Spaced-repetition review and consolidation workflow over the local Swedish knowledge base. Use this skill whenever the user wants to review, practice, drill, consolidate, or be quizzed on previously stored Swedish (words, phrases, sentences, grammar), or runs /review. It selects due items from knowledge_base/ using SM-2-style metadata in review/schedule.md, quizzes the user, grades answers, and updates the review metadata. Do NOT use it to look up new words (that's the swedish-* skills) — use it to reinforce what's already in the knowledge base.
---

# sv-review — 复习与巩固

Reinforce what's already stored. No new lookups — pull from `knowledge_base/`.

## 1. 选题 (Select due items)

1. Read `review/schedule.md` and scan note frontmatter (`reviewed`, `interval`, `ease`, `known`).
2. An item is **due** if: `known: false` AND ( `reviewed` is empty OR `reviewed + interval days <= today` ).
3. Prioritize: never-reviewed first, then most overdue, then weak spots named in `profile/level.md`.
4. Default session size: **10 items**, mixed types (≈5 words, 2 phrases, 2 sentences, 1 grammar) unless
   the user asks for a specific type, count, or topic (e.g. "复习家具类" → pull `topic-mobler` members).

## 2. 测验形式 (Quiz formats — vary them)

- **词 → 中文** and **中文 → 词** (recall both directions).
- **变形填空**: give the lemma + a sentence frame, ask for the right form (presens/preteritum/bestämd…).
- **词组**: give the situation, ask for the phrase; or give the phrase, ask the meaning + register.
- **句子**: cloze (blank a key word), or ask to translate 中文→瑞典语, then compare to the stored sentence.
- **语法**: show a sentence, ask which rule applies / why the word order is so; or give a ❌ sentence to fix.

Ask **one item at a time**. Wait for the answer. Then reveal the stored answer and grade.

## 3. 评分与更新 (Grade & update — SM-2 lite)

After each item, grade the recall quality `q` 0–5 (0 = blank, 3 = correct but hard, 5 = instant):
- `q < 3` (失败): `interval = 1`, `ease = max(1.3, ease - 0.2)`, keep it for re-quiz this session.
- `q >= 3` (成功):
  - if `review_count == 0` → `interval = 1`
  - elif `review_count == 1` → `interval = 6`
  - else → `interval = round(interval * ease)`
  - `ease = ease + (0.1 - (5-q)*(0.08 + (5-q)*0.02))`, clamped `>= 1.3`.
- Always: `review_count += 1`, `reviewed = today (absolute date)`.
- If the user nails an item several sessions running and says they know it, set `known: true` and tell the
  assessor to record it (or update `profile/level.md` directly).

Update **both** the note's frontmatter and the row in `review/schedule.md`.

## 4. 巩固 (Consolidation, not just testing)

- When an item is missed, don't just mark it wrong — give a 1–2 line refresher and a fresh example, and
  point to the full note (`📁 knowledge_base/…`).
- Surface **links**: "这个词和 [[…]] 是同义词，一起记" — use the KB's relationships to reinforce clusters.
- Offer a themed review when several due items share a `topic-*`.

## 5. 收尾 (Wrap up)

End with a short scoreboard: how many correct, which items to focus on next, when the next items are due.
Keep the chat concise; the durable state is in the notes + `review/schedule.md`.
