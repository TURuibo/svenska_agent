---
name: "source-command-dagens-artikel"
description: "生成今日一篇 lättläst 瑞典语阅读文章（按 day-of-year 轮换 8 种体裁：传记/国情/历史/传统/自然/地方/发明/科普）写入 inbox/（人读正文 + svensk-export 导入块），供 /import 入库"
---

# source-command-dagens-artikel

Use this skill when the user runs `/dagens-artikel` or asks to run the migrated Claude Code command `dagens-artikel` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

生成**今日一篇 SFI / lättläst 风格的瑞典语阅读文章**，写成**可读正文 + `svensk-export v1` 导入块**，存入 `inbox/`。
体裁**每天轮换**（仿 `/dagens-scenario` 的 day-of-year 轮换），让阅读素材多样：人物传记只是其中一类。
不碰 `knowledge_base/`、不自动 `/import`（入库由 `/import` 或定时流水线完成）。

> 这是「阅读文章」线（叙述/说明文，配 Läsning 阅读站），区别于 `/dagens-scenario`（情景对话/功能文本）、
> `/dagens-nyheter`（真实新闻）、`/dagens-horovning`（听力）。素材两段式格式与它们一致。

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD` 和一个 `0–7` 的体裁号（顺序不限，都可选）。
**定时任务（headless）会把两者都算好传进来**，自动运行时无需任何计算。

---

## 1. 定日期与体裁 (Date → Genre)

- 若 `$ARGUMENTS` 含 `YYYY-MM-DD` → 用它做 DATE；否则用**今天**（会话上下文里的当前日期）。
- 若 `$ARGUMENTS` 含一个 0–7 的体裁号 → **直接用它**；否则计算 `INDEX = day-of-year(DATE) mod 8`。

**体裁表（`day-of-year mod 8`）：**

| idx | genre | slug 前缀 | 中文 | 写法重点 (时态/角度) | 候选题材池（挑**尚未入库**的，按需扩充） |
|---|---|---|---|---|---|
| 0 | biografi | `biografi-` | 人物传记 | preteritum，按时间顺序讲一生 | 见 `.claude/commands/dagens-biografi.md`（Astrid/Zlatan/Greta 已入库）。池：Alfred Nobel、Selma Lagerlöf、Carl von Linné、Ingvar Kamprad、Greta Garbo、Ingmar Bergman、Avicii、Björn Borg、August Strindberg、Raoul Wallenberg、Anders Celsius |
| 1 | sverige-fakta | `sverige-` | 瑞典社会/国情 | presens，"瑞典是怎么运作的" | allemansrätten、fika、personnummer、sopsortering、skolsystemet、sjukvården、att söka jobb、hyresrätt、Systembolaget、föräldraledighet、lagom |
| 2 | historia | `historia-` | 历史 | preteritum，一个历史事件/时代 | vikingatiden、regalskeppet Vasa、Nobelpriset、digerdöden、Gustav Vasa、industrialiseringen、Sverige under andra världskriget |
| 3 | tradition | `tradition-` | 节日/传统 | presens，"瑞典人怎么过这个节" | midsommar、lucia、jul、påsk、valborg、kräftskiva、nationaldagen 6 juni、semla/fettisdagen、industrisemester |
| 4 | natur-djur | `natur-` | 自然/动物 | presens，描写一种动物/自然现象 | älgen、björnen、vargen、renen、norrsken、midnattssolen、fjällen、skärgården、svampplockning、de fyra årstiderna |
| 5 | plats | `plats-` | 地方/城市 | presens，介绍一座城/地区 | Stockholm、Göteborg、Malmö、Gotland (Visby)、Lappland/Sápmi、Kiruna、Uppsala、Dalarna、Skåne、Öland |
| 6 | uppfinning | `uppfinning-` | 发明/创新 | presens + 一点 preteritum（发明史） | blixtlåset、skiftnyckeln、säkerhetständstickan、pacemakern、kullagret (SKF)、Tetra Pak、Spotify、Skype |
| 7 | vetenskap-vardag | `vetenskap-` | 生活科普 | presens，回答一个"为什么" | varför är det mörkt på vintern、varför är havet salt、hur fungerar återvinning、varför byter löven färg、vad är växthuseffekten |

> 体裁 0（传记）**完全遵循** `.claude/commands/dagens-biografi.md` 的 §1–§5 规则，本命令不重复。

## 2. 选题材 + 查重 (Pick a subject — dedup first)

**核心约束：不重复已入库的题材/人物。**

1. `Glob` → `knowledge_base/sources/*.md`、`imported/<slug前缀>*.md`、`inbox/<slug前缀>*.md`，
   `Grep` 标题/题材，列出该体裁**已覆盖**的题材。
2. 若 `$ARGUMENTS` 指定了具体题材 → 用它（先确认未重复；重复则告诉用户「已存在」并停止）。
3. 否则从该体裁候选池里挑第一个**尚未覆盖**的题材。优先：事实可查、贴近 A1–A2、与近期已写题材类型不同。

## 3. 查事实 (Research — 不得编造)

务必基于**真实可查的事实**，**不要编造**年份、地点、数字、成就。

1. `WebSearch` → 搜 `<题材> lättläst` / `<题材> fakta` / `<题材> Sverige`，了解关键事实。
2. 优先看是否有现成 **lättläst 文本**（8 Sidor、SFI/lärresurser、Wikipedia「Enkel svenska」），`WebFetch` 验证。
   - 找到高质量、可引用的 lättläst 原文 → 可直接采用并标注来源 URL。
   - 否则**自己用简单瑞典语写**（默认路径，最可控）。
3. `Read` → `profile/level.md`：把已掌握词融入复习，再引入约 **8–15 个新词/词组**。

## 4. 写文章正文 (Write the article — SFI / lättläst 风格)

- **语言**：简单瑞典语、短句。时态按体裁表（传记/历史用 preteritum；国情/自然/地方/科普用 presens）。
- **篇幅**：约 **120–220 词**。CEFR **A1–A2**（适量 B1 词汇可接受，避免 B2）。
- **词汇**：导出块一律 grundform（名词单数不定式、动词不定式、形容词原级）。

## 5. 写文件 (Write the inbox page)

写入 `inbox/<slug前缀><DATE>-<题材slug>.md`（如 `sverige-2026-06-23-allemansratten.md`），两段式结构
（完全照搬 `sv-scenario` 技能 §4a + §4b，与 `/dagens-biografi` 同）：

### 5a. 可读正文
```
# 🇸🇪 <标题> (<体裁中文> / <genre>)

**类型 (type):** <genre>
**来源 (source):** <"lättläst 改写" 或真实来源 URL>
**CEFR 估计:** <A1–A2>
**生成日期:** <DATE>

---

## 瑞典语原文 (Källtext)
<SFI 风格瑞典语文章 —— 直接写成普通段落（每段一行、段间空行），**绝不要**用 ``` 代码块包裹，
否则 Läsning 阅读站会渲染成等宽代码、且无法点词查词>

---

## 🇨🇳 全文翻译 (Översättning)
🇨🇳 <逐段中文翻译>

---

## 📌 教学备注 (Teaching Notes)
<2–4 条：本篇最值得记的词/词组/语法陷阱，用 📌 / ⚠️ / 📐 标注>

---
⏭ 想录入知识库：/import <slug前缀><DATE>-<题材slug>.md
```

### 5b. 紧接一个 fenced ` ```svensk-export v1 ` 块
**严格遵照** `EXPORT_PROTOCOL.md` Part A / `sv-scenario` §4b 格式：
````
```svensk-export v1
date: <DATE>
source: <genre> — <题材> (lättläst)
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
要求：`sentences:` 覆盖正文里**每一个有意义的句子**；分类忠实于 swedish-* 技能；slug/基础形式遵从 `sv-knowledge-base`；去重交给 import 阶段。

## 6. 收尾 (Finish)

输出一行精简确认（定时包装会据此发通知）：
```
✅ 今日阅读已生成: inbox/<slug前缀><DATE>-<题材slug>.md  ·  体裁 <genre>（<中文>）  ·  题材 <题材>  ·  CEFR <估计>
⏭ 想录入知识库：/import <slug前缀><DATE>-<题材slug>.md
```
不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是 `/import` 的事。