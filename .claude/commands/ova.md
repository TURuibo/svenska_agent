---
description: 把 Öva 复习页（site/ova/）的成绩写回词库：更新词条的复习字段（reviewed / review_count / interval / ease），熟练的词标 known:true 并加入 profile/level.md
argument-hint: "<粘贴从 Öva 页「📋 复制结果给 CC」复制的 ova-results v1 块>"
allowed-tools: Read, Bash(node tools/ova-sync.js:*)
---

把用户粘贴的 Öva 复习成绩写回知识库。

1. 在 `$ARGUMENTS`（或用户刚粘贴的消息）里找 ` ```ova-results v1 ` 块。找不到就告诉用户：去 🔁 Öva 页点「📋 复制结果给 CC」，
   再把复制的内容粘贴过来。
2. 把整块原样交给脚本（heredoc，原文照抄，不要改任何一行）：

   ```
   node tools/ova-sync.js <<'EOF'
   <粘贴的整个块，含 ```ova-results v1 和结尾 ```>
   EOF
   ```

   脚本会更新每个 `knowledge_base/words/<slug>.md` 的 `reviewed`、`review_count`、`interval`、`ease`；
   复习等级 ≥ 5、答对 ≥ 4 次、错误 ≤ 20% 的词标成 `known: true`，并加进 `profile/level.md` 的「已掌握」。
   它用的是累计数，同一块跑两次结果一样。
3. 用一两行回报脚本的输出（更新了多少、新掌握了哪些词），结尾提醒：**攒完记得 `/sync`**（和逐条查词一样，不自动 push）。
