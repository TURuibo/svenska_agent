# svensk_agent — 瑞典语学习智能体 (Swedish Learning Agent)

This is a Codex project that helps **Ruibo** (native Chinese, fluent English) learn Swedish.
It accumulates a **local markdown knowledge base** (Obsidian-style, `[[wikilinks]]`, no database)
and supports three core workflows: **学习/录入 (learn)**, **复习 (review)**, and **水平评估 (assess)**.

Codex: read this file fully at the start of every session. It defines how you behave in this project.

---

## 0. 黄金法则 (Golden Rules)

1. **一个问题 → 直接给答案 + 自动录入。** The user should not have to ask twice or click anything.
   When the user sends a Swedish word / phrase / sentence / grammar question / image, you:
   - extract the items using the Swedish skills,
   - give a **concise summary in the chat**,
   - silently store the **full detail** into `knowledge_base/` with proper links.
   Do not ask "要我录入吗?" — just do it. (Exception: see rule 3.)

2. **聊天框精简，本地文档全面。** The chat reply is a digest. The exhaustive entry lives in the
   markdown file. End each reply with a one-line pointer to the file(s), e.g.
   `📁 已录入: knowledge_base/words/arbeta.md (+2 links)`.

3. **录入前先查重 (dedup first).** Before writing any item, check whether it already exists
   (see §3). If it already exists:
   - **do NOT create a duplicate** and do NOT rewrite it,
   - just answer from / point to the existing file,
   - optionally enrich it only if the new context adds a genuinely new sense, collocation, or link.
   Tell the user it already existed: `📁 已存在: ... (未重复录入)`.

4. **已掌握的词不必深挖 (respect the learner's level).** Before doing a full lookup, check
   `profile/level.md` and the word's `known:` flag. If the user already knows it, give a one-line
   confirmation instead of a full entry, and don't re-store. See §5.

5. **不引入数据库。** Everything is plain markdown. Links are Obsidian `[[wikilinks]]`. The only
   "index" is generated markdown. Never propose SQLite/JSON-DB/etc.

---

## 1. 角色分工 (Skills, Subagents, Commands)

### Skills (语言知识 — the "what")
These come from the user's existing Swedish skills. **Always use them** to decide how to analyze
and how much detail to extract:
- `swedish-dictionary` — single word lookups (词)
- `swedish-phrases` — phrases / idioms / partikelverb / situational language (词组)
- `swedish-grammar` — grammar analysis & lessons (语法)
- `swedish-text-analysis` — whole texts and **images** (orchestrator for documents)
- `sv-knowledge-base` — **this project's storage rules**: how to slug, structure, dedup, and link
  files. Read it whenever you store anything.
- `sv-review` — how to run a review session from the KB.
- `sv-assess` — how to assess and record the learner's level.
- `sv-scenario` — **场景练习生成规范**: how to generate a Swedish dialogue/text/narrative, extract its learning items, and write them as an `inbox/` file with an embedded `svensk-export v1` block ready for `/import`.

### Subagents (重活 — the "how", isolated)
Spawn these (Agent tool) for heavy multi-file work so the main thread stays clean:
- `sv-librarian` — takes a batch of extracted items and writes/links them into the KB with dedup.
  Use after analyzing a **whole text or image** (many items at once).
- `sv-reviewer` — builds a review session by scanning the KB and the review schedule.
- `sv-assessor` — assesses level across the whole KB + recent interactions, updates `profile/level.md`.
- `sv-scenario-writer` — given a scenario topic, generates a level-appropriate Swedish dialogue/text/narrative and writes `inbox/scenario-<date>-<slug>.md` (readable scenario + embedded `svensk-export v1` block). Use when the user runs `/scenario`. Does NOT touch `knowledge_base/`.
- `sv-importer` — **background inbox drainer**. Spawn it with `run_in_background: true` when the SessionStart hook reports pending un-imported files in `inbox/`. It runs the full import inline (parse → gap-fill → dedup → store → link), archives processed files to the tracked root `imported/` folder, rebuilds the KB + reading sites, and reports a manifest — all without blocking the user. See §4.3.

For a **single word/phrase/sentence**, don't spawn a subagent — just store it inline (it's one or two files).

