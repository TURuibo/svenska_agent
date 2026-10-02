---
description: 抓取一篇瑞典政府机构的易读页面（lättläst）写入 inbox/（瑞典语原文 + 中文翻译 + svensk-export 导入块），专补社会 / 工作 / 经济 / 住房 / 学校 / 健康类缺口词，供 /import 入库
argument-hint: "[网址 | 主题代码 T14/T11/T13/T10/T12/T04/T05 | 来源名 riksdagen/informationsverige/val/skolverket/socialstyrelsen/1177] [YYYY-MM-DD] —— 都可选；裸调 = 自动按缺口最多的主题挑一页"
allowed-tools: WebSearch, WebFetch, Read, Write, Edit, Glob, Grep, Bash(node tools/vocab-progress.js:*), Bash(python3 tools/fetch-page-text.py:*)
---

从**瑞典政府机构的易读页面**（lättläst / lätt svenska）抓**一篇真实文本**，写成「可读正文 + `svensk-export v1` 导入块」，
存入 `inbox/myndighet-<DATE>-<slug>.md`。这类页面专为新移民和阅读困难的人写，句子短，但用的正是**社会、工作、经济、住房、
学校、健康**这些「制度词」——2026-10-02 词汇分析里 KB 最缺的几类（见 `profile/vocab-analysis.md` §5）。

不碰 `knowledge_base/`、不自动 `/import`（入库由 `/import` 完成）。参数 `$ARGUMENTS` 见下。

---

## 1. 选页面 (Pick a page)

**来源目录（只用这些官方网站；入口均已核实 2026-10-02）：**

| 来源 | 入口 | 适合主题 | 例子 |
|------|------|----------|------|
| **informationsverige.se**（Länsstyrelserna，「Om Sverige」社会导向课本） | `https://www.informationsverige.se/sv/om-sverige.html` | T11 工作 · T13 经济 · T10 住房 · T04 健康 · T05 家庭 · T14 权利/民主 | `…/sv/om-sverige/att-forsorja-sig-och-utvecklas-i-sverige.html`（工作、税务申报）· `…/att-bo-i-sverige.html` · `…/att-varda-sin-halsa-i-sverige.html` · `…/att-bilda-familj-och-leva-med-barn-i-sverige.html` · `…/att-paverka-i-sverige.html` · `…/individens-rattigheter-och-skyldigheter.html` · `…/att-aldras-i-sverige.html` · `…/att-komma-till-sverige.html` |
| **Riksdagen lättläst** | `https://www.riksdagen.se/sv/lattlast/` | T14 社会·政治 | `…/lattlast/demokrati/` · `…/det-har-gor-riksdagen/` · `…/partierna-i-riksdagen/` · `…/riksdagen-i-samhallet/` · `…/lattlast-om-eu/det-har-ar-eu/` |
| **Valmyndigheten lättläst** | `https://val.se/servicelankar/servicelankar/lattlast` | T14 选举 | `…/lattlast/sa-fungerar-demokratin` · `…/fyra-val-i-sverige` · `…/vem-far-rosta` · `…/sa-har-rostar-du` |
| **Socialstyrelsen lättläst** | `https://www.socialstyrelsen.se/stod-i-livet/lattlast-svenska/` | T14 社会服务 · T05 家庭 · T13 经济补助 | `…/om-socialtjansten-pa-lattlast-svenska/` · `…/ekonomiskt-stod-pa-lattlast-svenska/` · `…/barn-och-familj-pa-lattlast-svenska/` · `…/aldre-pa-lattlast-svenska/` |
| **Skolverket lättläst** | `https://www.skolverket.se/lattlast/lattlast-information-fran-skolverket` | T12 学校·教育 | 学校体系、成绩、Komvux / SFI |
| **1177 lättläst** | `https://www.1177.se/sv-se-x-ll/other-languages/other-languages/` | T04 健康·医疗 | 怎么看病、vårdcentral、急诊 |

**怎么选：**
- `$ARGUMENTS` 里有**网址** → 就用它（必须是上表这些网站之一，否则停下来说明）。
- 有**来源名** → 用那个来源，挑一个还没用过的子页面。
- 有**主题代码**（如 `T11`）→ 在适合该主题的来源里挑一页。
- **裸调**（定时任务）→ 运行 `node tools/vocab-progress.js --pick auto 1` 取「剩余 P1 最多」的主题；如果那个主题
  不在上表（如 T17 论证、T18 动词），改用上表主题里剩余 P1 最多的那个（依次试 T14、T11、T13、T12、T04、T10、T05）。
