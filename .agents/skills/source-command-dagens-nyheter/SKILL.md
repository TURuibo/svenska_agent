---
name: "source-command-dagens-nyheter"
description: "抓取 5 条最新瑞典语简易新闻（8 Sidor lättläst）写入 inbox/（人读正文 + svensk-export 导入块），供 /import 入库"
---

# source-command-dagens-nyheter

Use this skill when the user runs `/dagens-nyheter` or asks to run the migrated Claude Code command `dagens-nyheter` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

抓取**今天 5 条最新的瑞典语简易新闻**（来自 **8 Sidor** —— Sveriges Radio 的 lättläst nyheter，
天生贴近学习者水平），写成一份**可读新闻摘要 + `svensk-export v1` 导入块**，存入 `inbox/`。
不碰 `knowledge_base/`、不自动 `/import`（入库由 `/import` 或每日脚本完成）。

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD`。无则用**今天**（会话上下文里的当前日期）。

---

## 1. 抓新闻 (Fetch the news)

1. `WebFetch` → `https://8sidor.se/` 取首页最新文章列表（8 Sidor 是瑞典语**简易新闻**，
   句子短、词汇基础，适合 A2–B1 学习者；优先用它）。
   - 备用：若 8 Sidor 取不到，用 `WebSearch` 搜 `8 Sidor senaste nyheter` 或
     `lättläst nyheter svenska <DATE>`，再 `WebFetch` 命中的文章页。
2. 选 **5 条最新**、内容彼此不同（政治/社会/体育/文化/国际等尽量分散）的新闻。
3. 每条抓取：标题 + 2–4 句正文要点（用 8 Sidor 的原始 lättläst 瑞典语，**不要**自己改写成更难的句子）。

> 这是真实新闻抓取：务必基于实际抓到的内容，**不得编造**标题或事实。若某条抓取失败就跳过、补下一条，凑满 5 条。

## 2. 读档案 (Profile — 轻量)

`Read` → `profile/level.md`：了解已掌握词，挑选生词时偏向「已知词复习 + 约 5–12 个新词/词组」。
生词提取以原文为准，不强行降级；遇到偏难的专有名词可在备注里点明但不必全部入库。

## 3. 写文件 (Write the inbox page)

写入 `inbox/news-<DATE>.md`，结构如下（沿用 `sv-scenario` 技能 §4 的可读正文 + 导出块两段式）：

### 3a. 可读正文

```
# 🇸🇪 Dagens nyheter (8 Sidor) — <DATE>

**类型 (type):** news
**来源 (source):** 8 Sidor — lättläst nyheter
**CEFR 估计:** <A2–B1>
**生成日期:** <DATE>

---

## 1. <瑞典语标题>
<瑞典语 2–4 句要点>
🇨🇳 <中文翻译>

## 2. <瑞典语标题>
...（共 5 条，每条同样结构）

---

## 📌 教学备注 (Teaching Notes)
<2–4 条：本批新闻里最值得记的词/词组/语法陷阱，用 📌 / ⚠️ / 📐 标注>

---

📺 今日听力 (lyssna): **SVT Nyheter på lätt svenska** — 简易瑞典语新闻视频（vardagar ~17:15，约 4 分钟，带瑞典语字幕，可全球观看）：https://www.svtplay.se/nyheter-pa-latt-svenska
⏭ 想录入知识库：/import news-<DATE>.md
```

> 📺 那行 SVT 听力链接**固定写死**（始终指向 SVT Play 节目页，自动显示最新一集），不进 KB、不参与抓取，只是给用户配套的听力资源。

### 3b. 紧接一个 fenced ` ```svensk-export v1 ` 块

**严格遵照** `EXPORT_PROTOCOL.md` Part A / `sv-scenario` §4b 格式：

````
```svensk-export v1
date: <DATE>
source: news — 8 Sidor lättläst <DATE>
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
- 词汇一律 **grundform**（名词单数不定式、动词不定式、形容词原级）。
- `sentences:` 覆盖 5 条新闻里**每一个有意义的瑞典语句子**（每句独占一行），使文本可重建并链接为 `sentences/` 笔记。
- 分类忠实于 `swedish-dictionary` / `swedish-phrases` / `swedish-grammar`；slug/基础形式遵从 `sv-knowledge-base`。
- 去重交给 import 阶段，生成时无需查 KB。

## 4. 收尾 (Finish)

输出一行精简确认（headless 包装脚本会据此发系统通知）：

```
✅ 今日新闻已抓取: inbox/news-<DATE>.md  ·  5 条 · 来源 8 Sidor (lättläst) · CEFR <估计>
⏭ 想录入知识库：/import news-<DATE>.md
```

不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是 `/import` 的事。