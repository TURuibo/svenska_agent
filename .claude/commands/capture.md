---
description: 速查一个瑞典语词/词组/句子/图片，给精简答案并累加进当天 inbox 文件供后续 import（不直接写 KB）
argument-hint: "<瑞典语词/词组/句子/语法问题>，或直接发图片"
allowed-tools: Read, Glob, Grep, Write, Edit
---

Use the `sv-capture` skill to do a lightweight lookup of: **$ARGUMENTS**

(若没有 $ARGUMENTS 而是附了图片，对图片执行 sv-capture 的图片分支：先转写确认再分析。)

## 流程

1. 按 `sv-capture` §1 用合适的 swedish-* 技能分析，给**精简**聊天答案
   （ordklass、🇨🇳 中文、English、基本变形、≥3 例句）。
2. 按 `sv-capture` §2 把本次条目累加进**当天**文件 `inbox/capture-<今天日期>.md`：
   - 先 `Read`/`Glob` 该文件：不存在则新建（两部分布局，一个 `svensk-export v1` 块）；
     已存在则 `Edit` 追加——在 `## 速查摘要` 加小节，并把新条目并入已有块的相应 section，更新计数行。
   - 用今天的绝对日期 `YYYY-MM-DD`；words 用 grundform；块内去重（含跨次）；空 section 省略。
   - **一天只有一个文件、只有一个块**：不要一词一文件、不要新建第二个块、不要重写整文件。
3. **不要写 `knowledge_base/`。** 不要自动 import。
4. 按 `sv-capture` §3 给一行回执指针（"已追加到 …，今日累计 …"）。
