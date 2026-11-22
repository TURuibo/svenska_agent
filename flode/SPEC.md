# 🌊 Flöde — 碎片时间「刷」瑞典语 (spec + plan)

> 2026-11-14 · 状态：P0 已实现（分支上，合并进 main 后由 Action 发布）。本文件是 Flöde 的唯一设计依据；改行为先改这里。

## 1. 为什么要做 (现状分析)

现有 7 个页面都是「书桌工具」——适合晚上坐下来学，不适合白天掏出手机刷两分钟：

| 成本 | 现状 | 证据 |
|---|---|---|
| **决策成本** | 打开先要选：哪个页面？哪篇文章？哪个筛选？ | 7 个 tab；Läsning 253 篇 + 题材/主题/补弱项筛选；Öva 要选牌组 + 级别 |
| **时间成本** | 最小学习单位 = 一篇文章 / 一集听力 / 一轮 20 题 | 文章 200–400 词 + 全文翻译 + 逐段精读；Öva `SESSION = 20` |
| **加载成本** | 每页先下 6–7 MB 数据才可用，手机流量下很慢 | `kb-index.js` 6.4 MB、`reading-data.js` 7.2 MB |
| **姿势成本** | 表格、长段、小点击目标，要双手 + 专注 | 生词虚线点查、工具栏开关、侧栏 |
| **趣味** | 唯一「轻」的 Öva 是纯考试，没有新鲜感、没有节奏变化 | 只有选择题一种形态 |

而库里**已经有足够的碎片素材**，只是没被切成一口大小：

| 素材 | 数量 | 能切成 |
|---|---|---|
| words（带 zh/en/IPA/Förklaring/变形/genus） | 3 715 | 词卡 · 选择题 · en/ett · 配对 |
| sentences（带中文、关联词） | 3 557 | 一句话 · 填空 · 盲听 · 排词序 |
| phrases | 1 469 | 词组卡 |
| grammar（带「一句话」总结） | 232 | 语法一口 |
| 8 Sidor 新闻（37 天 × 5 条） | ~185 条 | 新闻一口 |
| 情景对话（已解析说话人 + 逐句中文） | 129 篇 | 对话一口（聊天气泡） |
| 文章（传记/历史/地方/科普…） | ~50 篇 | 文章预告 → 今晚读 |

**结论：不动现有网站，新增一个第 8 页 Flöde，把同一份知识库切成 5–20 秒一张的卡片流。**

## 2. 产品定位：白天刷 ↔ 晚上学

```
   ☀️ 白天 · Flöde（手机，单手，2 分钟也行）          🌙 晚上 · 现有网站（坐下来，30 分钟）
 ┌──────────────────────────────────┐        ┌──────────────────────────────────┐
 │ 🌙 预习：今晚那篇文章的词/预告/对话片段 │──🌙──▶│ Läsning/Tala/Lyssna 精读、角色扮演 │
 │ 🔁 复习：到期的词、前几天读过的句子     │◀─────│ 读过的文章 → 之后几天进复习车道      │
 │ 🆕 新词：缺口词、最近入库的词          │──🌙──▶│ Dagbok「🌙 今晚细看」清单 → 完整笔记 │
 └──────────────────────────────────┘        └──────────────────────────────────┘
        只「见面 + 提取」，不深挖                       深挖：语法、精读、输出
```

| 原则 | 含义 |
|---|---|
| **零决策** | 打开即第一张卡。没有列表、没有筛选、没有「开始」按钮 |
| **一口大小** | 每张卡 5–20 秒，一屏放完，不需要在卡内滚动 |
| **单手拇指** | 上滑 = 下一张；点一下 = 看中文；选项按钮在屏幕下半部 |
| **随时可停** | 没有「一轮」，没有未完成惩罚；进度自动存 |
| **秒开** | 自带轻量数据（≤ 3.2 MB raw，gzip 后约 1 MB），PWA 可装到主屏幕、离线可用 |
| **有节奏** | 被动卡（看/听）与互动卡（点一下）交替，题型不连续重复 |
| **不重复造内容** | P0 只用现有知识库，零新增每日 token 成本 |

**非目标：** 不替代 Läsning/Tala/Lyssna/Öva；不做账号/后端/数据库；不引入框架或构建步骤（vanilla JS，同现有站点）；不改变 §4.9 活跃度门槛（「标为已读」仍是唯一活跃信号——见 §9 待定项）。

## 3. 卡片类型

