---
name: sv-study-guide
description: 逐段精读 (paragraph-by-paragraph deep reading) for a Swedish article — the DEFAULT final stage whenever Ruibo photographs or pastes a whole new text (textbook page, handout, article), and the on-demand tool (/jingdu) for any article already in imported/. Splits the text into paragraph cards, analyses every sentence (S/V/O/A structure, word order, tense, grammar points linked to KB notes, close translation), adds per-paragraph phrase + vocab tables, measures vocabulary coverage with tools/check-coverage.js and fills every gap in the KB so all content words are clickable in 📖 Läsning, then has an independent reviewer fix errors before publishing. Use after any photo/whole-text /learn, after sv-textbook-qr, on /jingdu, or when Ruibo says 看不懂/分段分析/逐句分析/精读/拆解/有词没查. Do NOT use for a single sentence (swedish-grammar) or a single word (swedish-dictionary).
---

# sv-study-guide — 逐段精读

> 目标：Ruibo 读一篇 B1 课文时，**每一句都看懂**（结构 + 为什么），**每个实词都能点查**。
> 范例：`imported/paste-2026-09-22-nils-van-der-poel.md`（PR #142），另 8 篇 QR 课文（PR #143）。

## 0. 什么时候跑

| 情况 | 入口 | 从哪一步开始 |
|---|---|---|
| **拍照 / 粘贴一整篇新文章**（最常见） | `/learn` + 照片，或直接发照片 | 先走 CLAUDE.md §4 的拍照流程（转写→KB→`imported/` 文章→导出块；有 QR 再走 `sv-textbook-qr`），**然后自动接本技能 §2**，不用 Ruibo 再开口 |
| 已在 `imported/` 的文章 | `/jingdu <slug>` 或「XX 那篇我看不懂」 | §2 |
| 只想知道某篇缺哪些词 | `node tools/check-coverage.js <slug>` | §2 第一步即可 |

规模：一篇 6–13 段、40–70 句的课文，一般 **1 个写手 + 1–4 个 librarian + 1 个复核者**。多篇同时做时，写手一篇一个，librarian 按词元首字母切分（见 §3）。

## 1. 四条经验（为什么这样做）

| 经验 | 做法 |
|---|---|
| 只给全文翻译 + 词表 → "看得到中文，看不懂瑞典语" | 逐句给**结构**（S/V/O/A、⟨从句⟩）和**为什么**，不只是译文 |
| "没查的词"多是**基础词没笔记**（gick/kom/tog）或**变形匹配不到**（skeptiska、tilläts） | **先跑 `check-coverage.js` 量化**，按数据补，不凭感觉挑生词 |
| 批量写的语言内容一定有错（9 篇共查出约 30 处） | 发布前**独立复核者**逐段挑错并直接改 |
| 手机是主要阅读端 | Playwright 390px 实测 |

## 2. 流程

```
① check-coverage --gaps  →  ② librarian 补词（并行，slug 不相交）  ┐
                            ③ 写手写精读（与 ② 并行）                ├→ ④ 断链收尾 → ⑤ 复核者改错 → ⑥ 导出块/source/重建 → ⑦ 实测 → ⑧ 提交
```

**① 量化**
```bash
node tools/check-coverage.js <slug> --gaps /<scratchpad>/gaps-<slug>.tsv
```
报告：全部词/实词覆盖率、缺词清单、学习项数（0 = 导出块格式问题）、精读状态、断链。拍照新文章刚入库时实词覆盖通常只有 50–60%。

**② 补词**（`sv-librarian`，提示词见 §4-A）。缺词 < 40 个用 1 个；多篇或 > 100 个按首字母切成 a–e / f–k / l–r / s–ö 四个，**各自只建自己字母段的词元**，跨段的报告回来由主 agent 处理。

**③ 写精读**（`general-purpose`，提示词见 §4-B），与 ② 同时跑。

**④ 断链收尾**：跑 `check-coverage.js`，断链先**重定向**到已有笔记（如 `kännas→känna`、`knappt→knapp`、`hörd→höra`），真缺的再交一个 librarian 一次建完。