- **查重**：`Grep` `inbox/` 和 `imported/` 里 `myndighet-*.md` 的 `**来源 (source):**` 行，**同一网址不用第二次**；
  入口页列出的子页面都用过了，就换来源。

## 2. 抓正文 (Fetch — 只用原文，不改写)

1. 用 `python3 tools/fetch-page-text.py <网址>` 抓页面正文（curl 取原始 HTML，只去标签，**真正逐字**）。
   ⚠️ **不要用 `WebFetch` 取正文**——它会先经模型压缩改写，拿到的不是原文（2026-10-02 试跑教训）。`WebFetch` 只用来
   浏览入口页、找子页面链接；脚本失败（如 403）才退回 `WebFetch`，并在 📌 教学备注里注明「正文经 WebFetch 提取，可能非逐字」。
   入口页本身多是链接列表，要点进具体子页面再抓。
2. 取**一段连贯的正文，约 150–350 词**（页面长就截一个完整小节，从小节开头取到小节结尾，不要从句子中间截断）。
3. **逐字照抄机构原文**（可以去掉导航、按钮文字、「Läs mer」之类），**不得改写、扩写、编造**。抓取失败就换一页，
   不要凭记忆写。
4. 记下页面标题、机构名、网址。

## 3. 标目标词 (Mark gap words that occur)

1. `node tools/vocab-progress.js --pick all 400` → 所有还没学的 P1/P2 缺口词（带主题和中文）。
2. 找出**在正文里出现了**的那些（任何变形都算：`ansvar` / `ansvaret`，`anställa` / `anställd`）。
3. 在瑞典语原文里把它们**每次出现都加粗**（只加 `**`，不改字）。这些词写进 `**目标词:**` 行，导出块里每个一行。

## 4. 写文件 (Write the inbox page)

写入 `inbox/myndighet-<DATE>-<slug>.md`（`<DATE>` = `$ARGUMENTS` 里的日期或今天；slug = 页面标题的 ascii kebab-case，
å/ä→a、ö→o），结构：

```
# 🇸🇪 <瑞典语标题> — <中文标题>

**类型 (type):** myndighetsinformation (lättläst)
**来源 (source):** <机构名> — <网址>
**题材:** 政府信息
**主题:** <代码> <图标> <中文>        ← 与 profile/vocab-gaps.json 的 themes 一致，如 T14 🏛️ 社会·政治·法律
**目标词:** <出现的缺口词，逗号分隔>
**CEFR 估计:** <A2–B1>
**生成日期:** <DATE>

---

## 瑞典语原文

<机构原文，按原段落分段；缺口词加粗>

---

## 🇨🇳 全文翻译

<忠实、自然的中文翻译，按段对应>

---

## 📌 教学备注 (Teaching Notes)

<3–5 条：文中最重要的制度词 / 固定说法（📌）、容易误解的地方（⚠️）、语法点（📐），
 可以加一条 🇸🇪 简短说明这件事在瑞典怎么运作>

---

🔗 原文：<网址>（<机构名>，易读版）
⏭ 想录入知识库：/import myndighet-<DATE>-<slug>.md
```

紧接一个 fenced ` ```svensk-export v1 ` 块（格式同 `sv-scenario` 技能 §4b / `EXPORT_PROTOCOL.md` Part A）：
`date` / `source: myndighet — <机构名> lättläst: <标题>` / `words` / `phrases` / `sentences` / `grammar`。
- **每个目标词一行**（grundform），再加文中其他值得学的词和制度用语（如 `ha rätt till`、`ansöka om`）。
- `sentences:` 覆盖正文**每一个句子**（列表项也算），使文本可重建。
- 去重交给 `/import`。

## 5. 收尾 (Finish)

```
✅ 已抓取易读页面: inbox/myndighet-<DATE>-<slug>.md
   来源: <机构名> · 主题: <代码 中文> · 约 <n> 词 · 目标词 <n> 个 · CEFR <估计>
⏭ 录入：/import myndighet-<DATE>-<slug>.md
```

不写 `knowledge_base/`、不 rebuild 站点、不自动 import。