「互动」= 需要点一下作答；其余点卡片正文 = 揭示中文。所有卡片右侧有操作栏：🔊 朗读 · 🌙 今晚细看 · 📖 完整笔记。

| # | 类型 `t` | 屏幕上 | 互动 | 数据来源 | 阶段 |
|---|---|---|---|---|---|
| 1 | `word` 词卡 | 大字词 + IPA + 词类/CEFR；点 → 中文、英文、🇸🇪 Förklaring、一个例句；底部「😎 会了 / 🤔 再看看」 | 自评 | words | P0 |
| 2 | `quiz` 选择题 | 瑞典语选中文 / 中文选瑞典语，4 选 1 | ✅ | words | P0 |
| 3 | `cloze` 填空 | 一个句子挖掉一个词，3 选 1（选项是词元） | ✅ | sentences + words | P0 |
| 4 | `enett` en/ett | `___ hus` → 两个大按钮 en / ett；答后显示四式变形 | ✅ | words (substantiv + genus) | P0 |
| 5 | `sentence` 一句话 | 一个瑞典语句子；点 → 中文；关联词以 chip 显示 | — | sentences | P0 |
| 6 | `listen` 盲听 | 先自动朗读、文字模糊；点 → 显示原文；再点 → 中文 | — | sentences | P0 |
| 7 | `phrase` 词组 | 词组 + 类型；点 → 中文 + 例句 | — | phrases | P0 |
| 8 | `grammar` 语法一口 | 规则名 + 一句话 + 1–2 个例句 | — | grammar | P0 |
| 9 | `news` 新闻一口 | 一条 8 Sidor 新闻（标题 + 2–4 句）；点 → 中文 | — | bites | P0 |
| 10 | `dialog` 对话一口 | 3–4 句聊天气泡（左右分说话人）；点气泡 → 该句中文 | — | bites | P0 |
| 11 | `teaser` 文章预告 | 新文章的标题 + 第一段 + 3–5 个关键词；按钮「🌙 今晚读全文」 | — | bites | P0 |
| 12 | `pairs` 配对 | 4 个瑞典语 + 4 个中文，点对点消除 | ✅ | words | P0 |
| 13 | `stat` 小结 | 每 10 张插一张：「✅ 10 张 · 新见 4 词 · 答对 5/6 · 🔥 3 天」 | — | 本地状态 | P0 |
| 14 | `order` 排词序 | 打乱的词块点成正确语序（练 V2 / bisats） | ✅ | sentences | P1 |
| 15 | `fun` 趣味内容 | Visste du att… / 易混词 / 俚语 / 冷笑话 | — | 每日生成 | P2 |

## 4. 出卡算法（客户端）

**节奏：** 12 个槽位一循环，循环内轻度打乱，约束：① 同类型不连续；② 至少每 3 张有 1 张互动卡；③ 每 10 张插 1 张 `stat`。

```
word · quiz · sentence · bite(news/dialog/teaser) · enett · phrase · cloze · listen · word · grammar · pairs · bite
```

**车道（每个槽位选内容时按权重抽车道，空了就顺延下一条）：**

| 车道 | 权重 | 内容 | 目的 |
|---|---|---|---|
| 🌙 预习 | 35% | `fresh` 里（最近 3 天的文章）的词、预告、对话片段 | 晚上读那篇时生词已经见过 |
| 🔁 到期 | 35% | `ova.state.v1` 里 `d ≤ 今天` 的词；Flöde 里标过「🤔 再看看」的；最近 4–14 天文章的词/句 | 间隔提取 |
| 🆕 新词 | 20% | 没见过、非 known、未静音：缺口词（`gap`）优先，其次最近 30 天入库，优先 A2–B1 | 扩词汇 |
| 🎲 随机 | 10% | 其它任何未静音内容 | 新鲜感 |

**规则：**
- 同一条目 40 张内不重复；例外：答错的互动卡 4–7 张后重出一次。
- `known: true` 的词不出词卡，只偶尔出现在 quiz/pairs 的干扰项或随机车道。
- 干扰项：同词类，优先同主题/同 CEFR，中文释义不能与答案重叠（沿用 Öva 的 `glosses`/`overlaps` 思路）。
- 只取适合一屏的内容：句子 20–110 字符；新闻/预告 ≤ 380 字符（数据构建时已过滤）。