**⑤ 复核**（`general-purpose`，提示词见 §4-C）：每篇一个复核者（篇幅小可一人两篇），**只改真错误**。

**⑥ 收尾数据**：
- 把本次新建的词笔记追加进文章 `svensk-export` 块（沿用该块现有写法：`# words` 或 `words:`/`- `），source 笔记 `words:` 列表补齐，并加一节「YYYY-MM-DD 补充」。
- 教学备注末尾加一行：`- **逐段精读**：下方「🔍 逐段精读」把全文分成 N 段，每段逐句拆解结构/语法 + 词组表 + 生词表（点卡片展开）。`
- `node tools/build-kb-site.js && node tools/check-coverage.js <slug>`：要求**断链 0、实词覆盖 ≥ 90%**（剩下的应只是人名、地名、数字）。

**⑦ 实测**：Playwright（`executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'`，require `/opt/node22/lib/node_modules/playwright`），`python3 -m http.server --directory site`，390×844 打开 `reading/#article=<slug>`，**每篇 `reload()`**（hash 路由不自动切）。检查：卡片数 = 段数、`scrollWidth == 390`、无 pageerror、有 QR 的出现 🎧。关 server 用 `kill <pid>`，别用 `pkill -f` 匹配当前命令行（会杀掉自己）。

**⑧ 提交**：拍照流程本来就要 `/sync`，精读随同一批 commit+push；交互会话只有 Ruibo 要求才开 PR（CLAUDE.md §4.7）。

**回复格式**（表格）：每篇段数/句数 · 覆盖率前→后 · 复核改了什么 · 新建词数 · 还剩什么。

## 3. 精读格式（写手照此写，插在 📌 教学备注之后、`svensk-export` 之前）

```markdown
## 🔍 逐段精读 (Stycke för stycke)

💡 读法：先读瑞典语段落 → 一句句看「📐 结构」和「⚠️ 要点」→ 最后看 🇨🇳。生词表里「原形」可点开完整笔记；正文里虚线词可直接点查。
💡 符号：**S** 主语 · **V** 限定动词（变位的那个）· **O** 宾语 · **A** 状语 · ⟨…⟩ 从句。

### ¶1 · <小标题>（N 句）

<该段瑞典语原文，逐字照抄>

🇨🇳 <该段译文>

#### 🔍 逐句拆解

**① <句子原文>**

- 📐 `<成分>`(S) + `<动词>`(V) + …；从句写成 ⟨…⟩
- ⚠️ <要点及原因> → [[grammar-…|📗<该笔记 zh>]]
- 🇨🇳 <贴近原文的译文>

#### 🧩 词组
| 词组 | 意思 | 本段用法 |

#### 📚 生词
| 文中形式 | 原形 | 词性 | 中文 | 说明 |
```

**渲染约定**（`site/reading/reading.js` 已支持）：`##` 标题含「精读」→ 其下每个 `###` 成为可折叠卡片 + 「全部展开」；`🇨🇳` 开头的行按译文层显示；`[[slug|标签]]` 显示标签。**不要**用 `>` 引用块；`###` 标题里别出现「翻译/译文/中文」。
- 段落按「瑞典语原文」的自然段；对话/采访按人分卡，人名行并入卡片标题；图片说明（bildtext）单独一张卡；日期行并入第一卡。
- 生词表「原形」= `[[词元]]`（slug = 词元小写、空格→`-`）；同形异义要链到正确笔记（`vara-substantiv`、`kort-adjektiv`）。没有笔记的词组写纯文本，不要造链接。

**必讲点**（出现就讲，链到已有笔记）：V2/倒装、从句里 inte 在动词前、sin/hans/dess（sin 只指**第三人称主语**）、两种 att（连词 vs 不定式标记）、介词 + att + 不定式、s-被动 vs deponens vs 相互义（träffas）、pluskvamperfekt 与从句省 hade、小品词动词被拆开（以及 hälsa på 打招呼时 på 是不重读介词）、双重限定与属格后名词不加词尾、om/vad 引导的间接疑问、强变化动词形式。

