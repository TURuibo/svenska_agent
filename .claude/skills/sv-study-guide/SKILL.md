---
name: sv-study-guide
description: Paragraph-by-paragraph deep-reading guide (逐段精读) for a Swedish article in imported/ — splits it into paragraphs, analyses every sentence (structure, word order, tense, grammar points linked to KB notes), adds per-paragraph phrase + vocab tables, fills every vocabulary gap in the KB so all content words are clickable in the 📖 Läsning site, and adversarially verifies the result before publishing. Use whenever Ruibo says he can't follow an article, asks to "分段分析/逐句分析/精读/拆解" a text, complains that words in an article weren't looked up, or after a textbook QR article is imported (sv-textbook-qr §8). Do NOT use for a single sentence (swedish-grammar) or a single word (swedish-dictionary).
---

# sv-study-guide — 逐段精读 + 补词 + 复核

> 由 2026-10-01 Nils van der Poel 一篇沉淀而来（PR #142）。目标：Ruibo 读完一篇 B1 课文**每一句都看懂**、**每个实词都能点查**。

## 0. 为什么要这样做（四条经验）

| 经验 | 做法 |
|---|---|
| 只给全文翻译 + 词表 → 学习者"看得到中文但看不懂瑞典语" | 逐句给**结构**（S/V/O/A、⟨从句⟩）+ **为什么**（V2、bisats 语序、sin/hans、att 的两种用法…），不是只给译文 |
| "没给我查的词"大多不是生僻词，而是**基础词没笔记**（gå/gick、komma/kom）或**变形匹配不到**（skeptiska、tilläts、bosatte） | **先量化覆盖率**，用数据找缺口，而不是凭感觉挑生词 |
| 批量写的语言内容一定有错（Nils 篇 7 段里查出 1 错 + 7 处不准） | 发布前每段派**独立复核者**挑错，并核对匹配规则不会在**其他文章**里误配 |
| 手机是主要阅读端 | 用浏览器在 390px 宽度实测（溢出、卡片、报错） |

## 1. 量化缺口（先做，决定工作量）

```bash
node tools/build-reading-site.js
```
然后用 node 读 `site/reading/reading-data.js`，复刻 `reading.js` 的 `findVocab`（精确匹配 → 非大写且非形容词的 `-s` 回退 → `-aste`→`-ast`），
对文章「## 瑞典语原文」一节逐 token 统计：覆盖率 + 未覆盖词表。**同时检查**这篇的「学习项」计数 `itemTotal` 是否为 0（导出块格式问题）。

把未覆盖词分三类：
- **跳过**：人名地名、数字、纯功能词（och i på att som han det en ett till från med av för om men inte så då nu där…）。
- **建新笔记**：其余所有实词（含基础动词——强变化形式 gick/tog/kom 最容易卡住）、有实义的副词/连词（utan、även、ännu、därpå、eftersom、istället…）。
- **补已有笔记**：有笔记但变形没进 Forms 表 → 补行；同形异义（kort 卡片/短的、toppen 太棒/顶峰、inför≠införa）→ 另建 `<lemma>-adjektiv` 之类笔记或修 zh。

## 2. 建笔记（多 librarian 并行，**按 slug 不相交切分**）

- 词按词性/字母切成 3–4 批，各交一个前台或后台 `sv-librarian`；词组单独一批。切分必须**不相交**，并告诉它们只动自己清单里的文件。
- **Forms 表硬性要求**：Swedish 列每格**一个裸词形**（`gick`，不是 `han gick`、不是 `gick/gått`）；动词含 s-被动（`krävs/krävdes`）、名词含用到的属格（`livs`、`årets`）、形容词含 `-aste`。
- 匹配器**只读 Forms 段里的第一张表**、且只读第 2 列起：若笔记有「form | 例句/语境」说明表，裸词形表必须放在它**前面**（2026-10-01 någon/nöjd 教训）。
- frontmatter 的 `synonyms/antonyms/family` 写裸 slug，不要写 `[[x]]`（YAML 会解析成嵌套列表）。
- 第一个例句 = 文章原句 + 中文；`用法提示` 末尾 `来源: [[source-…]]`。
- 新语法点（文中出现但 KB 没有的）自己写 `grammar-*` 笔记（如 `grammar-hade-ellips`、`grammar-satsflata`）。

