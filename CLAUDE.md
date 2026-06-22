# svensk_agent — 瑞典语学习智能体 (Swedish Learning Agent)

This is a Claude Code project that helps **Ruibo** (native Chinese, fluent English) learn Swedish.
It accumulates a **local markdown knowledge base** (Obsidian-style, `[[wikilinks]]`, no database)
and supports three core workflows: **学习/录入 (learn)**, **复习 (review)**, and **水平评估 (assess)**.

Claude: read this file fully at the start of every session. It defines how you behave in this project.

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
- `/dagens-nyheter` — 抓取 5 条最新瑞典语简易新闻 (8 Sidor lättläst) 写入 `inbox/`（人读正文 + 导入块），供 `/import` 入库。每日由 routine `svensk-news-daily` 自动跑（见 §4.4）。
- `/dagens-horovning` — 抓取最新一集 SVT「Nyheter på lätt svenska」字幕(原文+时间轴)配中文翻译+生词，生成 **Lyssna 听力站** 练习数据（见 §4.5）。
- `/dagens-artikel` — 生成今日一篇 lättläst 阅读文章，按 day-of-year **轮换 8 种体裁**（传记/国情/历史/传统/自然/地方/发明/科普）写入 `inbox/`（人读正文 + 导入块），供 `/import` 入库。每天由 **remote 定时 session** 自动跑（见 §4.6）。
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
See `.claude/skills/sv-knowledge-base/SKILL.md` for the exact schema, slug rules, and link types.

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

### §4.1 跨聊天导入 (Importing from other chats)

Other Claude.ai chats (web/mobile) can feed this KB using the primer in `EXPORT_PROTOCOL.md`.
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

**阅读已生成的情景 (Läsning reading site):** `/import` 把 inbox 文件的学习项拆进 KB 后，会把那份**可读正文**
（🇸🇪 原文 + 🇨🇳 翻译 + 教学备注）归档到 repo 根的 **`imported/`**（tracked）。`tools/build-reading-site.js`
扫描 `inbox/`(待导入) + `imported/`(已导入) 生成 `site/reading/reading-data.js`，于是所有情景/文章都能在
**Läsning 阅读站**（`site/reading/`，主站侧栏 📖 入口）当文章阅读，可切换中文翻译显隐。导入后务必重建该数据
（`node tools/build-reading-site.js`，已接入 `/import`、`/sync`、GitHub Action）。

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

**`/sync` 做的事：** 重建站点数据 → 暂存 `knowledge_base/` + `review/schedule.md` + `profile/` +
`site/kb-data.js` → 一个 commit → `pull --rebase` → push 到 GitHub。其他设备 `git pull` 即拿到；
`site/kb-data.js` 也会由 GitHub Action 在 push 后自动重建。

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

### §4.4 每日新闻 (Daily news — 5 条 8 Sidor lättläst)

每天早上自动抓取 **5 条最新瑞典语简易新闻**（来自 **8 Sidor** —— Sveriges Radio 的 lättläst
nyheter，句子短、词汇基础，天生贴近 A2–B1 学习者），当学习素材入库。与 `/scenario`、`/adjsubst`
是**同一套 headless 流水线**（见 §4.3、[[daily-scenario-automation]]、[[daily-adjsubst-automation]]）。

**三个部件：**
- `/dagens-nyheter [YYYY-MM-DD]` — 命令 `.claude/commands/dagens-nyheter.md`：用 `WebFetch`/`WebSearch`
  抓 8 Sidor 最新 5 条，写成「可读新闻摘要 + `svensk-export v1` 导入块」存入 `inbox/news-<DATE>.md`。
  不碰 `knowledge_base/`。新闻为真实抓取，**不得编造**。可读正文底部固定附一行 **SVT Nyheter på lätt
  svenska** 听力链接（`svtplay.se/nyheter-pa-latt-svenska`，简易瑞典语新闻视频）——只是配套听力资源，
  写死、不进 KB、不参与抓取。（SVT 那档是**视频**汇总，无法逐条抓文字，所以抓取链路仍只用 8 Sidor。）