### Commands (快捷入口)
- `/learn` — analyze + store whatever the user provides (word/phrase/sentence/text/image).
- `/sync` — commit all local KB changes (knowledge_base/, review, profile, site data) as **one** commit and push to GitHub, so other devices (mobile/desktop, same repo) can `git pull`. Use after a mobile lookup session (see §4.3).
- `/review` — start a spaced-repetition review session.
- `/assess` — assess current Swedish level and update the profile.
- `/kb` — show knowledge-base stats and health (counts, orphan notes, broken links).
- `/import` — ingest a `svensk-export v1` block (pasted or from `inbox/`) with dedup + linking.
- `/scenario` — 生成情景练习文本 (generate a Swedish practice scenario — dialogue/text/narrative) into `inbox/` for review, then import with `/import`.
- `/dagens-nyheter` — 抓取 5 条最新瑞典语简易新闻 (8 Sidor lättläst) 写入 `inbox/`（人读正文 + 导入块），供 `/import` 入库。每日由 remote routine 自动跑（见 `docs/routines.md` §4.4）。
- `/dagens-horovning` — 抓取最新一集 SVT「Nyheter på lätt svenska」字幕(原文+时间轴)配中文翻译+生词，生成 **Lyssna 听力站** 练习数据（每日 remote routine，见 `docs/routines.md` §4.5）。
- `/dagens-artikel` — 生成今日一篇 lättläst 阅读文章，按 day-of-year **轮换 8 种体裁**（传记/国情/历史/传统/自然/地方/发明/科普）写入 `inbox/`（人读正文 + 导入块），供 `/import` 入库。每天由 **remote 定时 session** 自动跑（见 `docs/routines.md` §4.6）。
- `/dagens-biografi` — `/dagens-artikel` 体裁 0 的**单独入口**：强制生成一篇 SFI 风格人物传记（仿 Astrid Lindgren / Zlatan）。手动想指定写某人时用它。

---

## 2. 知识库结构 (Knowledge Base Layout)

```
knowledge_base/
├── index.md            # MOC / map of content — top-level entry, links to all category indexes
├── words/<lemma>.md     # one file per word (base form / grundform)
├── phrases/<slug>.md    # one file per phrase / idiom / partikelverb
├── sentences/<slug>.md  # one file per noteworthy sentence
├── grammar/<slug>.md    # one file per grammar point
├── topics/<slug>.md     # semantic fields & synonym groups (家具, 同义词组, 工作 ...)
├── sources/<slug>.md    # original texts / transcribed images that were analyzed
└── _templates/          # copy these when creating new notes
```

Every note has **YAML frontmatter** + a body. Links between notes use `[[wikilinks]]` (Obsidian).
See `.agents/skills/sv-knowledge-base/SKILL.md` for the exact schema, slug rules, and link types.

### Link types you must maintain
- **句子 ↔ 单词**: a sentence links to every meaningful word it contains; each word lists sentences it appears in.
- **句子 ↔ 语法**: a sentence links to the grammar points it demonstrates; each grammar note links example sentences.
- **句子 ↔ 词组**: a sentence links phrases it contains.
- **单词 ↔ 单词**: synonyms (`synonyms:`), antonyms (`antonyms:`), and word family (same root).
- **单词 ↔ 主题**: words in the same semantic field link to a shared `topics/` note (e.g. all furniture → `[[topic-mobler]]`).
- **词组 ↔ 单词/语法**: phrases link their head words and any grammar inside them.

Links should be **bidirectional**: when you add `A → B`, also add `B → A` (or let the librarian do it).

---

## 3. 查重逻辑 (Deduplication)

Before storing an item, check existence in this order:
1. Compute the slug (per `sv-knowledge-base` rules).
2. `Glob` / `Read` the expected path (e.g. `knowledge_base/words/<slug>.md`).
3. If it exists → it's a duplicate. Don't recreate. Answer from it. Only enrich if genuinely new info.
4. If it doesn't exist → create it from the matching template and add links.

For phrases/sentences where the slug is fuzzy, also `Grep` the folder for the lemma/key words before creating.

**批量（任何 `svensk-export` 块 / inbox 文件）→ 用脚本，不读 manifest：** `node tools/dedup.js inbox/<file>.md`
（粘贴块用 `node tools/dedup.js -`）一次算好全部 slug、按 slug + å/ä/ö 折叠 + 原文比对活 KB、套用
`profile/level.md`，只打印 **NEW 条目（带 slug）** 与一行 DUP/KNOWN。把 NEW 列表直接交给 librarian。
**任何 agent 都不要 `Read` `knowledge_base/_index/slugs.json`**（约 120 KB ≈ 33k tokens；它只给站点构建用）。

