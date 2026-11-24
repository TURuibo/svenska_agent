# ✍️ Skriva — 写作专栏 (spec)

> 2026-11-23 · 状态：**P0 已实现**。本文件是 Skriva 的唯一设计依据；改行为先改这里。
> 一句话：**把写作范文当「写作课」来学——看范文怎么搭 → 记骨架和句型 → 做两个小练习 → 自己写一篇 → 让 CC 批改。**
> 与其它页的分工：Läsning / Kurs 把同一篇范文当**阅读**材料（查词、逐句拆语法）；Skriva 只看**写**：
> 这一段在干什么、哪句话可以照搬、换一个题目我怎么写。

## 1. 为什么单独做一栏

| 现状 | 问题 |
|---|---|
| 6 篇 SFI 写作讲义范文（s. 3–8）在 Läsning / Kurs 里和别的课文混在一起 | 找不到「写作」这条线；页面按阅读设计（点词、逐句语法） |
| 老师手写的结构批注、句式清单在每篇的「教学备注」和两篇语法笔记里（`grammar-brevmall`、`grammar-skrivuppgift-textstruktur`） | 散在 8 个地方，写的时候用不上 |
| 没有地方「写」 | 看完范文没有题目、没有地方落笔、写了也没人改 |

## 2. 体裁

每个体裁 = `skriva/<key>.md` 一个文件（§4）。P0 三个，都来自老师的写作讲义：

| key | 体裁 | 范文 |
|---|---|---|
| `informellt-brev` | 💌 Informellt brev / mejl 非正式信件 | 讲义 s. 3（给朋友出主意）· s. 4（反驳提议 + 自己的建议） |
| `formellt-brev` | 🏛️ Formellt brev / mejl 正式信件 | 讲义 s. 5（给学校提建议）· s. 6（给市政府写意见）· 课本 s. 98（给政治人物的邮件） |
| `text-om-amne` | 📝 Text om ett ämne 话题短文（Skrivuppgift） | 讲义 s. 7（运动）· s. 8（社交媒体） |

以后加体裁（insändare、felanmälan、inbjudan…）= 加一个文件，页面不用改。

## 3. 页面

`site/skriva/`（`index.html` · `skriva.js` · `skriva.css`），`<body data-site="skriva">`，导航第 10 个 tab（Lyssna 后面：读 · 说 · 听 · **写**）。
只加载 `skriva-data.js`、`../kb-markdown.js`、`../speak.js`、`../read-sync.js`。

| 路由 | 视图 |
|---|---|
| `#` | 首页：四步说明 · 体裁卡片（范文 / 练习 / 写作题的进度）· 📂 我的作文 · 常错类型 |
| `#g=<key>&tab=mall` | 🧱 **骨架**：信 / 短文从上到下的每一格——写什么 + 这一格能用的句型（🔊）。有 `⚖️ …(Jämför)` 一节就显示在最下面，标题照源文件写的 |
| `#g=<key>&tab=texter` | 📄 **范文**列表 + 更多同类范文（链到 Läsning / Tala） |
| `#g=<key>&t=<slug>` | 一篇范文的**写作拆解**：任务框 → 正文按骨架上色、每块标「这一块在做什么」（日期那一格靠右，标题 Rubrik 那一格加粗）→ 句型高亮（点一下看中文和用法）→ ✨ 写法亮点。开关：🏷️ 结构 · 🖍️ 句型 · 🇨🇳 翻译。底部：做练习 · 去 Läsning 点词 · 去 Kurs 逐句精读 · ✓ 标为已读（与 Läsning 同一个标记，算 §4.9 的活跃） |
| `#g=<key>&tab=ova` | 🧩 **练习**（由范文自动生成，不用另写内容）：每篇两种 |
| `#g=<key>&d=ordna&t=<slug>` | 🧱 **排结构**：范文各块打乱，用 ▲▼ 排回去；按「骨架第几格」判对错（同一格的两段可以互换） |
| `#g=<key>&d=fraser&t=<slug>` | 🖍️ **填句型**：挖掉 6 个句型，四选一；干扰项优先来自骨架里别的格，所以考的是「这个位置该用哪类句型」。选项和答案是同一类（整句 / 句尾 / 句首 / 句中）、首字母大小写相同；挖掉的是整句时，上一句和下一句都给出来当上下文 |
| `#g=<key>&tab=skriv` | ✍️ **写**：写作题列表（标「📄 仿 s. 3」的题和那篇范文是同一种题） |
| `#g=<key>&u=<U1>` | 一道题：情境 + 要求（逐条打勾）→ 🧱 骨架提示（点句型插入到光标处）→ 写作框（自动保存、数词数）→ ✅ 自查清单 → 📋 **复制给 CC 批改** |
| `#mina` / `#mina=<id>` | 📂 我的作文：批改过的作文列表 / 一篇的批改表、改后全文、原文、任务完成情况、总评 |

- 进入下一层用 `pushState`，「←」和浏览器后退回上一层；直接打开深层链接时「←」回到它的上一层。
- 朗读用 `../speak.js`；`[[笔记]]` 链接打开 `../sok/#note=<slug>`。
- 没有 `skriva-data.js` 时显示怎么构建的提示，不报错。

