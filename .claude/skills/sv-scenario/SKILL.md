---
name: sv-scenario
description: >
  Swedish practice-scenario generator for a Chinese/English-speaking beginner. Use this skill
  whenever the user wants to generate or create Swedish practice material: a dialogue, a
  conversation, a reading text, a functional text (email, sign, SMS, menu, notice), a short
  narrative, or any scenario-based practice. Trigger when the user runs /scenario, says "生成一个
  对话", "给我出一个练习", "create a scenario", "write a dialogue about X", "generate practice
  text", "make a story about", "出一个情景", or provides a situation and asks for Swedish text.
  This skill specifies HOW to generate the scenario and the exact output contract. The generated
  file is written to inbox/ for the user to review, then ingested through the standard
  swedish-export v1 → /import pipeline. It does NOT write into knowledge_base/.
---

# sv-scenario — 情景练习生成技能

本技能规定情景练习文本的生成方式与输出格式。阅读 `CLAUDE.md`（§0 黄金法则、§4.2 场景生成）
和 `EXPORT_PROTOCOL.md` Part A（导出块格式）后再执行任何生成任务。

---

## 1. 用途与适用场景 (Purpose & When to Use)

当用户提供一个**情景主题**（如"问路""在咖啡馆点餐""写邮件给房东"）时，本技能指导如何：

1. 生成一段自然的瑞典语练习文本（对话 / 功能性文本 / 短篇叙述）；
2. 提取其中所有学习项目（词、词组、句子、语法点），并分类为 `svensk-export v1` 格式；
3. 将两者合并写入 `inbox/scenario-<date>-<slug>.md`，供用户审阅后通过 `/import` 正式录入。

**衔接管道：** 生成 → `inbox/` 文件 → 用户审阅 → `/import` → `sv-import` 技能 → `sv-librarian`
子智能体完成去重 + 双向 `[[wikilinks]]` + `sources/` 笔记。本技能负责"生产侧"；`sv-import` 负责"消费侧"。不写 `knowledge_base/`。

---

## 2. 情景分类与篇幅指南 (Scenario Taxonomy & Length)

| 类型 (type token) | 描述 | 典型篇幅 |
|-------------------|------|----------|
| `dialog` | 两人或多人对话，有说话人标签（`A:` / `B:` 等） | 6–12 轮次（往返各算一轮） |
| `text` | 功能性文本：邮件、短信、告示、菜单、公告 | 80–150 词 |
| `story` | 短篇叙述：第一人称或第三人称小故事 | 80–150 词 |

**原则：不要太长。** 每篇文本应让初学者能在一次学习中消化，不追求完整性，追求密度与可理解性。

若用户未指定类型，根据情景主题自动选择最合适的类型（例如"问路"→ 对话，"租房公告"→ 功能性文本，"我的第一天"→ 叙述）。

---

## 3. 水平/语域规则 (Level & Register Rule)

### 3a. 以情景所需为准，不强制降级

文本的语域（register）和词汇复杂度由情景本身决定。  
- 例："邮件给房东"→ 正式书面语（B1–B2 词汇）；"问路"→ 日常口语（A2–B1）；"咖啡馆闲聊"→ 非正式（A1–A2）。  
- 不强制把文本压到 A1——降低自然度的假瑞典语比稍难一点的真瑞典语更有害。

### 3b. 查阅学习者档案，平衡新词与复习词

生成前读取 `profile/level.md`：
- 将档案"已掌握"（known）清单中的词尽量融入文本，作为**复习巩固**；
- 同时引入约 **5–10 个新词/词组**（对初学者来说数量不宜过多）；
- 可选：`Grep knowledge_base/words/` 确认哪些候选词已存在，优先在文本中复用已知词。

### 3c. 标注 CEFR 估计

在输出文件的元数据中标注该文本的 CEFR 估计（如 `A2`、`B1`），并在教学备注中简短说明依据。

---

## 4. 输出契约 (Output Contract)

生成结果为**一个**文件，写入：

```
inbox/scenario-<date>-<slug>.md
```

其中：
- `<date>` = 生成日期，绝对格式 `YYYY-MM-DD`（如 `2026-06-03`）；
- `<slug>` = 情景主题的 ascii 式 kebab-case，å/ä → a，ö → o（如 "fråga efter vägen" → `fraga-efter-vagen`）。

文件包含**两部分**，按顺序排列：

---

### 4a. 可读情景（Human-readable Scenario）

```
# 🇸🇪 <情景标题，中文 + Swedish>

**类型 (type):** dialog / text / story
**CEFR 估计:** A2 / B1 / …
**生成日期:** YYYY-MM-DD

---

## 瑞典语原文

<Swedish text>
<!-- 对话用说话人标签：A: / B:，每轮一行 -->

---

## 🇨🇳 全文翻译

<Chinese translation, faithful but natural>

---

## 📌 教学备注 (Teaching Notes)

📌 <注 1 — 重要词汇或结构>
⚠️ <注 2 — 常见错误或陷阱>
📐 <注 3 — 语法要点>
📌 <注 4 — 搭配或语用说明>（可选）
```

