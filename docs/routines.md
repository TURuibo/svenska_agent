# 每日 remote routine 手册 (docs/routines.md)

> 从 `CLAUDE.md` §4.2（云端部分）、§4.4–§4.7 移出（2026-09-22），为了给每个交互式会话省 ~8k tokens。
> **只有定时 / routine 会话需要读本文件**；交互式会话看 `CLAUDE.md` 即可。章节编号沿用原来的 §4.x，
> 其它文件里的 "§4.7 收尾" 等引用指向的就是本文件。
>
> 通用前提（各节都依赖）：
> - 五条 routine（news / listening / artikel / scenario / adjsubst）都跑在 **Claude Code on the web** 的定时
>   session 里；本地 `scripts/daily-*.ps1` + 桌面 Scheduled task 已于 2026-06-23 **全部退役**，勿双跑。
> - 每个 remote session 是全新临时容器 + 一次性随机分支，**改动必须 commit + push + merge 进 main** 才留存。
> - 入库一律经 `/import`（`node tools/dedup.js` 查重 → librarian/importer **前台**写库 →
>   `node tools/schedule.js add-source` 排复习）；`knowledge_base/` 之外不写别的地方。

---

### §4.2 情景 / 变形 routine（scenario · adjsubst，纯生成、不联网）

**云端版 (remote, 推荐用它替代本地)：** scenario 这条 routine 同样可放到 Claude Code on the web 定时 session
（和 §4.6 阅读文章同一模式），桌面关着也能每天跑。**scenario 纯生成、不联网**，所以环境网络策略无所谓
（开不开出站都行）。`/dagens-scenario` 不传参 = 批量模式：按 `OFFSET = day-of-year mod 7` **一次生成当天 5 篇**
（一周一轮覆盖全部 35 个体裁；stride-7 选取保证每天跨难度跨 type；详见命令文件 §1 与 sv-scenario 技能 §2 体裁目录），
routine 直接裸调即可——**改节奏 / 扩体裁只改命令文件，routine 无需改动**。routine prompt：
```
先 Read docs/routines.md（routine SOP），然后在 remote 环境里生成今日情景练习并入库：
1. /dagens-scenario   （批量：按 day-of-year 生成当天 5 篇，一周轮完 35 体裁，不需联网）
2. 对刚生成的**每一个** inbox/scenario-<date>-*.md（今天 5 篇）逐篇跑 /import（spawn librarian/importer 用前台，每篇等完整 manifest 再做下一篇）
3. 按 **docs/routines.md §4.7 收尾**：build-kb-site.js 更新 slugs.json；`git add` 源文件 + slugs.json
   （四个生成的 viewer 数据文件 `kb-index.js`/`kb-bodies.js`/`reading-data.js`/`listening-data.js` 已 gitignore，git add 自动跳过）；commit、push
4. 用 mcp__github__ 创建 PR（base=main）并 squash merge；若 405（仅可能 KB 笔记 add/add）按 docs/routines.md §4.7 ④
```
> ⚠️ **本地与云端二选一**：同时在本地任务和云端跑会同一天生成两篇。改用云端后，请在桌面把本地那条 scenario 任务**停用**。

> **adjsubst 同理**（也纯生成、不联网）：另建一条云端 routine，把上面 prompt 里的 `/dagens-scenario` 换成 `/adjsubst`、
> `scenario-*.md` 换成 `adjsubst-*.md` 即可（`/adjsubst` 裸调时自己按 `day-of-year mod 10` 轮换 10 主题）。同样记得把本地 adjsubst 任务停用。

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