## 4. 源文件契约 `skriva/<key>.md`（**冻结**——内容、构建、页面都按它写）

```markdown
---
key: informellt-brev            # = 文件名
sv: Informellt brev / mejl
zh: 非正式信件 / 邮件
icon: 💌
cefr: A2–B1
order: 1                        # 首页卡片顺序
grammar: [grammar-brevmall, grammar-privat-brev]     # 相关语法笔记（存在的才显示）
---

# 💌 Informellt brev / mejl — 非正式信件

一句话: 写给朋友、家人：口气随意，但结构和正式信一样完整。
什么时候写: 回朋友的邮件、给人出主意、和朋友商量一件事。

## 🧱 骨架与句型 (Disposition och fraser)

### 1. Plats + datum · 地点和日期
写什么: 右上角写地名和日期。
- Rissne 2017-11-21 | Rissne，2017 年 11 月 21 日 | 年-月-日；也可以写 23 maj 2018

### 4. Huvuddel · 主体
写什么: 一条建议一段；每条建议后面都要有理由（motivera）。
#### Ge råd · 给建议
- Du skulle kunna … | 你可以…… | skulle kunna + 不定式：比 du ska 客气
#### Motivera · 给理由
- … för att … | 为了…… |

## ⚖️ 正式 vs 非正式 (Jämför)              ← 可选：整节原样当 Markdown 显示（一般是一张表）；标题里要有「(Jämför)」，括号前面的就是页面上的小标题

## 📄 范文 (Modelltexter)

### paste-2026-11-17-informellt-mejl-tips-och-rad      ← imported/ 里的文件名（不含 .md）
名称: Tips och råd till en vän
讲义: SFI 写作讲义 s. 3
任务块: 2
| 开头 | 骨架 | 这一块在做什么 |
|---|---|---|
| Rissne 2017-11-21 | 1 | 地点 + 日期 |
| Hej Martin! | 2 | Hej + 名字 + 感叹号 |
| Men jag tänker | 4 · råd 1 | 第一条建议：定规矩；后面跟着理由 |
亮点:
- 每条建议后面都有理由或例子，不是只下命令。

## 📚 更多范文 (Fler exempel)            ← 可选
- scenario-2026-06-26-brev-till-van-nya-livet | 给朋友讲新生活

## ✍️ 练笔 (Skrivuppgifter)

### U1 · Råd till en vän som sover för lite
中文: 给睡得太少的朋友出主意
级别: A2
长度: 80–120
仿: paste-2026-11-17-informellt-mejl-tips-och-rad
🇸🇪 Din vän Erik har skrivit ett mejl till dig. Han …
🇨🇳 你的朋友 Erik 给你写了一封邮件。他……
要求:
- kommentera din väns situation | 评论朋友的处境
- ge två råd och motivera dem | 给两条建议并说明理由
提示:
- Jag förstår att … | 我明白……

## ✅ 自查清单 (Checklista)
### 结构
- 最上面有地点和日期
### 语言
- 主句动词在第二位：Igår **läste jag** …
```

规则：

| 部分 | 规则 |
|---|---|
| 骨架 | `### <序号>. <瑞典语> · <中文>`，序号从 1 连续；下一行 `写什么:`；句型行 `- 瑞典语 \| 中文 \| 用法`（用法可空）；`#### <瑞典语> · <中文>` 是格子里的小组（可没有） |
| 句型里的 `…` | 表示「这里换成你自己的内容」。构建时取 `…` 之间**最长的一段**去范文里找（整词、不分大小写），找到的地方就高亮；所以写句型时让固定的那段原样出现在范文里。找不到 = 补充句型（允许），`--check` 会列出来 |
| 范文的「任务块」 | 原文（`## 瑞典语原文`，空行分块）开头有几块是题目 / 情境，不属于正文 |
| 范文表 | 正文**每一块一行、顺序相同**；「开头」= 那一块开头的几个词（用来对账）；「骨架」= 序号，可加 `· 小标签`，一块占两格写 `6+7` |
| 翻译 | 取文章自己的 `## 🇨🇳 全文翻译`，块数必须和原文相同（按顺序一一对应） |
| 写作题 | `### U<n> · <瑞典语题目>`；`长度:` 是词数范围；`🇸🇪` / `🇨🇳` 各一行（情境）；`要求:` 至少 2 条；`提示:` 可没有 |
| 文内格式 | 只用 `**粗体**`、`[[笔记 slug]]`；不要单星号斜体（页面不渲染） |
| 检查 | `node tools/build-skriva-data.js --check`：序号、对账、块数、必填项有一处不符就报错（退出码 1） |

## 5. 批改：`/skriva` 和作文存档

写作题页的「📋 复制给 CC 批改」复制这样一段，回 Claude Code 运行 `/skriva` 粘贴：

````
```skriva-text v1
date: 2026-11-23
genre: informellt-brev
uppgift: U1
titel: Råd till en vän som sover för lite
ord: 96
---
（作文原文）
```
````

