---
name: sv-capture
description: >
  Lightweight Swedish lookup + silent recorder for mobile / quick capture. Use this skill whenever
  the user looks up a Swedish word / phrase / sentence, asks a grammar question, or — most importantly —
  sends a PHOTO/IMAGE/screenshot containing Swedish and just wants a quick answer plus capture. It acts
  as a Swedish tutor (concise 中文+English answer with ordklass, forms, examples) AND silently writes a
  `svensk-export v1` block to inbox/capture-<date>-<slug>.md so the desktop side can auto-import it later.
  It does NOT write into knowledge_base/. This is the CC port of the EXPORT_PROTOCOL chat primer: instead
  of waiting for a "导出" command, every capture is dropped straight into inbox/. Prefer this on mobile /
  on the go; use /learn when you want the full KB entry written immediately on desktop.
---

# sv-capture — 手机轻量查词 + 静默记录技能

这是你在 `EXPORT_PROTOCOL.md` Part B 里那段"两个角色"的 primer 在 Claude Code 里的对应实现。
区别：网页聊天里要等你说"导出"才吐 `svensk-export` 块；在 CC 里，**每次查完直接把块写进 `inbox/`**，
电脑端会自动后台 `/import`（见 `CLAUDE.md` §4.3）。

读完 `EXPORT_PROTOCOL.md` Part A（导出块格式）再执行。

---

## 0. 适用边界 (When this vs. others)

- **本技能 (sv-capture / `/capture`)** — 手机端、走神查词、拍照速查。给精简答案 + 写 `inbox/`，**不碰 `knowledge_base/`**。
- **`/learn`** — 电脑端想立刻完整录入 KB（多文件 + 双向链接）时用。
- 两者最终都汇入同一个 KB：capture 写的 `inbox/` 文件，由电脑端 `/import` → `sv-import` → `sv-librarian` 正式录入。

如果用户明确说"完整录入 / 直接进 KB / /learn"，不要用本技能。

---

## 1. 角色 1 — 瑞典语助教 (concise chat answer)

用现有 swedish 技能分析，按输入类型调用：
- 单词 → `swedish-dictionary`
- 词组 / partikelverb / 习语 → `swedish-phrases`
- 句子 / 语法问题 → `swedish-grammar`（+ dictionary/phrases 补生词）
- 图片 / 整段文字 → `swedish-text-analysis`

聊天回复保持精简（手机屏幕友好）。每个词至少给：
- 词性 (ordklass)、🇨🇳 中文、English
- 基本变形（名词复数/定形、动词三时态、形容词比较级等）
- **≥3 个例句**（🇸🇪 + 🇨🇳）

风格：简体中文为主 + 英文对照；语法术语保留瑞典语（presens、bisats、partikelverb …）；鼓励式、简明。

### 图片输入 (photo)

先**转写**图片里的瑞典语，放进代码块给用户确认（per `swedish-text-analysis`），再分析、再写 inbox。
转写不确定的地方标 `[?]`。

---

## 2. 角色 2 — 静默记录员 (write the svensk-export block to inbox/)

**这是与网页 primer 最大的不同：不积累、不等"导出"——每次查完立刻落盘到 `inbox/`。**

### 2a. 计算文件名

```
inbox/capture-<date>-<slug>.md
```
- `<date>` = 今天的绝对日期 `YYYY-MM-DD`。
- `<slug>` = 这次 capture 的 ascii kebab-case 短标识：
  - 单条词/词组 → 用该 lemma/短语（å/ä → a，ö → o，空格 → `-`，全小写）。
  - 图片/整段/多条 → 用主题 1–3 词，或 `photo`（如 `inbox/capture-2026-06-15-photo.md`）。
- 若同名文件已存在（同一天同 slug），在 slug 末尾加 `-2`、`-3` … 避免覆盖。**绝不覆盖已有 inbox 文件。**

### 2b. 文件内容（两部分，跟 scenario 文件同构）

````
# 🇸🇪 Capture — <简短标题> (<date>)

**来源 (source):** <photo / 手动查词 / 主题>
**录入项:** <n> 词 · <n> 词组 · <n> 句子 · <n> 语法点

> 这是手机端速记，尚未进入 knowledge_base/。电脑端 /import 后正式录入。

---

## 速查摘要

<把聊天里给用户的精简答案原样或略写放这里，方便日后回看>

---

```svensk-export v1
date: <date>
source: capture — <主题/photo>
words:
- <lemma> | <ordklass> | <中文> | <英文> | <备注(可选)>
phrases:
- <短语> | <类型> | <中文> | <英文>
sentences:
- <瑞典语句子> | <中文>
grammar:
- <语法名> | <中文> | <英文>
```
````

### 2c. 导出块规则（严格遵照 `EXPORT_PROTOCOL.md` Part A）

1. **words 一律 grundform**（动词不定式、名词单数不定形、形容词原级）。
2. **块内去重** — 同一个词/短语/句子/语法只列一次。
3. **空 section 省略** — 没有词组就不写 `phrases:`。
4. 字段用 ` | ` 分隔；备注里若需分隔用 `;` 而非 `|`。
5. 图片/整段：`sentences:` 尽量收录每个有意义的句子，便于日后建 `sentences/` 链接。
6. 已尽量填全 ordklass / 中 / 英 / 变形——`/import` 会补缺，但手机端能填的就填好，减少电脑端负担。

---

## 3. 聊天回执 (chat receipt)

写完 inbox 文件后，在聊天结尾给一行指针（不要把整块再贴一遍）：

```
📁 已写入 inbox/capture-<date>-<slug>.md  (词 n · 词组 n · 句子 n · 语法 n)
⏭ 电脑端开 CC 会自动后台导入；也可手动 /import capture-<date>-<slug>.md
```

---

## 4. 硬规则 (Rules)

- **不写 `knowledge_base/`** — 本技能只产出 `inbox/` 文件。正式录入只能走 `/import` 管道。
- **不主动问"要录入吗"** — 直接查、直接写 inbox（黄金法则 §0 rule 1 的精神）。
- **不覆盖** 已存在的 inbox 文件（slug 加后缀）。
- 文件名与块内字面写瑞典语字母 å ä ö（块内文本），但 slug/文件名用 ascii 转写。
- 查重交给 import 阶段——本技能无需扫 KB。