**🪜 跟随当前级别（2026-11-22，`site/niva/SPEC.md` §7）：** 在 🪜 Nivå 设了当前级别（`niva.state.v1.focus`，经 `site/niva-focus.js` 读）
且设置里「🪜 跟随当前级别」开着（默认开，`prefs.followLevel`）时：

| 车道 | 跟随时出什么 |
|---|---|
| 🆕 新词 | 只出当前级别的词（缺口词 → 最近 30 天 → 其余）、句子、词组、语法；都看过了再出**下一级**的 |
| 🎲 随机 · 🌙 预习 · 🔁 的「最近文章的词 / 句」补位 | 只出 ≤ 当前级别 |
| 🔁 到期 | **Öva 到期的复习和「🤔 再看看」不过滤**（不管什么级别，该复习就复习） |
| 新闻 / 对话 / 预告 | 只出 ≤ 当前级别，用完再借下一级 |

- 级别取数据里的 `lv`（与 Nivå 同一套规则：词组按词推断、语法按课纲）；没有 `lv` 的条目算「≤ 当前级别」。
- 顶栏目标条右边显示「🪜 A2」（点了回 Nivå）；设置里可关，关了就和以前一样。没设当前级别时这一行不显示。

## 5. 状态与桥接

| localStorage key | 谁写 | 内容 |
|---|---|---|
| `ova.state.v1`（**与 Öva 共用**） | quiz / cloze / enett / pairs 的客观对错 | Öva 原 schema `{ cards: { <slug>: { b, d, r, w, t } }, lastCopy }`，升降箱规则同 Öva（对 → b+1，错 → b=0，`d = today + [0,1,2,4,7,14,30][b]`）。于是 Öva 的「📋 复制结果给 CC」→ `/ova` 自动覆盖 Flöde 的成绩 |
| `flode.state.v1` | Flöde | `{ v:1, seen: { <id>: [次数, 最后日期] }, unsure: { <slug>: 日期 }, mute: { <slug>: 1 }, tonight: [ { id, t, slug, title, href, at } ], days: { <日期>: { cards, right, wrong, newWords } }, goal: 30, prefs: { autoSpeak: false, rate: 0.85, vibrate: true, followLevel: true } }` |

- **😎 会了** → `mute[slug]`（不再出这个词的词卡；不写 `known`，那仍由 `/ova` 决定）。**🤔 再看看** → `unsure[slug]`，本轮 5–8 张后重出，明天进到期车道。
- **🌙 今晚细看**（每张卡都有）→ 进 `tonight`。`href` 指向完整内容：词/词组/句子/语法 → `../sok/#note=<slug>`；新闻/预告 → `../reading/#article=<slug>`；对话 → `../tala/#article=<slug>`。
- **Dagbok 首页**顶部新增「🌙 今晚细看 · N」面板（读 `flode.state.v1.tonight`）：逐条链接 + ✓ 勾掉 + 清空；旁边一行「☀️ 今天刷了 42 张 · 答对 8/10 · 🔥 3 天 → 继续刷」。没有 Flöde 状态时不渲染。
- **目标与连续：** 每日目标默认 30 张（可选 15/30/60），顶栏细进度条；当天 ≥ 10 张算一天连续。不弹窗、不打断、不惩罚。
- `seen` / `days` 做裁剪（`seen` 保留最近 ~3 000 条，`days` 保留 90 天），避免 localStorage 无限长大。

## 6. 数据契约 `site/flode/flode-data.js`（**冻结**——构建端和页面端都按它写）

由 `tools/build-flode-data.js` 生成（读已生成的 `site/kb-index.js` + `site/kb-bodies.js` + `site/reading/reading-data.js` + `site/vocab-progress.js`，做法仿 `tools/build-dagbok-data.js`）。gitignore；由 GitHub Action 在其它 build 之后生成并 `git add -f` 发布。**预算：≤ 3.2 MB raw（gzip 后约 1 MB；原定 2 MB 会砍掉三分之一的释义和例句，实测后放宽）。** 缺失的可选字段一律省略或给 `''`/`null`，页面端必须容错。