教学备注共 2–4 条，针对场景中最值得学习者注意的点。

---

### 4b. 导出块（svensk-export v1 Block）

紧接可读情景之后，写一个 fenced code block，语言标签 `svensk-export v1`，**严格遵照**
`EXPORT_PROTOCOL.md` Part A 的格式：

````
```svensk-export v1
date: YYYY-MM-DD
source: scenario — <情景描述>
words:
- <lemma> | <ordklass> | <zh> | <en> | <notes (可选)>
phrases:
- <phrase> | <category> | <zh> | <en>
sentences:
- <swedish sentence> | <zh translation>
grammar:
- <name> | <zh label> | <en label>
```
````

**`sentences:` 必须包含文本中每一个有意义的句子**（对话每一轮话语、功能文本每一句），
使文本完整可重建并可链接为 `sentences/` 笔记。

---

### 4c. 具体示例 (Worked Mini-Example)

下面是一个"在咖啡馆点咖啡" (`kaffebestaallning`) 的 `inbox/` 文件布局示例（内容已大幅简化）：

```
# 🇸🇪 Kaffebeställning — 在咖啡馆点咖啡

**类型 (type):** dialog
**CEFR 估计:** A2
**生成日期:** 2026-06-03

---

## 瑞典语原文

A: Hej! Vad får det vara?
B: Hej! En cappuccino, tack.
A: Stor eller liten?
B: Liten, tack. Hur mycket kostar det?
A: Det kostar trettio kronor.
B: Okej, varsågod. Tack så mycket!
A: Tack! Ha en bra dag!

---

## 🇨🇳 全文翻译

A: 你好！要点什么？
B: 你好！一杯卡布奇诺，谢谢。
A: 大杯还是小杯？
B: 小杯，谢谢。多少钱？
A: 三十克朗。
B: 好的，给你。非常感谢！
A: 谢谢！祝你今天愉快！

---

## 📌 教学备注

📌 **Vad får det vara?** — 咖啡馆/餐馆的固定问句"请问要什么？"，字面意为"能是什么？"
⚠️ **varsågod** — 收款、递东西时说，不要说 tack（那是"谢谢"）。
📐 **kostar** — presens 形式，动词 v.2r；Hur mycket kostar det? = "多少钱？"

---

```svensk-export v1
date: 2026-06-03
source: scenario — kaffebeställning på café
words:
- beställning | substantiv en | 点餐；订单 | order | beställningar（复数）
- cappuccino | substantiv en | 卡布奇诺 | cappuccino
- kosta | verb v.2r | 花费；值…钱 | to cost | kostar / kostade / kostat
- krona | substantiv en | 克朗（瑞典货币） | Swedish krona | kronor（复数）
phrases:
- vad får det vara | hälsningsfras | 请问要什么 | what can I get you
- tack så mycket | 礼貌表达 | 非常感谢 | thank you very much
- ha en bra dag | 礼貌表达 | 祝你今天愉快 | have a great day
sentences:
- Hej! Vad får det vara? | 你好！请问要点什么？
- En cappuccino, tack. | 一杯卡布奇诺，谢谢。
- Stor eller liten? | 大杯还是小杯？
- Hur mycket kostar det? | 多少钱？
- Det kostar trettio kronor. | 三十克朗。
- Okej, varsågod. Tack så mycket! | 好的，给你。非常感谢！
- Ha en bra dag! | 祝你今天愉快！
grammar:
- presens | 现在时 | present tense
- v2-ordfoljd | V2 语序 | V2 word order
```
```

`/import` 运行时，会自动提取 ` ```svensk-export v1 ` 块，忽略上方的可读情景散文。

---

## 5. 规则摘要 (Rules)

1. **词汇用 grundform**（基础形式）：名词用单数不定形，动词用不定式，形容词用原级/中性形式。
2. **不写 `knowledge_base/`** — 生成物只落在 `inbox/`；正式录入由用户运行 `/import` 触发。
3. **分类忠实** — 按 `swedish-dictionary` / `swedish-phrases` / `swedish-grammar` 技能的标准分类词性、类型、语法点；slug 与基础形式规则遵从 `sv-knowledge-base`。
4. **每个句子独占一行** — `sentences:` 节中每行一句；不拆分或合并句子。
5. **去重属于 import 阶段** — 生成时无需检查 KB；`/import` 和 `sv-librarian` 负责去重。
6. **slug 为 ascii 式 kebab-case** — 情景主题翻译为 ascii，å/ä → a，ö → o，空格 → `-`，全小写，不含特殊符号。