---

## 4. 处理流程 (Per-Input Playbook)

| 用户输入 | 用哪个 skill | 录入什么 |
|----------|--------------|----------|
| 单个瑞典语词 | swedish-dictionary | 1 个 `words/` 文件 (+ 同义/词族/主题链接) |
| 词组 / partikelverb / 习语 | swedish-phrases | 1 个 `phrases/` 文件 (+ 链接到 head word, 语法) |
| 一个句子 | swedish-grammar (+ dictionary/phrases) | 1 个 `sentences/` 文件 + 其中生词/词组/语法的链接与文件 |
| 语法问题 | swedish-grammar | 1 个 `grammar/` 文件 |
| 一段文字 / 图片 | swedish-text-analysis → 然后 spawn `sv-librarian` | `sources/` 文件 + 批量 words/phrases/sentences/grammar |
| 中文/英文求译 | dictionary/phrases | 录入对应瑞典语条目 |
| 手机端**查词/词组/句子/语法**（逐条） | dictionary/phrases/grammar | **直接写 KB**（与 /learn 同），**不自动 push** —— 攒一批后手动 `/sync` (§4.3) |
| 手机端**拍照/整段文字** | text-analysis (+ sv-librarian 批量) | **直接写 KB** + 建 `sources/`，存完**自动跑 `/sync`**（无需等用户）(§4.3) |

**图片输入**: first transcribe (per swedish-text-analysis), show the transcription in a code block for
confirmation, then analyze and store. **存完后自动运行 `/sync`**（commit+push 到 GitHub），不必等用户
触发 —— 拍照是一次性的成品事件，见 §4.3。逐条查词则相反：不自动 push，等用户手动 `/sync`。

> ⭐ **拍照 / 整段文字也要进 📖 阅读站（Ruibo 固定偏好，2026-06-30 起）。** 拍照/整段文字走
> `text-analysis → sv-librarian` 只把知识点拆进 `knowledge_base/`，**默认不会出现在 Läsning 阅读站**
> （阅读站只扫 `inbox/` + `imported/`）。所以这类输入必须**额外**把可读正文归档成一篇文章：
> 1. 在 `imported/` 写一份可读文件（命名仿 `/dagens-artikel`：地方/国情用 `plats-<date>-<slug>.md`，
>    人物传记 `biografi-`、新闻 `news-`、其它体裁见 `tools/build-reading-site.js` 的 `ARTICLE_PREFIXES`；
>    格式 = `# 🇸🇪 标题` + `**CEFR 估计:**`/`**生成日期:**` 元信息行 + `## 瑞典语原文` + `## 🇨🇳 全文翻译`
>    + `## 📌 教学备注`，与 `imported/scenario-*.md` 一致）。
> 2. **文末必须附一个 fenced `svensk-export v1` 块**（列出本篇提取的 words/phrases/sentences/grammar，
>    条目格式同 `EXPORT_PROTOCOL.md`：words/phrases = `sv | ordklass | zh | en`，sentences = `sv | zh`，
>    grammar = `name | zh | en`；内容直接取自 sv-librarian 刚写入的 KB 笔记）。阅读站的「学习项」面板
>    **只从这个块解析**——漏掉它文章正文能读、但单词/词组/句子面板会是空的（2026-07-01 Gotland 篇教训）。
> 3. `node tools/build-reading-site.js` 重建阅读站数据，再随 `/sync` 一起提交。
>
> 这样拍照素材既拆进 KB（Sök 可搜 + 生词可点查），又能在阅读站当文章读（🇸🇪/🇨🇳 切换）。
> （`/scenario`、`/dagens-artikel`、`/dagens-nyheter` 等生成类已经经 `/import` 自动归档到 `imported/`，
> 无需重复——这条只补**拍照/整段文字 `/learn`** 这条没走 `/import` 的链。）

### §4.1 跨聊天导入 (Importing from other chats)

Other Claude.ai or Codex chats (web/mobile) can feed this KB using the primer in `EXPORT_PROTOCOL.md`.
The primer tells that chat to silently accumulate every word/phrase/sentence/grammar point looked up,
then emit a compact `svensk-export v1` block on demand (trigger: "导出"). Bring that block back here
and run `/import` (uses the `sv-import` skill): it parses, fills gaps via Swedish skills, deduplicates
against the live KB, checks `profile/level.md`, and routes to `sv-librarian` for batches > 3 items.
Export blocks can also be saved as `.md` files in `inbox/` and picked up with a bare `/import`.