## 3. 写精读（插在教学备注之后、`svensk-export` 块之前）

```markdown
## 🔍 逐段精读 (Stycke för stycke)

💡 读法：先读瑞典语段落 → 一句句看「📐 结构」和「⚠️ 要点」→ 最后看 🇨🇳。…
💡 符号：**S** 主语 · **V** 限定动词 · **O** 宾语 · **A** 状语 · ⟨…⟩ 从句。

### ¶1 · <小标题>（N 句）

<该段瑞典语原文，一字不改>

🇨🇳 <该段译文>

#### 🔍 逐句拆解

**① <句子原文>**

- 📐 `<成分>`(S) + `<动词>`(V) + …；从句用 ⟨…⟩
- ⚠️ <要点：为什么这样> → [[grammar-…|📗中文名]]
- 🇨🇳 <贴近原文的译文>

#### 🧩 词组
| 词组 | 意思 | 本段用法 |

#### 📚 生词
| 文中形式 | 原形 | 词性 | 中文 | 说明 |
```

渲染约定（`site/reading/reading.js` 已支持）：`##` 标题含「精读」→ 其下每个 `###` 变成可折叠卡片 + 「全部展开」按钮；以 `🇨🇳` 开头的行按译文层显示；`[[slug|标签]]` 显示标签。
**不要**用 `>` 引用块（渲染器不支持）；标题里别出现「翻译/译文/中文」（会被当成译文层）。

必讲的高频点（出现就讲，链到已有笔记）：V2/倒装（[[grammar-inversion-efter-fundament]]）、从句里 inte 在动词前（[[grammar-bisats-ordfoljd]]）、sin vs hans（[[grammar-sin-sina]]）、两种 att、介词 + att + 不定式、s-被动/deponens、pluskvamperfekt / 从句省 hade、小品词动词被拆开、双重限定 / 属格后名词不加词尾、indirekt fråga 的 om/vad、强变化动词形式。
**判断要准**：`det är något som…` 若 det 指代前文就**不是** klyvning；不确定的用法（att 可省/不可省）说"可省"而非"不加"。

生词表「原形」列链接的 slug 必须存在（写完用脚本逐个核对）。导出块（`# words` / `# phrases` / `# grammar`）补入新建条目，source 笔记补 `words:/phrases:/grammar:` 列表。

## 4. 复核（发布前必做）

- 每段派一个**独立复核 agent**（只读），任务：找会误导学习者的错误（语法判断、成分标注、译文、原形/词性/变形、原文是否逐字一致），返回 `old_text → new_text`。只改真错误和明显不准，不改风格。
- 若改了 `tools/build-reading-site.js` / `reading.js` 的匹配规则：新旧构建对比**全部 147 篇**——新增词形清单 + 回退命中清单逐条审误配；各文章 `counts` 只允许原来为 0 的变化。
- 浏览器（Playwright，`executablePath: /opt/pw-browsers/chromium-1194/chrome-linux/chrome`）390px 宽打开文章：`scrollWidth == 390`、卡片数 = 段数、无 pageerror。注意 hash 路由要 `reload()` 才切文章；`pkill -f` 的模式别和当前命令行重名（会杀掉自己）。

## 5. 收尾

`node tools/build-kb-site.js`（更新 slugs.json）→ `git add knowledge_base/ imported/ …` → commit → push → 用户要求时开 PR + squash merge（交互会话默认不开 PR，见 CLAUDE.md §4.7）。
回复用表格：做了什么 / 覆盖率前后 / 复核查出并修正了什么 / 还剩什么。