**云端版 (remote, 推荐用它替代本地)：** news 这条**联网类** routine 同样可以放到 Claude Code on the web 的定时 session
（和 §4.6 阅读文章同一模式），桌面关着也能每天跑。环境需**允许出站访问**（抓 8 Sidor）。routine prompt：
```
先 Read docs/routines.md（routine SOP），然后在 remote 环境里抓今日瑞典语简易新闻并入库：
1. /dagens-nyheter
2. 对刚生成的 inbox/news-*.md 跑 /import（spawn librarian/importer 用前台，等完整 manifest 再收尾）
3. 按 **docs/routines.md §4.7 收尾**：build-kb-site.js 更新 slugs.json；`git add` 源文件 + slugs.json
   （四个生成的 viewer 数据文件 `kb-index.js`/`kb-bodies.js`/`reading-data.js`/`listening-data.js` 已 gitignore，git add 自动跳过）；commit、push
4. 用 mcp__github__ 创建 PR（base=main）并 squash merge；若 405（仅可能 KB 笔记 add/add）按 docs/routines.md §4.7 ④
```
> ⚠️ **本地与云端二选一**：news 同时在本地 `svensk-news-daily` 和云端跑会重复抓取/产生两份当日新闻。
> 改用云端后，请在桌面把本地 `svensk-news-daily` 任务**停用**。

### §4.5 听力练习 (Listening — SVT lätt svenska)

**`/dagens-horovning [svt-video-id]`** 抓取 **SVT「Nyheter på lätt svenska」**(简易瑞典语新闻**视频**，
工作日 ~17:25 约 4.5 分钟)的**字幕原文 + 时间轴**，配**逐句中文翻译**和**生词表**，生成一集听力数据，
供在 **Lyssna 听力站** 里盲听/精听/跟读/单句循环/倍速练习。命令 `.claude/commands/dagens-horovning.md`。