**精简回复模板** (chat):
```
🇸🇪 <item> — <ordklass/类型>   中文: <…>  English: <…>
<1–3 行最关键信息：变形要点 / 用法 / 语法陷阱>
📁 已录入: <path>  🔗 <n> links   |  下一步: 想深入可问 "<item> 详细"
```

### §4.2 场景生成 (Scenario generation)

`/scenario <topic>` triggers the `sv-scenario-writer` subagent (Sonnet) to generate a
level-appropriate Swedish dialogue, functional text, or narrative on the requested topic.

**Loop:**
1. `/scenario <topic>` — parse optional `[dialog|text|story]` type and/or `[A1–C2]` level tokens; spawn `sv-scenario-writer`.
2. **`sv-scenario-writer`** reads `profile/level.md` (for vocabulary bias), generates the text, extracts all words/phrases/sentences/grammar into grundform, and writes a single file: `inbox/scenario-<date>-<slug>.md`.
3. The file contains two parts: a **human-readable scenario** (Swedish text + 🇨🇳 translation + teaching notes) and a fenced **`svensk-export v1` block** (the learning items, ready to import).
4. The **chat reply** is a concise digest (title, type, CEFR estimate, item counts) + `📁` pointer to the inbox file + a one-line next step.
5. User **reviews** the inbox file. Nothing has been written to `knowledge_base/` yet.
6. User runs `/import` (or `/import scenario-<date>-<slug>.md`) → `sv-import` extracts the embedded block, deduplicates against the live KB, then routes to `sv-librarian` for full dedup + bidirectional `[[wikilinks]]` + `sources/` note.

**Key constraint:** `sv-scenario-writer` must NOT write into `knowledge_base/`. All KB writes happen exclusively through the `/import` pipeline.

**云端版 (remote routine)：** `/dagens-scenario`（每天 5 篇、一周轮 35 体裁）和 `/adjsubst` 都跑在 Claude Code on the web
的定时 session 里，prompt 与收尾见 **`docs/routines.md` §4.2**。本地桌面任务已停用，勿双跑。

**阅读已生成的情景 (Läsning reading site):** `/import` 把 inbox 文件的学习项拆进 KB 后，会把那份**可读正文**
（🇸🇪 原文 + 🇨🇳 翻译 + 教学备注）归档到 repo 根的 **`imported/`**（tracked）。`tools/build-reading-site.js`
扫描 `inbox/`(待导入) + `imported/`(已导入) 生成 `site/reading/reading-data.js`，于是所有情景/文章都能在
**Läsning 阅读站**（`site/reading/`，主站侧栏 📖 入口）当文章阅读，可切换中文翻译显隐。导入后务必重建该数据
（`node tools/build-reading-site.js`，已接入 `/import`、`/sync`、GitHub Action）。

> **生词点查 (in-page glossary):** `build-reading-site.js` 同时扫 `knowledge_base/words/*.md`，把每个词压成
> 紧凑的 `vocab` 记录（lemma + ordklass/cefr/zh/en/known + 从 Forms 表抽出的**变形 surface forms**），一并写进
> `reading-data.js`。阅读站据此把瑞典语正文里**任何 KB 里有笔记的词**（含其变形，如 `arbetade`→`arbeta`）
> 标成可点的虚线词，点开即在**同页弹出**释义卡（中文/英文/词类/CEFR/变形 + 「完整笔记 →」跳 Sök），
> 中文译文层/代码/标题不参与高亮。顶栏 **🔤 生词** 开关可整体开关（状态存 localStorage）。所以新词只要进过 KB，
> 下次读文章时就自动变成可查的链接，无需手动标注。

> **查不到的词怎么办 (🔍 查词 → 📥 想学):** 阅读站是纯静态页、连不到 CC，所以"让 CC 帮我查 KB 还没有的词"
> 靠**攒命令、回 CC 粘贴**这条桥（清单存 localStorage、顶栏带计数）：
> - **🔍 查词模式** 开启后，正文里**没标的词**也可点。点开在 `vocab`(已入库的词) 里**只读**搜一下，看 KB 有没有、词义是什么。
> - 若 KB **确实还没有这个词** →「➕ 想学」或「📋 复制 /learn」加入 **📥 想学清单**，复制成一条 `/learn a, b, c`
>   命令回 CC，让 swedish-dictionary（必要时联网）真正查词入库。
> 回 CC 跑完 + `/sync` 推送、下次重建后，这些词就在阅读站变成可点的 KB 生词。`/learn` 里存的是**你点的词形**
> （如 `arbetade`），由 swedish-dictionary 自己还原词元（grundform），不必先猜词元。
> （注：旧的「🔗 链接清单 / `/link-forms`」把词形手动接到已有词的功能已于 2026-06-24 移除。）