**判断准则**（复核中反复出现的错）：
- `det är X som …`：只有把简单句重排、强调 X 时才是 klyvning；det 指代前文、或「det är många som」这类引出新主语的句子**不是**。
- 不确定的可省成分（att、som、hade）说「可省」，不说「不加」。
- 不规范的课本用法（如 `hört talats om`）要点明规范形式（`hört talas om`）。
- 构词别想当然：segrare ← segra、oskadd ← skadd、förtidsrösta ← förtid。

## 4. 子代理提示词模板（直接复制，替换 <…>）

**A. librarian 补词**（`subagent_type: sv-librarian`）
```
Read .claude/skills/sv-study-guide/SKILL.md §2–§3. Fill KB vocabulary gaps for <imported/…md> (source note
knowledge_base/sources/<source-slug>.md). Gap list: <gaps.tsv> (surface<TAB>article). Your bucket: lemmas starting
with <letters> (report out-of-bucket ones instead of creating them).
For each surface: find its lemma from the article sentence; skip names, numbers, pure function words.
If the lemma note exists, append the missing bare form as a Forms row. If an existing note is a homograph with
another meaning, create <lemma>-<ordklass>.md. Otherwise create a full note from knowledge_base/_templates/word.md
(style of words/tvivla.md): created "<date>"; Forms table FIRST in the Forms section, ONE BARE FORM PER CELL,
every inflection incl. s-passive / genitive / -aste where relevant; first example = the article sentence + 中文,
then 2+ simple examples; 用法提示 ends with 来源: [[<source-slug>]]; synonyms/antonyms/family as bare slugs (no [[ ]]).
Only touch word notes in your bucket. Reply: created / enriched (+forms) / out-of-bucket / skipped.
```

**B. 写手写精读**（`subagent_type: general-purpose`）
```
Read .claude/skills/sv-study-guide/SKILL.md §3 and the finished "## 🔍 逐段精读" in
imported/paste-2026-09-22-nils-van-der-poel.md — match its format, depth and tone.
Write that section for <imported/…md>, inserted after 📌 教学备注 and right before the ```svensk-export fence,
and add the 逐段精读 line at the end of 教学备注. Copy the Swedish verbatim (verify by script). Every sentence gets
📐 / ⚠️ / 🇨🇳. Grammar links only to existing knowledge_base/grammar/ notes as [[slug|📗<zh>]]; phrase links only
to existing phrases/ slugs; vocab 原形 = [[lemma]] (missing word notes are being created in parallel — fine).
Edit no other file; don't touch the export block. Reply: paragraphs/sentences, and links that don't exist yet.
```

**C. 复核者**（`subagent_type: general-purpose`）
```
You are a strict Swedish-grammar reviewer (native-level Swedish, fluent Chinese). Read
.claude/skills/sv-study-guide/SKILL.md §3 (判断准则). Review the "## 🔍 逐段精读" section of <files>.
Find REAL errors that would mislead a Chinese B1 learner: grammar claims, S/V/O/A labels, mistranslations,
lemma/POS/genus/inflection in vocab tables, Swedish that differs from "## 瑞典语原文". Ignore style.
Fix each with a minimal Edit inside the 逐段精读 section only. Reply: file · location · wrong → changed, plus a verdict.
```

## 5. 已知坑

- 阅读站匹配器**只读 Forms 段的第一张表**、从第 2 列读起：裸词形表必须排第一（någon / nöjd 的教训）。
- frontmatter 的 `synonyms/antonyms/family` 写裸 slug，写 `[[x]]` 会被 YAML 解析成嵌套列表。
- `-s` 回退会跳过形容词和大写词；`kallas`、`lyckas` 这类词要有自己的笔记才能点。
- 后台 agent 跑的时候 stop hook 会要求提交：可以提交已完成的文件作为检查点，正在写的文件不要提交。
