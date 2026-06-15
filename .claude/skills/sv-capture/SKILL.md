---
name: sv-capture
description: >
  Lightweight Swedish lookup + silent recorder for mobile / quick capture. Use this skill whenever
  the user looks up a Swedish word / phrase / sentence, asks a grammar question, or — most importantly —
  sends a PHOTO/IMAGE/screenshot containing Swedish and just wants a quick answer plus capture. It acts
  as a Swedish tutor (concise 中文+English answer with ordklass, forms, examples) AND silently appends
  the items to a single per-day file inbox/capture-<date>.md (one file per day, accumulating — never one
  file per word) so the desktop side can auto-import it later.
  It does NOT write into knowledge_base/. This is the CC port of the EXPORT_PROTOCOL chat primer: instead
  of waiting for a "导出" command, every capture is accumulated straight into the day's inbox file. Prefer this on mobile /
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

## 2. 角色 2 — 静默记录员 (accumulate into one daily inbox file)

**与网页 primer 的关系：网页版攒一整场对话再"导出"一次；CC 这里改为攒到「当天一个文件」并在每次查完即时追加。**
**一天一个文件 `inbox/capture-<date>.md`——无论你那天查多少个词、问几个语法、拍几张照，全部追加进这同一个文件。**

> ⚠️ 不要"一个词一个文件"。同一天的所有 capture 都写进 `inbox/capture-<date>.md`。
> （`inbox/` 已被 `.gitignore`，所以这个文件的反复追加**不产生任何 git commit**；真正进 git 的是
> 电脑端 `/import` 之后的 KB 变更——一天累加成一份 → 一次导入一批 → 一个干净 commit。）

### 2a. 文件路径（按天）

```
inbox/capture-<date>.md      # <date> = 今天的绝对日期 YYYY-MM-DD，如 inbox/capture-2026-06-15.md
```
**绝不**在文件名里放 lemma/主题，**绝不**为单个词单独建文件。

### 2b. 写入流程：不存在则新建，存在则追加

**先 `Read`（或 `Glob`）`inbox/capture-<date>.md`：**

**A. 文件不存在 → 新建**，用下面的两部分布局：

````
# 🇸🇪 Capture — <date>

**来源 (source):** capture（手机端速记，当天累加）
**录入项:** <n> 词 · <n> 词组 · <n> 句子 · <n> 语法点   <!-- 每次追加后更新这行计数 -->

> 这是手机端速记，尚未进入 knowledge_base/。电脑端 /import 后正式录入。

---

## 速查摘要

### <时刻/序号> <本次查的词/主题>
<把聊天里给用户的精简答案略写放这里，方便日后回看>

---

```svensk-export v1
date: <date>
source: capture — <date> 手机速记
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

**B. 文件已存在 → 追加（不重写、不覆盖整文件）：**
1. 在 `## 速查摘要` 下面**追加**一个新的 `### <本次查的词/主题>` 小节（用 `Edit` 插入）。
2. 把本次新条目**合并进已有的 `svensk-export v1` 块**对应的 section：
   - 用 `Edit` 在 `words:`（/`phrases:`/`sentences:`/`grammar:`）段尾插入新的 `- …` 行。
   - 若该 section 原本不存在（比如第一次出现词组），在块内合适位置新增该 section 标题再加行。
3. **更新顶部"录入项"计数行**。
4. **不要新建第二个 `svensk-export` 块**——整个文件始终只有一个块。

### 2c. 导出块规则（严格遵照 `EXPORT_PROTOCOL.md` Part A）

1. **words 一律 grundform**（动词不定式、名词单数不定形、形容词原级）。
2. **块内去重（含跨次追加）** — 追加前扫一遍块内已有行；同一个词/短语/句子/语法当天只列一次。
   若用户当天重复查同一个词，不再加行（可在聊天里提示"今天已记过"）。
3. **空 section 省略** — 没有词组就不写 `phrases:`。
4. 字段用 ` | ` 分隔；备注里若需分隔用 `;` 而非 `|`。
5. 图片/整段：`sentences:` 尽量收录每个有意义的句子，便于日后建 `sentences/` 链接。
6. 已尽量填全 ordklass / 中 / 英 / 变形——`/import` 会补缺，但手机端能填的就填好，减少电脑端负担。

---

## 3. 聊天回执 (chat receipt)

每次追加后，在聊天结尾给一行指针（不要把整块再贴一遍）：

```
📁 已追加到 inbox/capture-<date>.md  (今日累计: 词 n · 词组 n · 句子 n · 语法 n)
⏭ 电脑端开 CC 会自动后台导入；也可手动 /import capture-<date>.md
```

---

## 4. 硬规则 (Rules)

- **不写 `knowledge_base/`** — 本技能只产出 `inbox/` 文件。正式录入只能走 `/import` 管道。
- **不主动问"要录入吗"** — 直接查、直接追加到当天文件（黄金法则 §0 rule 1 的精神）。
- **一天一个文件、追加不覆盖** — 始终写 `inbox/capture-<date>.md`；已存在就 `Edit` 追加，绝不新建第二份、绝不重写整文件、绝不一词一文件。
- 块内文本字面写瑞典语字母 å ä ö；文件名只有日期，无需转写。
- 查重交给 import 阶段——本技能无需扫 KB。
