---
description: 把 Öva 复习页（site/ova/）和 🪜 Nivå（site/niva/）的成绩写回词库：更新词条的复习字段（reviewed / review_count / interval / ease），熟练或自评「会」的词标 known:true 并加入 profile/level.md，通关 / 定级记进评估历史
argument-hint: "<粘贴从 Öva 或 Nivå 页「📋 复制结果给 CC」复制的 ova-results v1 块>"
allowed-tools: Read, Bash(node tools/ova-sync.js:*)
---

把用户粘贴的复习成绩写回知识库。这个块有两个来源，格式相同：🔁 Öva 的「📋 复制结果给 CC」，和 🪜 Nivå 的「📋 复制结果给 CC」
（Nivå 的块已经包含 Öva 的行，再加上「过一遍」自评「会」的词 / 词组，以及自测、定级、通关的结果）。

1. 在 `$ARGUMENTS`（或用户刚粘贴的消息）里找 ` ```ova-results v1 ` 块。找不到就告诉用户：去 🪜 Nivå（或 🔁 Öva）页点
   「📋 复制结果给 CC」，再把复制的内容粘贴过来。
2. 把整块原样交给脚本（heredoc，原文照抄，不要改任何一行）：

   ```
   node tools/ova-sync.js <<'EOF'
   <粘贴的整个块，含 ```ova-results v1 和结尾 ```>
   EOF
   ```

   脚本按三种行分别处理：

   | 行 | 例子 | 写到哪 |
   |---|---|---|
   | Öva 复习 | `- hävda \| slug hävda \| box 2 \| ✓3 ✗1 \| 2026-10-03` | `words/<slug>.md` 的 `reviewed`、`review_count`、`interval`、`ease`；复习等级 ≥ 5、答对 ≥ 4 次、错误 ≤ 20% → `known: true` |
   | Nivå 自评「会」 | `- smörgås \| slug smörgås \| known \| 2026-11-21` | `words/` 或 `phrases/<slug>.md` 的 `known: true` |
   | Nivå 级别 | `level: A1 \| test 18/20 \| passed \| 2026-11-21` | `passed`（通关）/ `placed`（定级通过）→ `profile/level.md`「评估历史」加一行；`-` 不写 |

   新标 `known: true` 的**单词**加进 `profile/level.md` 的「已掌握」（注明「Öva 掌握」或「Nivå 自评」）。「总体水平」不改——那仍由 `/assess` 判断，
   sv-assessor 会把评估历史里的 Nivå 行当证据。同一块跑两次结果一样。
3. 用一两行回报脚本的输出（更新了多少、新标了哪些词、记了哪几级），结尾提醒：**攒完记得 `/sync`**（和逐条查词一样，不自动 push）。