`/skriva`（`.claude/commands/skriva.md`）批改后存成 `skriva/texter/<date>-<genre>-<uppgift>.md`：

```markdown
---
date: 2026-11-23
genre: informellt-brev
uppgift: U1
titel: Råd till en vän som sover för lite
ord: 96
omdome: nästan                 # klar（达到 D 的要求）| nästan | inte-än
---

## ✍️ Min text
（原文，一字不改）

## ✅ Rättad text
（只改错，不改内容和口气）

## 🔎 Rättningar
| # | Min mening | Rättad | Typ | Varför |
|---|---|---|---|---|
| 1 | Igår jag läste … | Igår läste jag … | ordföljd | 状语在句首 → 动词第二位 [[grammar-v2-ordfoljd]] |

## 📋 Uppgiften
- ✅ kommentera din väns situation
- ⚠️ motivera dina råd — 只有第一条建议有理由

## 💬 总评
- 👍 结构完整：地点日期、问候、结尾都有。
- 🎯 下次先改：……
```

- `Typ` 只用这 10 个：`ordföljd` · `verbform` · `substantiv` · `adjektiv` · `preposition` · `ordval` · `stavning` · `skiljetecken` · `struktur` · `stil`。
  构建时按类型计数，首页显示「常错类型」。
- 仓库是公开的：作文里别写真实的姓名、地址、电话（讲义范文里的人名地名都是编的，照那样编）。

## 6. 数据契约 `site/skriva/skriva-data.js`

`tools/build-skriva-data.js` 读 `skriva/*.md` + `skriva/texter/*.md` + `imported/<slug>.md` + `knowledge_base/grammar/`，
生成 `window.SKRIVA_DATA`。**gitignore，由 Action 构建**；routine 不碰、不提交。

```js
window.SKRIVA_DATA = {
  v: 1, generatedAt: '…',
  genres: [{
    key, sv, zh, icon, cefr, order, one, when,
    grammar: [{ slug, name }],                         // 只含存在的笔记
    slots: [{ n: 1, sv, zh, what, groups: [{ sv, zh, phrases: [0, 1] }] }],   // phrases = 下标
    phrases: [{ sv, zh, note, slot: 1, m: 'du skulle kunna', src: ['<slug>'] }],   // m = 用来匹配的那一段（小写）；src = 出现在哪些范文
    compare: '<markdown 或 \'\'>', compareT: '⚖️ 正式 vs 非正式',   // 对比那一节的正文和标题
    texts: [{
      slug, name, sheet, title, cefr, words, kurs: 1, page: 'reading',
      task: [{ sv, zh }],                              // 题目 / 情境块
      blocks: [{ sv, zh, slot: 4, slot2: 0, sub: 'råd 1', what, hl: [[start, len, phraseIndex]] }],
      notes: ['亮点…']
    }],
    more: [{ slug, title, note, page }],
    tasks: [{ id: 'U1', sv, zh, cefr, len: [80, 120], model: '<slug 或 \'\'>', sit: { sv, zh }, req: [{ sv, zh }], hints: [{ sv, zh }] }],
    checks: [{ name, items: ['…'] }]
  }],
  mina: [{ id, date, genre, uppgift, titel, ord, omdome, original, rattad,
           rows: [{ min, ratt, typ, why }], uppgiften: [{ mark, text }], total: ['…'] }],   // 新的在前
  typer: { 'ordföljd': 3 }
};
```

## 7. 状态（localStorage `skriva.state.v1`）

`{ v:1, drafts: { '<genre>/<U1>': { text, at } }, req: { '<genre>/<U1>': { '<i>': 1 } }, checks: { 同上 },
   sent: { '<genre>/<U1>': 'YYYY-MM-DD' }, ordna: { '<slug>': 'YYYY-MM-DD' }, fraser: { '<slug>': [对, 总, 'YYYY-MM-DD'] },
   view: { struct, phr, zh }, tab: { '<genre>': 'mall' } }`
写前先重读；别的标签页改了也不会互相覆盖。草稿只在这台设备的浏览器里——换设备前先复制给 CC。
范文「已读」用 `ReadSync`（与 Läsning 同一个标记）。

## 8. 加新范文 / 新体裁

1. 范文照常录入（`imported/<slug>.md`，有 `## 瑞典语原文` 和块数相同的 `## 🇨🇳 全文翻译`）。
2. 在 `skriva/<key>.md` 的「📄 范文」里加一段（名称 / 讲义 / 任务块 / 表 / 亮点）；新句型加到骨架对应的格子里。
3. `node tools/build-skriva-data.js --check`，没有报错再提交。

## 9. 阶段

| 阶段 | 内容 |
|---|---|
| **P0** ✅ 2026-11-23 | 三个体裁（骨架 + 句型、范文拆解、两种自动练习、写作题、自查清单）· 写作框 + 复制给 CC · `/skriva` 批改存档 · 我的作文 + 常错类型 · 第 10 个 tab |
| P1（待定） | 🪜 Nivå 里加「写作」分区 · 更多体裁（insändare、felanmälan、inbjudan，库里已有情景范文）· 课本 s. 214–217 的信件范例（还没拍）· 改写练习（把非正式改成正式） |