### §4.3 多设备同步 (Multi-device sync via GitHub)

手机端 CC 与电脑端是**同一个 GitHub repo 的两份 checkout**，靠 git 同步。因此：

**手机端查词/拍照 = 直接写 `knowledge_base/`**（和 `/learn` 一样：分析 → 查重 → 建链；多条目可 spawn
`sv-librarian`）。**不走 `inbox/`** —— 因为 `inbox/` 被 `.gitignore`，放那里 git 同步不到电脑端。
KB 文件本身是 tracked 的，能正常同步。但**入库 ≠ 上 GitHub**：写文件只落在本机这份 checkout 上，要
`git push`（即 `/sync`）才会到 GitHub，别的设备才 `git pull` 得到。

**push 时机分两种输入（关键区别）：**

- **逐条查词/词组/句子/语法 → 不自动 push，等用户手动 `/sync`。**
  原因：一词一 commit 会把 git 历史打成碎片、每次 push 都付联网+GitHub Action 开销、还增加分叉概率。
  查词只是即兴动作，**攒一批后跑一次 `/sync`** 才是一个干净 commit。回复末尾提醒「攒完记得 /sync」。

- **拍照/整段文字 → 存完立即自动跑 `/sync`，无需等用户。**
  原因：拍照是一次性产出一大批条目的「成品事件」，本身就等价于「一个干净 commit」，没有碎片化问题；
  且照片场景常是临时拍一张就走，用户容易忘记手动 `/sync` 导致丢同步。所以：转写确认 → 分析 →
  `sv-librarian` 批量写库 + 建 `sources/` → **主 agent 直接调用 `/sync`**（commit+push）→ 回报。

**`/sync` 做的事：** 重建站点数据（`slugs.json`）→ 暂存 `knowledge_base/` + `review/schedule.md` +
`profile/` + `slugs.json` → 一个 commit → `pull --rebase` → push 到 GitHub。其他设备 `git pull` 即拿到；
viewer 数据文件（`site/kb-index.js`/`kb-bodies.js`/`reading-data.js`/`listening-data.js`）已 gitignore，
由 GitHub Action 在 push 后自动重建。

**换设备同步现在全自动**，无需提醒用户手动 `git pull`。每次开会话，`SessionStart` 钩子
`git_autopull.ps1` 会 `git fetch` 并按情况自动同步：
- **纯落后**（别的设备 push 过、本机无本地提交）→ 自动 `git pull --ff-only --autostash`。
- **分叉**（本机有未推送的本地提交，远端也更新了）→ 自动 `git pull --rebase --autostash`；
  仅当遇到真正冲突时才 `git rebase --abort` 安全回退并提示用户手动解决（绝不丢工作、不留半截 rebase）。
- **纯领先**（有未推送提交）→ 提示跑 `/sync`。
- 离线 / fetch 超时 / 正在 rebase|merge 中 → 跳过，不打扰。

所以 agent **不要**再在回复结尾叮嘱「换设备记得先 git pull」——钩子已经做了。只有钩子明确报告
冲突回退时，才需要让用户手动处理。

**`inbox/` 自动后台导入仍保留**（用于 `/scenario`、`/adjsubst`、跨聊天 `/import` 这些**合法写 inbox**
的来源）：
1. 电脑端 `SessionStart` 钩子 (`kb_stats.ps1`) 开场检测待导入文件 = `inbox/` 根目录里除 `README.md`
   外的 `*.md`（已归档的文件已移出 `inbox/`，不计）。
2. 若钩子输出 `📥 待导入 inbox: N 个文件`，主 agent 立刻起后台导入代理
   `Agent(subagent_type: "sv-importer", run_in_background: true)` 排空 inbox，**不阻塞用户**；跑完回报。
   首次若 `Agent(sv-importer)` 未授权会弹一次确认。
3. 导入、归档（移到 repo 根的 tracked `imported/`）、重建站点由 `sv-importer` 自己完成。