- `scripts/daily-news.ps1` — 包装脚本：算好日期传给命令，调 headless `claude -p`，**allowedTools 含
  `WebSearch,WebFetch`**（新闻需要联网抓取）。产出后调共享助手 `scripts/import-and-rebuild.ps1`
  → headless `/import` → `node tools/build-kb-site.js` → 归档到 `imported/` → push，最后弹 Windows toast。
  模型默认 `claude-opus-4-8`；含 emoji/中文，存为 **UTF-8 BOM**（PS 5.1 坑，同 scenario）。日志 `scripts/news-run.log`。
- 触发器：Claude Code scheduled task **`svensk-news-daily`**，cron `30 7 * * *`（实际 ~07:3x，有 jitter）。
  routine prompt = 「跑 `scripts/daily-news.ps1` 然后读 `scripts/news-run.log` 末尾报告」。管理同其它 routine：
  `list_scheduled_tasks` / `update_scheduled_task` / 侧栏「Scheduled」。**只在 Claude 桌面应用开着时准点跑**，关着下次启动补跑。

所以新闻和 scenario/adjsubst 一样**全自动入库**，用户只剩 `/review`。

### §4.5 听力练习 (Listening — SVT lätt svenska)

**`/dagens-horovning [svt-video-id]`** 抓取 **SVT「Nyheter på lätt svenska」**(简易瑞典语新闻**视频**，
工作日 ~17:15 约 4.5 分钟)的**字幕原文 + 时间轴**，配**逐句中文翻译**和**生词表**，生成一集听力数据，
供在 **Lyssna 听力站** 里盲听/精听/跟读/单句循环/倍速练习。命令 `.claude/commands/dagens-horovning.md`。

**数据链(全部经 SVT 官方接口，真实抓取、不编造）：**
1. 节目页 `svtplay.se/nyheter-pa-latt-svenska` → 最新一集 video id。
2. `api.svt.se/video/<id>` → HLS `.m3u8` 流 URL + 瑞典语 WebVTT `.vtt` 字幕 URL + `contentDuration`。
3. WebFetch `.vtt` → 逐句字幕(带时间轴) → 我配中文翻译 + 10–15 生词 → 写 `listening/svt-latt-<DATE>.json`。
4. `node tools/build-listening-site.js` 扫 `listening/*.json` → `site/listening/listening-data.js`。

**站点 `site/listening/`(主站侧栏 🎧 Lyssna 入口)**：`index.html` + `listening.js` + `listening.css`。
用 **hls.js**(CDN)播放 SVT 的 HLS 流(已验证 SVT 的 akamai CDN 回 `Access-Control-Allow-Origin: *`，
Chrome/Edge 可跨域播放；Safari 走原生 HLS)。功能：逐句字幕**点击跳转 + 播放时自动高亮跟随**、
🇸🇪 原文 / 🇨🇳 翻译显隐(盲听 = 隐藏原文，仅当前句揭示)、🔁 单句循环、0.75/1/1.25× 倍速、生词卡。

**每日自动抓取(routine)：** `scripts/daily-listening.ps1`(UTF-8 BOM)headless 跑 `/dagens-horovning`
(allowedTools 含 `WebSearch,WebFetch,Bash`)→ 重建听力数据 → 有新一集则 `tools/sync-kb.ps1` push → Windows toast。
触发器 = Claude Code scheduled task **`svensk-horning-daily`**，cron `30 18 * * *`(SVT ~17:15 播完后)。日志 `scripts/listening-run.log`。
`tools/sync-kb.ps1` 已把 `listening/` + `site/listening/listening-data.js` 纳入重建与暂存，所以 `/sync` 也会带上听力数据。

**只存元数据 + 我生成的译文/生词**：音频、字幕**实时从 SVT CDN 取**，不下载、不转存(版权安全)。
媒体 URL 仅在该集可看期(~1 周)内有效，过期后站点提示并回退到「📺 在 SVT Play 看」。

> 注意：`listening/` 与 `site/listening/` 都是 **tracked**(不像 `inbox/` 被 gitignore)，随 git 正常多设备同步。
> SVT 那档是**视频**、没有逐条文字页面，所以它**只做听力**；抓**文字入库**的每日新闻仍走 8 Sidor(§4.4)——两条线分工不冲突。

### §4.6 每日 lättläst 阅读文章 (Daily reading article — 轮换体裁，**跑在 remote**)

每天生成一篇 **SFI 风格的瑞典语 lättläst 阅读文章**，体裁**按 day-of-year 轮换**，让阅读素材多样
（不只是传记）。仿 KB 里 [[source-2026-06-02-astrid-lindgren]] / [[source-2026-06-09-zlatan-bio]] 那种短句、
A2–B1 的读物。素材两段式格式（可读正文 + `svensk-export v1` 导入块）与 `/scenario`、`/dagens-nyheter` 一致。

- `/dagens-artikel [YYYY-MM-DD] [genre 0-7]` — 命令 `.claude/commands/dagens-artikel.md`：按
  `INDEX = day-of-year mod 8` 选体裁 → **查重**（不重复已入库题材）→ `WebSearch`/`WebFetch` 查**真实事实**
  （不得编造）→ 用简单瑞典语写文章 + 中文翻译 + 生词 → 存 `inbox/<体裁前缀>-<DATE>-<slug>.md`。不碰 `knowledge_base/`。
  **8 种体裁**：`0 传记 · 1 国情 · 2 历史 · 3 传统 · 4 自然 · 5 地方 · 6 发明 · 7 科普`（详见命令文件的体裁表）。
- `/dagens-biografi` 是体裁 0 的单独入口（强制传记、可指定人名）。

**与 §4.4 新闻等 routine 的关键区别：这条线跑在 *remote*（Claude Code on the web），不在本地 PowerShell。**
原因：本地 `scripts/daily-*.ps1` + 桌面「Scheduled task」只在**桌面应用开着时**才跑，且写死 Windows 路径/toast。
阅读文章不依赖本机，适合放云端**定时 session**，桌面关着也能每天产出。

**remote 定时 session 怎么配（用户在 Claude Code on the web 里建一个 scheduled trigger / routine）：**
- **环境网络策略**必须允许出站访问（要 `WebSearch`/`WebFetch` 查事实)。见
  https://code.claude.com/docs/en/claude-code-on-the-web 。
