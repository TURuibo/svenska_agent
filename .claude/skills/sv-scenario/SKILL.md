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

情景有**三种基础 type**（决定结构与篇幅）：

| 类型 (type token) | 描述 | 典型篇幅 |
|-------------------|------|----------|
| `dialog` | 两人或多人对话，有说话人标签（`A:` / `B:` 等） | 6–12 轮次（往返各算一轮） |
| `text` | 功能性 / 信息性 / 论说性书面文本（见下方体裁目录） | 80–150 词 |
| `story` | 短篇叙述：第一人称或第三人称小故事 | 80–150 词 |

**原则：不要太长。** 每篇文本应让初学者能在一次学习中消化，不追求完整性，追求密度与可理解性。
若用户未指定 type，按下方体裁目录的 type 列自动选择最合适的（例如"问路"→ dialog，"租房公告"→ text，"我的第一天"→ story）。

### 2a. 国家考试体裁目录 (National-test genre catalog)

下表把瑞典 **SFI** 与 **Svenska som andraspråk (Sva)** 国家考试 (Nationella prov) 里反复出现的体裁，
映射到本项目的 `type`、CEFR 区间、以及对应的考试部分 (delprov: **Läsa** 读 · **Höra** 听 · **Skriva** 写 ·
**Tala/Samtala** 说)。生成时**按体裁选择正确的 type 和语域**；`/scenario <体裁/主题>` 与每日 `/dagens-scenario`
轮换都从这张目录取材。⭐ = 用户特别点名的体裁。

**对话/口语类 (dialog — Tala/Höra)**
- `vardagssamtal` 服务场景对话（商店 / 医院 / 工作）— A2–B1
- `telefonsamtal` 电话预约 / 取消 / 改约 — A2
- `intervju-arbete` **求职面试**（角色扮演 rollspel）— A2–B1 ⭐
- `intervju-portratt` 报刊 / 人物专访（Q&A 作阅读文本）— A2–B1 ⭐
- `diskussion` 双人讨论 / 班级辩论（陈述 + 反驳观点，达成一致）— A2–B1 ⭐
- `presentation` 口头陈述 + 小组讨论（delprov A）— A2–B1

**功能性 / 信息性文本 (text — Läsa/Skriva, A2–B1)**
- `anslag` 公告 / 社区·市政信息 / 海报（停水、回收、开放时间）— ⭐社区通知
- `skolinfo` **学校 → 监护人通知**（家长会、请假、活动 information till vårdnadshavare）— ⭐学校通知
- `grannforum` **邻里论坛帖 / 致住户协会的投书**（近邻议题：噪音、垃圾、院子）— ⭐小区讨论帖
- `meddelande` 短信 / 便条 / 私人留言（读出意图：约时间 / 道歉 / 通知迟到）
- `personligt-brev` 私人信件 / 邮件（致朋友，含 hälsnings-/avskedsfras）
- `inbjudan` 邀请函（聚会 / 会议，含 OSA）
- `annons` 广告（租房 / 招聘 platsannons / 二手 / 活动）
- `schema` 日程 / 节目单 / 时刻表 / 开放时间（非连续文本，见 §2b）
- `instruktion` 说明书 / 食谱 / 分步指引（imperativ + först/sedan/till sist）
- `notis` · `nyhetsartikel` 简讯 / 新闻报道（rubrik + ingress + brödtext，答 vem/vad/när/var/varför）
- `nyhetsinslag` 简短新闻 / 天气预报（Höra 听力脚本）

**正式 / 论说 / 书面产出 (text — Skriva, A2–B1，用简单词汇写)**
- `formellt-brev` 致政府 / 企业 / 学校的正式信函（mottagaranpassning、niande、明确 ärende）— A2–B1
- `felanmalan` 报修 / 退换货 reklamation / 投诉（问题描述 + 期望处理 önskad åtgärd）— A2–B1
- `insandare` 读者来信（短论说：presentera ämne → argument → förslag → uppmaning → 署名）— A2–B1
- `debattartikel` 辩论文章 / 辩论帖（tes + 论据 + 反驳 motargument）— A2–B1
- `kronika` 专栏随笔（个人反思 jag-perspektiv，由日常引向更大主题）— A2–B1
- `recension` 评论（电影 / 书 / 餐厅：referat + 主观 omdöme）— A2–B1
- `referat` 客观转述 / 摘要（referatmarkörer + källhänvisning，无个人观点）— A2–B1
- `faktatext` 事实文 / 说明性长文（rubrik + stycken）— A2–B1
- `utredande` 论述文 / PM（多源 källhänvisning + 结论）— B1（上限，每月最多 1 篇）
- `blankett` 表格 / 申请表（填写；非连续文本，见 §2b）— A2

**叙述类 (story — Läsa/Skriva)**
- `berattelse` 记叙文 / 短篇（inledning–konflikt–avslutning，可留 oväntat slut）— A2–B1
- `monolog` 自我介绍 / 讲一段经历（口头独白脚本）— A2–B1
- `dikt` 诗 / 小说节选（虚构；纯文本管线下近似处理，无配图）— A2–B1

### 2b. 非连续文本写法 (icke-löpande text)

`blankett` / `schema` / `diagram` 等是**非连续文本**，不适合 `sentences:` 一行一句的契约。生成这类体裁时：
可读正文用**字段 + 说明行**呈现（如 `Namn: ______`、`Datum: ______`、`Tid: 09:00–12:00`），
`sentences:` 节只收录其中**完整的指令句 / 说明句**（如 "Fyll i blanketten med bläck." / "Biblioteket
har öppet till klockan 19 på torsdagar."），不要把表格字段硬拆成句子。其余 words/phrases 照常提取。

### 2c. 语域提醒 (register)

- **正式 / 论说体裁**（formellt-brev、insandare、debattartikel、referat、utredande、felanmalan）用书面、
  礼貌、niande 语域，结构清晰（tes/ärende → 论据/内容 → 结尾/署名），CEFR 以 **A2–B1** 为主，词汇和句式尽量简单，**避免 B2**。
- **功能性体裁**（anslag、annons、schema、blankett、notis）用简洁、要点式语域，A2 即可。
- **对话体裁**用自然口语；面试 / 辩论比闲聊正式半档。

---

## 3. 水平/语域规则 (Level & Register Rule)

### 3a. 以 A1–A2 为主，适量 B1 可接受，避免 B2

文本整体水平以 **A1–A2** 为目标。语域（register）仍由情景决定，但词汇和句式要尽量简化：
- 例："邮件给房东"→ 正式但简短的书面语（A2–B1 词汇）；"问路"→ 日常口语（A2）；"咖啡馆闲聊"→ 非正式（A1–A2）。
- 论说/正式体裁允许适量 B1 词汇（如 `insändare`、`felanmälan`），但仍用**短句**、**常见词**为主，**避免 B2**。

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