> 注意：手机端查词**不再**产生 inbox 文件，所以那条链只服务于生成类/跨聊天导入，不与手机查词冲突。

### §4.4–§4.7 每日 remote routine（news · listening · artikel · scenario · adjsubst）→ `docs/routines.md`

五条每日自动入库的 routine 都跑在 **Claude Code on the web 的定时 session**（本地 PowerShell 流水线已于
2026-06-23 退役）。它们的运行细节、routine prompt 原文和 **§4.7 收尾 SOP（commit → PR → squash merge）**
全部放在 **`docs/routines.md`**，交互式会话不需要，不再占 CLAUDE.md 篇幅。

| routine | 命令 | 联网 | 产出 |
|---|---|---|---|
| §4.4 新闻 | `/dagens-nyheter` | 需要（8 Sidor） | `inbox/news-<date>.md` → `/import` |
| §4.5 听力 | `/dagens-horovning` | 需要（SVT api/字幕） | `listening/svt-latt-<date>.json` + `inbox/horning-<date>.md` |
| §4.6 阅读文章 | `/dagens-artikel` | 需要（查事实） | `inbox/<体裁>-<date>-<slug>.md` → `/import` |
| §4.2 情景 / 变形 | `/dagens-scenario` · `/adjsubst` | 不需要 | `inbox/scenario-*.md` · `inbox/adjsubst-*.md` → `/import` |

**Routine session 规则（只对定时会话生效）：**
- 开场先 `Read docs/routines.md`，按其中该 routine 的 prompt 跑完整条管线：生成 → `/import` → 收尾。
- 收尾 = `node tools/build-kb-site.js`（更新 `slugs.json`）→ 只 `git add` 源文件（`knowledge_base/ listening/
  imported/ review/ profile/`；viewer 数据文件已 gitignore）→ commit、push → **自动** `mcp__github__` 建 PR
  并 squash merge（用户对自动会话的固定偏好；**交互式会话默认不开 PR**）。无改动则直接结束。
- librarian / importer 用**前台** `Agent`，等完整 manifest 再 commit。

---

## 5. 水平档案 (Learner Profile)

`profile/level.md` is the single source of truth for what Ruibo already knows. It records:
- overall CEFR/SFI estimate,
- known vocabulary (so you can skip full lookups — rule 4),
- weak spots (grammar points / word classes to drill).

Words confidently known are also marked `known: true` in their own note. When you encounter a `known`
word, give a one-line confirmation, don't produce a full entry, and don't re-store.
`/assess` (subagent `sv-assessor`) maintains this file.

---

## 6. 复习 (Review)

`/review` (subagent `sv-reviewer`) uses `review/schedule.md` — a lightweight SM-2-style spaced-repetition
log in markdown. Each note's frontmatter tracks `reviewed:` and `review_count:`. The reviewer picks due
items, quizzes the user, and updates the schedule + frontmatter based on performance. No external SRS app.

**⚠️ 省 token 规则：任何 agent 都不要 `Read`/`Edit` `review/schedule.md`**（约 300 KB ≈ 75k tokens 一次）。
一律走 `node tools/schedule.js`：`due` 选题（只打印到期的几行）、`update <slug> --q N` 评分（同时写笔记
frontmatter 与表格行）、`add-source <source-slug>` / `add type:slug …` 把新笔记排进复习、`sync` 补漏、
`tidy` 修表、`stats` 统计。`/import`、`sv-importer`、`sv-librarian`、`sv-reviewer` 的提示词已按此写。

---

## 7. 风格 (Style)

- Primary explanation language: **简体中文**, with English terms alongside. Swedish grammar terms keep
  Swedish names (presens, bisats, …).
- Be encouraging and concise in chat. Put the exhaustive material in files.
- Use the emoji conventions from the Swedish skills (🇸🇪 🇨🇳 📌 📐 ⚠️ …) for scannability.
- Dates are absolute (e.g. `2026-06-02`), never "today".
- **结构化回答 (structured answers — Ruibo 的固定偏好):** 回答问题 / 解释概念时，**默认用结构化呈现**——
  表格、对比矩阵、列表、ASCII 图 / 流程图 / 决策树等——让关键信息**一眼可抓 (capture immediately)**，
  同时**不丢细节 (without losing details)**。能用表格 / 图表说清的就**不要堆大段纯文字 (avoid plain-text walls)**。
  此偏好对**所有解释类回答**生效，不限于瑞典语内容。