```js
window.FLODE_DATA = {
  v: 1,
  generatedAt: '2026-11-14T08:00:00.000Z',
  latest: '2026-11-14',            // 最新一篇文章的日期（fresh 窗口以它为准，不用构建机时钟）
  words: [{
    s: 'citron',                   // slug（= ova.state.v1 的 key）
    l: 'citron',                   // lemma
    p: 'substantiv',               // 词类首词，小写：substantiv|verb|adjektiv|adverb|preposition|…
    g: 'en',                       // 'en' | 'ett' | ''（仅名词）
    c: 'A1',                       // CEFR 或 ''（原样，显示用）
    lv: 'A1',                      // 🪜 归属级别 A1|A2|B1|B2 或 ''（kb-index 的 lv，§4「跟随当前级别」用）
    zh: '柠檬', en: 'lemon',
    ipa: '/sɪˈtruːn/',             // 或 ''
    def: 'gul frukt med sur saft…',// 🇸🇪 Förklaring，≤ 140 字符，或 ''
    ex: ['Jag vill ha en citron.', '我想要一个柠檬。'],   // 最短的一个带中文的例句，或 null
    f: ['citron', 'citronen', 'citroner', 'citronerna'],   // 变形，≤ 6 个
    tp: 'topic-mat-dryck',         // 第一个主题 slug 或 ''
    d: '2026-07-01',               // created
    k: 0,                          // 1 = known:true
    gap: 0                         // 1 = 在 VOCAB_PROGRESS.learned 里（缺口词）
  }],
  sentences: [{                    // 只收 20–110 字符且有中文的
    s: 'sent-det-ar-brattom-…', sv: 'Det är bråttom om man ska hitta fler levande.',
    zh: '若要找到更多生还者，时间非常紧迫。',
    w: ['bråttom'],                // 关联词 slug（都存在于 words）
    c: 'A2', lv: 'A2', d: '2026-06-26'
  }],
  phrases: [{ s: 'hålla-på-med', sv: 'hålla på med (något)', zh: '从事、搞…', en: 'to be into…',
              cat: 'partikelverb', ex: ['Vad håller du på med?', '你在忙什么？'] /* 或 null */, d: '2026-10-01',
              lv: 'A2' /* 没标 cefr 的按词推断，推不出给 '' */ }],
  grammar: [{ s: 'grammar-bisats-om', name: 'Bisats med om', zh: '条件从句',
              tip: '一句话总结，≤ 160 字符',
              ex: [['Om det regnar stannar jag hemma.', '如果下雨我就待在家。']] /* 0–2 个 */, lvl: 'A2' /* 显示用 */,
              lv: 'A2' /* 归属级别（课纲 profile/niva-syllabus.md 优先） */ }],
  bites: [{                        // 新的在前，最多 ~450 条
    id: 'news-2026-11-13#2',       // 稳定唯一 id
    kind: 'news',                  // 'news' | 'teaser' | 'dialog'
    a: 'news-2026-11-13',          // 文章 slug（reading-data 的 slug）
    site: 'reading',               // 'reading' | 'tala' —— 决定「今晚读」跳哪里
    title: '…', d: '2026-11-13', c: 'A2', lv: 'A2',   // lv = 文章的归属级别（reading-data 的 lv）
    sv: 'Flera korta meningar …',  // news/teaser：正文，≤ 380 字符
    zh: '对应中文……',               // 可能为 ''
    turns: [{ who: 'A', sv: '…', zh: '…' }],   // 仅 dialog：3–4 句连续台词
    words: ['besked', 'tydlig']    // 该文章导入块里、且存在于 words 的词 slug，≤ 8 个
  }],
  fresh: [{                        // 文章日期 ∈ [latest-2, latest]
    a: 'plats-2026-11-13-…', site: 'reading', title: '…', d: '2026-11-13', kind: 'article',
    words: ['…'],                  // 该文章导入块里存在于 words 的全部 slug
    sentences: ['sent-…']          // 该文章导入块里存在于 sentences 的 slug（可为空）
  }],
  recent: [{ a, site, title, d, words: [...] }],   // fresh 窗口之前的 12 篇文章（不按日期卡，避免暂停生成后为空），供 🔁 车道
  topics: { 'topic-mat-dryck': '食物饮料' }          // slug → 中文名（只含被引用的）
};
```

## 7. 技术设计

