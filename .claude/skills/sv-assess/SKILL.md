---
name: sv-assess
description: Assess the learner's current Swedish level and maintain the learner profile. Use this skill whenever the user wants to evaluate their Swedish level, asks "what's my level / 我现在什么水平", runs /assess, or whenever evidence accumulates about what they already know (e.g. they said "this is too easy / I already know this"). It estimates CEFR/SFI level, records known vocabulary and weak spots into profile/level.md, and sets known:true on mastered notes so future lookups can be skipped. Read profile/level.md before any full word lookup to decide whether the learner already knows the word.
---

# sv-assess — 水平评估与档案

Maintain `profile/level.md`: the single source of truth for what Ruibo already knows, so Claude can
**skip full lookups of known words** and focus effort on real gaps.

## 1. 何时更新 (When to assess)

- Explicit: `/assess`, or "评估我的水平 / what's my level".
- Implicit signals to record as they happen (lightweight, no need to rerun a full assessment):
  - user called a word "太简单/我会了" → mark that word `known: true`
    and add to the profile's known list.
  - user repeatedly misses a grammar point → add/strengthen it under 弱点.
  - 🪜 Nivå results arrive through `/ova` (`tools/ova-sync.js`): words he self-rated 「会」 get `known: true`
    and join 已掌握 (tag 「Nivå 自评」); a passed self-test / placement adds a 评估历史 row
    (「Nivå 通关（自测 18/20）」/「Nivå 定级测试通过（19/20）」). These are evidence, not the overall band —
    weigh them in a full assessment, don't copy them into 总体水平 as-is.
  - ✍️ corrected writing lives in `skriva/texter/*.md` (written by `/skriva`): each file has the learner's own
    text, the corrections with an error type per row (`ordföljd`, `verbform`, …) and an `omdome`
    (`klar` / `nästan` / `inte-än` against the SFI D writing requirement). This is the best evidence there is
    for productive skills: error types that recur across texts belong under 弱点.

## 2. 评估方法 (How to assess)

For a full assessment:
1. **Scan the KB**: counts by type and CEFR (`knowledge_base/*/`), `known:true` ratio, which grammar
   points are present.
2. **Optionally probe**: ask 5–8 calibrated questions spanning A1→B2 (a verb conjugation, a bisats word
   order, a partikelverb, a translation) — only if you need signal the KB doesn't already give.
3. **Estimate** an overall CEFR/SFI band, plus sub-skills (vocab breadth, grammar control, phrases).
   Use the ladder in [`levels.md`](levels.md) (SFI A–D → Grund SVA delkurs 1–4 → Gy SVA nivå 1–3,
   with official Godkänt criteria keywords + approximate CEFR) to place the learner and name gaps.
   Its §7 gives vocabulary-size targets per level and §8 the other measures (CAF, LIX, coverage);
   estimate vocab size by stratified sampling of KB words per CEFR band (know / don't know).
   For KB-level coverage (what the KB itself reaches, gaps by level/theme) run
   `python3 tools/vocab-coverage.py` and compare with the baseline in `profile/vocab-analysis.md` §7;
   the prioritised gap lists live in `profile/vocab-gaps.md`.
4. **Be honest and specific** — cite evidence ("能正确用 perfekt 但 bisats 词序常错").

## 3. 写入档案 (Write the profile)

Update `profile/level.md` (overwrite the relevant sections, keep history of estimates as a short log):
- overall band + date,
- **已掌握 (known)**: lemmas/grammar the learner reliably knows — the skip-list,
- **巩固中 (learning)**: in progress,
- **弱点 (weak spots)**: prioritized list to drill,
- **建议 (next steps)**.

Also set `known: true` in the frontmatter of each mastered note.

## 4. 与查词的关系 (Feeding lookups)

Before a full dictionary entry, Claude checks `profile/level.md` 已掌握 + the note's `known` flag.
If known → one-line confirmation only, no full entry, no re-store. This keeps the learner from wading
through words they already own. Keep the 已掌握 list tidy and current so this check stays cheap.
