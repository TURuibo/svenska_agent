---
description: 生成/抓取一篇 SFI 风格的瑞典语人物传记（lättläst）写入 inbox/（人读正文 + svensk-export 导入块），供 /import 入库。仿 Astrid Lindgren / Zlatan 那类传记文章。
argument-hint: "[人名] [YYYY-MM-DD]  —— 二者皆可选；不给人名则自动挑一个尚未入库的著名人物"
allowed-tools: WebSearch, WebFetch, Read, Write, Edit, Glob, Grep
---

生成（或基于真实资料抓取）**一篇 SFI / lättläst 风格的瑞典语人物传记**，仿你 KB 里 [[source-2026-06-02-astrid-lindgren]]
和 [[source-2026-06-09-zlatan-bio]] 那一类传记文章：短句、A1–A2 词汇、按时间顺序叙述一个名人的一生。
写成**可读正文 + `svensk-export v1` 导入块**，存入 `inbox/biografi-<DATE>-<slug>.md`。
不碰 `knowledge_base/`、不自动 `/import`（入库由 `/import` 或定时流水线完成）。

参数 `$ARGUMENTS`：可含一个**人名**和一个日期 `YYYY-MM-DD`（顺序不限，都可选）。
- 给了人名 → 写那个人。
- 没给人名 → 按下面 §1 自动挑一个**尚未入库**的著名人物。
- 没给日期 → 用**今天**（会话上下文里的当前日期）。

---

## 1. 选人物 + 查重 (Pick a person — dedup first)

**核心约束：不重复写已经在 KB 里的人物。** Astrid Lindgren、Zlatan 已入库，别再写。

1. `Glob` → `knowledge_base/sources/*bio*.md` 和 `inbox/biografi-*.md` + `imported/biografi-*.md`，
   `Grep` 这些文件的标题/人名，列出**已覆盖的人物名单**。
2. 若用户在 `$ARGUMENTS` 指定了人名：用它，但先确认未重复（重复则告诉用户「已存在」并停止生成）。
3. 否则从下面**候选池**里挑第一个**尚未覆盖**的人物（与瑞典相关、生平适合 lättläst 叙述、事实可查）：

   **候选池（瑞典名人，按知名度 / 适合度排序，可按需扩充）：**
   Greta Thunberg（环保）· Alfred Nobel（诺奖）· Selma Lagerlöf（首位女性诺贝尔文学奖）·
   Carl von Linné（植物学）· Ingvar Kamprad（IKEA）· Greta Garbo（影星）· Ingmar Bergman（导演）·
   Avicii / Tim Bergling（音乐）· Björn Borg（网球）· ABBA（乐队）· Pippi 之外的真实人物 ·
   August Strindberg（作家）· Dag Hammarskjöld（联合国）· Raoul Wallenberg（二战义士）·
   Stefan Edberg / Annika Sörenstam（体育）· Astrid 之外的科学家如 Anders Celsius（摄氏度）。

   挑选时偏向：生平有清晰时间线、词汇贴近 A1–A2、和已入库人物**类型不同**（别连写两个足球运动员）。

## 2. 查事实 (Research — 不得编造)

务必基于**真实可查的事实**写传记，**不要编造**出生年份、地点、成就。

1. `WebSearch` → 搜 `<人名> biografi` / `<人名> lättläst` / `<人名> fakta`，了解关键生平。
2. 优先看是否有现成的 **lättläst 传记文本**（如 8 Sidor、SFI/lärresurser、Wikipedia「Enkel svenska」），
   `WebFetch` 命中页验证事实。
   - 若找到一段高质量、版权可引用的 lättläst 原文，可**直接采用并标注来源**（当作 source 文本处理）。
   - 否则**自己用简单瑞典语改写**成 SFI 风格传记（这是默认路径，最可控）。
3. 读 `profile/level.md`：把已掌握词融入复习，再引入约 **8–15 个新词/词组**。

## 3. 写传记正文 (Write the biography — SFI / lättläst 风格)

- **语言**：简单瑞典语，短句，主要时态 **preteritum**，按**时间顺序**（出生 → 童年 → 成名 → 晚年/影响）。
- **篇幅**：约 **120–220 词**（≈ Astrid / Zlatan 那篇的长度）。CEFR **A1–A2**（适量 B1 词汇可接受，避免 B2）。
- **词汇**：一律 grundform 入导出块（名词单数不定式、动词不定式、形容词原级）。

## 4. 写文件 (Write the inbox page)

写入 `inbox/biografi-<DATE>-<slug>.md`（slug = 人名小写连字符，如 `greta-thunberg`），两段式结构：

### 4a. 可读正文

```
# 🇸🇪 <人名> (传记 / biografi)

**类型 (type):** biografi
**来源 (source):** <"lättläst 改写" 或真实来源 URL>
**CEFR 估计:** <A1–A2>
**生成日期:** <DATE>

---

## 瑞典语原文 (Källtext)

<SFI 风格瑞典语传记，按时间顺序，短句 —— 直接写成普通段落（每段一行、段间空行），
**绝不要**用 ``` 代码块包裹，否则 Läsning 阅读站会渲染成等宽代码、且无法点词查词>

---

## 🇨🇳 全文翻译 (Översättning)

🇨🇳 <逐段中文翻译>

---

## 📌 教学备注 (Teaching Notes)
<2–4 条：本篇最值得记的词 / 词组 / 语法陷阱（preteritum、bisats、s-passiv 等），用 📌 / ⚠️ / 📐 标注>

---

⏭ 想录入知识库：/import biografi-<DATE>-<slug>.md
```

### 4b. 紧接一个 fenced ` ```svensk-export v1 ` 块

**严格遵照** `EXPORT_PROTOCOL.md` Part A / `sv-scenario` §4b 格式：

````
```svensk-export v1
date: <DATE>
source: biografi — <人名> (lättläst)
words:
- <lemma> | <ordklass> | <zh> | <en> | <notes 可选>
phrases:
- <phrase> | <category> | <zh> | <en>
sentences:
- <swedish sentence> | <zh translation>
grammar:
- <name> | <zh label> | <en label>
```
````

要求：
- `sentences:` 覆盖正文里**每一个有意义的瑞典语句子**（每句独占一行），使文本可重建并链接为 `sentences/` 笔记。
- 分类忠实于 `swedish-dictionary` / `swedish-phrases` / `swedish-grammar`；slug/基础形式遵从 `sv-knowledge-base`。
- 去重交给 import 阶段，生成时无需查 KB（人物层面的查重已在 §1 完成）。

## 5. 收尾 (Finish)

输出一行精简确认（定时包装会据此发通知）：

```
✅ 今日传记已生成: inbox/biografi-<DATE>-<slug>.md  ·  人物 <人名>  ·  CEFR <估计>  ·  <n> 生词
⏭ 想录入知识库：/import biografi-<DATE>-<slug>.md
```

不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是 `/import` 的事。