| 项 | 决定 |
|---|---|
| 文件 | `site/flode/index.html` · `flode.js` · `flode.css` · `sw.js` · `manifest.webmanifest` · `icon-192.png` / `icon-512.png` / `apple-touch-icon.png`；`tools/build-flode-data.js` |
| 依赖 | 只加载 `../styles.css`（调色板变量）、`flode.css`、`flode-data.js`、`../speak.js`（`SvSpeak`）、`flode.js`。**不加载** `kb-index.js` / `kb-bodies.js` / `reading-data.js` / `kb-store.js` |
| 滚动 | 竖向 `scroll-snap-type: y mandatory`，每张卡 `100dvh`；`IntersectionObserver` 判定当前卡（计 seen、自动朗读、统计）；DOM 里只保留当前卡前后约 6 张（回收旧卡），可无限刷 |
| 导航 | Flöde 页面沉浸式：手机上不渲染 7-tab 底栏，左上角一个 `📅` 回 Dagbok、右上角 `⚙︎`（目标 / 自动朗读 / 语速 / 清空静音）。其它页面的 `nav.js` `DEST` 加一项 `{ id: 'flode', icon: '🌊', label: 'Flöde' }`（排第 2）；确认 8 个 tab 在 360 px 宽下不换行不溢出 |
| 语音 | `SvSpeak.speak(text)`；`listen` 卡进入视口时自动读（浏览器若因未交互拒绝，就显示大 ▶ 按钮）；其它卡仅在 `prefs.autoSpeak` 时自动读 |
| PWA | `manifest.webmanifest`：`start_url: "./"`、`scope: "../"`（装到主屏后站内其它页也在 app 里开）、`display: standalone`；`sw.js` 作用域仅 `flode/`，对本页请求的同源资源做 stale-while-revalidate，新版 `skipWaiting` + `clients.claim`。不影响其它页面的缓存行为 |
| 桌面 | 居中手机宽度的一列；键盘 `↓/空格` 下一张、`↑` 上一张、`1–4` 作答、`Enter` 揭示 |
| 性能预算 | 壳（html+css+js）约 70 KB raw（gzip 约 21 KB；原定 60 KB，13 种卡实测略超，不值得为此删功能）；数据 ≤ 3.2 MB raw，gzip 后约 1 MB；二次打开（SW 缓存）首卡 < 1 s |
| 构建/发布 | `.gitignore` 加 `site/flode/flode-data.js`；`kb-site.yml`：build 步骤末尾加 `node tools/build-flode-data.js`，`git add -f` 列表加该文件，`paths:` 加 `tools/build-flode-data.js` |
| 约定 | 沿用站点规范：`?v=N` cache-busting、`<body data-site="flode">`、中文界面、瑞典语节点加 `lang="sv"`、深浅色跟随现有 CSS 变量 |

## 8. 实施计划

| 里程碑 | 内容 | 模型 | 验收 |
|---|---|---|---|
| **M1 数据** | `tools/build-flode-data.js` + gitignore + workflow | Sonnet | 契约字段齐全；≤ 3.2 MB；words ≥ 3 000、sentences ≥ 1 500、bites ≥ 200（三种 kind 都有）、fresh 非空 |
| **M2 卡片流** | `site/flode/` 页面：13 种 P0 卡、出卡算法、状态、设置、键盘 | Opus | 390×844 下连刷 60 张无报错；每种卡出现过；答题写进 `ova.state.v1`；刷新后进度还在 |
| **M3 桥接 + 外壳** | Dagbok「🌙 今晚细看」面板、`nav.js` 入口、PWA（manifest/SW/图标）、README + CLAUDE.md 文档 | Sonnet | Flöde 里点 🌙 → Dagbok 出现该条且链接可达；8-tab 导航不溢出；离线重开可刷 |
| **M4 验收** | Playwright 手机视口走查 + 截图，修问题 | 主 agent | 上述全部通过，截图给 Ruibo |
| P1（后续） | `order` 排词序卡；跨设备同步 `tonight`（复用 ☁️ token，推到 `read-log` 分支的另一个文件） | — | — |
| P2（后续） | `/dagens-flode`：每天用 Sonnet 生成 10 条趣味微内容（Visste du att / 易混词 / 俚语）→ `fun` 卡 | — | — |

## 9. 待 Ruibo 决定（默认值已选好，不阻塞实施）

| 问题 | 默认 | 另一种 |
|---|---|---|
| 刷 Flöde 算不算 §4.9 的「活跃」？ | **不算**——仍只有「标为已读」。白天刷、晚上不读超过 48 h，自动生成会暂停 | 刷满每日目标也推一次 `lastMarkedAt`（需要 token） |
| 「🌙 今晚细看」要不要跨设备？ | P0 仅本机（手机刷、手机看 Dagbok） | P1 用现有 ☁️ token 同步到电脑 |
| 每日目标 | 30 张（≈ 5 分钟） | 15 / 60 |
