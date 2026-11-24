---
description: 批改一篇瑞典语作文（✍️ Skriva 写作专栏「📋 复制给 CC 批改」复制的 skriva-text v1 块，或直接粘贴的作文）：逐句改错、给改后全文、对照题目要求和体裁骨架、总评，并存进 skriva/texter/（专栏的「📂 我的作文」）
argument-hint: "<粘贴从 Skriva 写作题页复制的 skriva-text v1 块；或直接贴一篇作文>"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash(node tools/build-skriva-data.js:*)
---

批改 Ruibo 写的一篇瑞典语作文，并存档。设计与文件格式：`site/skriva/SPEC.md` §5。

## 1. 找到作文和题目

在 `$ARGUMENTS`（或用户刚粘贴的消息）里找 ` ```skriva-text v1 ` 块：

```
date: 2026-11-23
genre: informellt-brev        ← skriva/<genre>.md
uppgift: U1                   ← 那个文件「✍️ 练笔」里的题目
titel: …
ord: 96
---
（作文原文）
```

- 读 `skriva/<genre>.md`：这道题的情境和「要求:」、这个体裁的骨架（每一格写什么）和句型。
- 没有块、只是一篇作文 → 看内容判断体裁（非正式信 `informellt-brev` / 正式信 `formellt-brev` / 话题短文 `text-om-amne`），
  `uppgift` 留空；拿不准就问一句「这是哪道题？」。
- 作文是别的语言或者只有一两句 → 不存档，直接说明。

## 2. 批改（用 `swedish-grammar` 技能判断每一处）

原则：**只改错，不改内容和口气**——改后的文章还是他的文章。写得对但不够地道的地方，不算错，放到总评里当建议（最多 3 条）。

| 做什么 | 怎么做 |
|---|---|
| 逐句对照 | 每个有错的句子一行：原句 → 改后 → 类型 → 为什么（一句中文，能链到语法笔记就写 `[[grammar-…]]`，先确认笔记存在） |
| 类型（只用这 10 个） | `ordföljd` 语序 · `verbform` 动词形式 / 时态 · `substantiv` en/ett、单复数、定形 · `adjektiv` 一致 · `preposition` · `ordval` 用词 · `stavning` 拼写 · `skiljetecken` 标点和大小写 · `struktur` 结构 / 分段 · `stil` 语体（正式 / 非正式） |
| 一句里有两处错 | 写两行（原句相同），类型各写各的 |
| 对照题目 | 「要求:」每一条：✅ 写到了 / ⚠️ 写了但不够（说差什么）/ ❌ 没写 |
| 对照骨架 | 缺了哪一格（地点日期、问候、结尾、署名、标题…）→ 记成一行 `struktur` |
| 总评 `omdome` | `klar` = 任务完成、读得懂、错误不影响理解（达到 SFI D 的要求）· `nästan` = 差一点（缺一条要求，或错误有点多）· `inte-än` = 读不太懂或离题 |

## 3. 存档

写 `skriva/texter/<date>-<genre>-<uppgift>.md`（没有 uppgift 就用 `fri`；同名已存在就加 `-2`、`-3`——重写的每一版都留着）：

```markdown
---
date: 2026-11-23
genre: informellt-brev
uppgift: U1
titel: Råd till en vän som sover för lite
ord: 96
omdome: nästan
---

## ✍️ Min text
（原文，一字不改，保留分段）

## ✅ Rättad text
（只改错的完整版本，保留分段）

## 🔎 Rättningar
| # | Min mening | Rättad | Typ | Varför |
|---|---|---|---|---|
| 1 | Igår jag läste om det. | Igår läste jag om det. | ordföljd | 状语在句首 → 动词第二位 [[grammar-v2-ordfoljd]] |

## 📋 Uppgiften
- ✅ kommentera din väns situation
- ⚠️ ge två råd och motivera dem — 第二条建议没有理由

## 💬 总评
- 👍 （做得好的一两点，具体）
- 🎯 下次先改：（最该先改的一类错误，给一个他自己句子的例子）
- 💡 （可选：一两处更地道的说法）
```

- 表格单元格里不要有 `|`；不用单星号斜体（页面不渲染），要强调用 `**粗体**`。
- **隐私**：仓库是公开的。作文里如果有看起来真实的电话、门牌地址、身份号码，存档时换成 `[…]`，并在回复里提醒一句。
- 存完跑 `node tools/build-skriva-data.js --check`，有 ❌ 就修。
- 同一类错误已经在以前的作文里出现过（`Grep` 一下 `skriva/texter/` 的 Typ 列）→ 在总评里点出来「这是第 N 次」。

## 4. 回复（聊天里精简，细节在文件里）

```
✍️ <题目> — <N> ord · <omdome 的中文：达到要求 / 差一点 / 还不够>
| # | 你写的 | 改成 | 为什么 |      ← 最多列 6 处最重要的，其余说「另有 N 处在文件里」
📋 要求：✅ … ⚠️ …
🎯 下次先改：…
📁 已存：skriva/texter/<文件>.md  |  攒完记得 /sync（网站重建后在 ✍️ Skriva →「📂 我的作文」里看）
```

不自动 push（和逐条查词一样）。不改 `profile/level.md`——`/assess` 评估时会把 `skriva/texter/` 当证据。