- **触发频率**：建议每日一次（如 cron `0 8 * * *`，UTC）。
- **routine prompt**（云端无桌面 SessionStart 后台 importer，也没有本地 PS 流水线，所以这条 session
  自己跑完**整条管线**：生成 → 导入 → 重建站点 → commit/push）：

  ```
  在 remote 环境里跑一篇今日 lättläst 阅读文章并入库：
  1. /dagens-artikel   （按 day-of-year 自动轮换体裁、自动查重、联网核实事实后生成到 inbox/）
  2. 对刚生成的那份新 inbox/*.md 跑 /import（去重、建双向链接、归档到 imported/、重建站点数据）
  3. git add -A 后用一句话 commit（如 "artikel: <体裁> <题材> daily"），push -u origin claude/stoic-franklin-jbjp20
  ```
- session 在隔离的临时容器里跑，**改动必须 commit+push 才会留存**，所以第 3 步不可省。
- 我（主 agent）**无法**从会话内创建这个 web 定时触发器——那是 web UI 的动作；上面这段 prompt 直接贴进
  scheduled trigger 即可。

> 与本地 routine 不冲突：本地那批仍走 `scripts/*.ps1`+桌面 Scheduled task；阅读文章这条独立跑 remote。
> `inbox/` 被 gitignore，所以文章必须当场 `/import` 进 tracked 的 `knowledge_base/`+`imported/` 才同步得到别的设备。

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

---

## 7. 风格 (Style)

- Primary explanation language: **简体中文**, with English terms alongside. Swedish grammar terms keep
  Swedish names (presens, bisats, …).
- Be encouraging and concise in chat. Put the exhaustive material in files.
- Use the emoji conventions from the Swedish skills (🇸🇪 🇨🇳 📌 📐 ⚠️ …) for scannability.
- Dates are absolute (e.g. `2026-06-02`), never "today".