**数据链(全部经 SVT 官方接口，真实抓取、不编造）：**
1. 节目页 → 最新一集 video id。⚠️ **Remote 环境下 svtplay.se 返回 403**，改用
   `https://webb-tv.nu/svt-nyheter-pa-latt-svenska-svt-play/` 取今日 id（更可靠）。
   详见命令文件 §1。
2. `api.svt.se/video/<id>` → HLS `.m3u8` 流 URL + 瑞典语 WebVTT `.vtt` 字幕 URL + `contentDuration`。
3. WebFetch `.vtt` → 逐句字幕(带时间轴) → 我配中文翻译 + 10–15 生词 → 写 `listening/svt-latt-<DATE>.json`。
4. `node tools/build-listening-site.js` 扫 `listening/*.json` → `site/listening/listening-data.js`。

**站点 `site/listening/`(主站侧栏 🎧 Lyssna 入口)**：`index.html` + `listening.js` + `listening.css`。
用 **hls.js**(CDN)播放 SVT 的 HLS 流(已验证 SVT 的 akamai CDN 回 `Access-Control-Allow-Origin: *`，
Chrome/Edge 可跨域播放；Safari 走原生 HLS)。功能：逐句字幕**点击跳转 + 播放时自动高亮跟随**、
🇸🇪 原文 / 🇨🇳 翻译显隐(盲听 = 隐藏原文，仅当前句揭示)、🔁 单句循环、0.75/1/1.25× 倍速、生词卡。

**每日自动抓取(routine)：** `scripts/daily-listening.ps1`(UTF-8 BOM)headless 跑 `/dagens-horovning`
(allowedTools 含 `WebSearch,WebFetch,Bash`)→ 重建听力数据 → 有新一集则 `tools/sync-kb.ps1` push → Windows toast。
触发器 = Claude Code scheduled task **`svensk-horning-daily`**，cron `30 18 * * *`(SVT ~17:25 播完后)。日志 `scripts/listening-run.log`。
`tools/sync-kb.ps1` 会重建并暂存 `listening/*.json`（源数据，tracked）；`site/listening/listening-data.js`
已 gitignore（由 Action 生成），不再随 `/sync` 提交。

**云端版 (remote, 推荐用它替代本地)：** listening 这条**联网类** routine 也可放到 Claude Code on the web 定时 session。
环境需**允许出站访问**(抓 SVT api/字幕)。与 news/scenario 不同，它要**两步**：`/dagens-horovning` 既写
`listening/*.json`+跑 `build-listening-site.js`，又写 `inbox/horning-<DATE>.md` 供 `/import`(让生词进 KB)。routine prompt：
```
先 Read docs/routines.md（routine SOP），然后在 remote 环境里抓今日 SVT 简易新闻听力并入库：
1. /dagens-horovning   （抓最新一集字幕→听力数据→重建 Lyssna 站，并写 inbox/horning-*.md）
2. 若生成了 inbox/horning-*.md，对它跑 /import（spawn librarian/importer 用前台，等完整 manifest 再收尾）
3. 按 **docs/routines.md §4.7 收尾**：build-kb-site.js（更新 slugs.json）；`git add` 源文件（含 `listening/*.json`）
   + slugs.json（三个 viewer 数据文件已 gitignore，含 `listening-data.js`，git add 自动跳过，由 Action 生成）；
   若无改动(无新一集)则跳过不 commit；否则 commit、push
4. 有改动时用 mcp__github__ 创建 PR（base=main）并 squash merge；若 405（仅可能 KB 笔记 add/add）按 docs/routines.md §4.7 ④
```
> SVT 仅**工作日 ~17:25** 更新，cron 建议 `30 16 * * 1-5`(UTC，≈瑞典夏令时 18:30，播完后)；周末跑也无害(查到的还是周五那集→已存在→无改动→跳过 push)。
> ⚠️ **本地与云端二选一**：改用云端后请在桌面把本地 `svensk-horning-daily` **停用**。

**只存元数据 + 我生成的译文/生词**：音频、字幕**实时从 SVT CDN 取**，不下载、不转存(版权安全)。
媒体 URL 仅在该集可看期(~1 周)内有效，过期后站点提示并回退到「📺 在 SVT Play 看」。

> 注意：`listening/` 与 `site/listening/` 都是 **tracked**(不像 `inbox/` 被 gitignore)，随 git 正常多设备同步。
> SVT 那档是**视频**、没有逐条文字页面，所以它**只做听力**；抓**文字入库**的每日新闻仍走 8 Sidor(§4.4)——两条线分工不冲突。

### §4.6 每日 lättläst 阅读文章 (Daily reading article — 轮换体裁，**跑在 remote**)

每天生成一篇 **SFI 风格的瑞典语 lättläst 阅读文章**，体裁**按 day-of-year 轮换**，让阅读素材多样
（不只是传记）。仿 KB 里 [[source-2026-06-02-astrid-lindgren]] / [[source-2026-06-09-zlatan-bio]] 那种短句、
A1–A2 的读物。素材两段式格式（可读正文 + `svensk-export v1` 导入块）与 `/scenario`、`/dagens-nyheter` 一致。

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
  2. 对刚生成的那份新 inbox/*.md 跑 /import（spawn librarian/importer 用前台，等完整 manifest 再收尾）
  3. 按 **docs/routines.md §4.7 收尾**：build-kb-site.js 更新 slugs.json；`git add` 源文件 + slugs.json
     （三个 viewer 数据文件已 gitignore，git add 自动跳过）；用一句话 commit、push
  4. 用 mcp__github__ 创建 PR（base=main）并 squash merge；若 405（仅可能 KB 笔记 add/add）按 docs/routines.md §4.7 ④
  ```
- session 在隔离的临时容器里跑，**改动必须 commit+push 才会留存**，所以第 3 步不可省。
- 我（主 agent）**无法**从会话内创建这个 web 定时触发器——那是 web UI 的动作；上面这段 prompt 直接贴进
  scheduled trigger 即可。

> 与本地 routine 不冲突：本地那批仍走 `scripts/*.ps1`+桌面 Scheduled task；阅读文章这条独立跑 remote。
> `inbox/` 被 gitignore，所以文章必须当场 `/import` 进 tracked 的 `knowledge_base/`+`imported/` 才同步得到别的设备。

### §4.7 ⭐ Remote routine 收尾 SOP (commit · PR) — **每条 remote routine 都按这个收尾**

> ⚠️ **仅限 routine / 定时(scheduled)会话**（§4.2–§4.6 这些每天自动跑的 session）。**交互式人工会话默认不开 PR**
> ——除非用户当场明确要求(见运行环境指令)。这是用户对自动会话的固定偏好：**routine 里一律自动 create PR → merge**，
> 不必每次问。

所以 §4.4–§4.6 的 remote routine（news / listening / scenario / artikel / adjsubst）跑完生成 + `/import`
后，**统一**按本节收尾（commit/push 并自动开 PR + merge）。

**⭐ 2026-06-23 架构改：生成的 viewer 数据文件已移出 git。**
`site/kb-index.js`、`site/kb-bodies.js`、`site/reading/reading-data.js`、`site/listening/listening-data.js`
现在都在 `.gitignore`，**只由 GitHub Action `.github/workflows/kb-site.yml` 在发布 gh-pages 时生成、永不提交回
main**。所以以前「Action 提交 viewer 文件 → 和 routine 抢 → 每次 merge 必冲突」的根源**没了**：routine **绝不碰
这几个文件**，PR 里只有源文件，收尾大幅简化（不再需要旧版的 ④重建数据文件、⑥force-push 对齐分支）。

> 🔎 **2026-06-24 性能重构：`kb-data.js`（8.9 MB 单块）已拆成 `kb-index.js`（轻量、即时加载）+ `kb-bodies.js`
> （正文，按需懒加载）。** 所有站点（Sök / Former / Dagbok / Läsning / Lyssna）改用共享模块
> `site/kb-store.js`（数据 + 搜索 + `KB.openNote` 笔记弹窗）与 `site/kb-markdown.js`（统一 Markdown 渲染）；
> Sök 重做成命令面板式纯搜索页。这些是源文件（tracked），随源码提交。

> 🗂️ **本地 PowerShell 流水线已退役（2026-06-23）。** remote 定时 session 是**唯一**自动入库来源。
> `scripts/daily-{news,scenario,adjsubst,listening}.ps1` + 桌面 Scheduled task（`svensk-*-daily`）**请全部停用**，
> 否则会与 remote 同日重复产出 / 制造 add/add 冲突。脚本文件暂留作参考，但不应再被任何 Scheduled task 调用。

**① 只提交源文件 + `slugs.json`：**
```bash
node tools/build-kb-site.js          # 更新 slugs.json（dedup 依赖）；顺带生成的 kb-index.js/kb-bodies.js 是 gitignore，git add 自动跳过
git add knowledge_base/ listening/ imported/ review/ profile/ knowledge_base/_index/slugs.json
git commit -m "<routine>: <一句话>"
git push -u origin <当前 branch>
```
> `knowledge_base/_index/slugs.json` **仍 tracked、仍要提交**（dedup 用最新版）。三个 viewer 数据文件是
> gitignore，`git add` 自动跳过，**无需再特意排除**。listening routine 不必再单独 build/commit listening-data.js
> —— Action 会生成它。

**② sv-librarian / sv-importer 用前台**（不要 `run_in_background`）：routine 无人值守，spawn 时用前台 `Agent`，
主 agent 阻塞等完整 manifest 再 commit。后台跑会被 stop hook 逼着分批 commit，产生竞态和半截提交。

**③ 创建 PR 并 squash merge：**
```
mcp__github__create_pull_request(base=main, head=<branch>, title/body=一句话)
mcp__github__merge_pull_request(pullNumber=N, merge_method="squash")
```

**④ 极少数 merge 405 冲突**：viewer 数据文件已不在 git，唯一可能冲突的是 **KB 笔记 add/add**
（如两条 routine 同日都产出 `på-grund-av.md`/`förbjuda.md`）。保留 main 版本即可：
```bash
git fetch origin main
git merge origin/main --no-edit
git checkout --theirs <冲突文件> && git add <冲突文件>   # KB 笔记冲突保留 main 版
git commit --no-edit && git push                          # 再回 ③ merge PR
```

**⑤ 无改动则跳过：** 若该 routine 当天无新内容（如听力无新一集、抓到的全是 dup），
`git status` 干净就**直接结束**，不 commit、不开 PR。

> routine 会话**必须自己把改动合进主分支**（③ create PR → squash merge），否则每天内容只堆在分支上、
> 别的设备 `git pull` 主分支拿不到。
>
> remote 每个 session 是**全新临时容器 + 一次性随机分支**，跑完即弃，所以**不需要**把开发分支对齐 main
> （旧版 ⑥ 已删）。本地若有持久开发分支，按需 `git pull --rebase` 即可。
