---
description: 速查一个瑞典语词/词组/句子/图片，给精简答案并写入 inbox/ 供后续 import（不直接写 KB）
argument-hint: "<瑞典语词/词组/句子/语法问题>，或直接发图片"
allowed-tools: Read, Glob, Grep, Write
---

Use the `sv-capture` skill to do a lightweight lookup of: **$ARGUMENTS**

(若没有 $ARGUMENTS 而是附了图片，对图片执行 sv-capture 的图片分支：先转写确认再分析。)

## 流程

1. 按 `sv-capture` §1 用合适的 swedish-* 技能分析，给**精简**聊天答案
   （ordklass、🇨🇳 中文、English、基本变形、≥3 例句）。
2. 按 `sv-capture` §2 把一个 `svensk-export v1` 块写进 `inbox/capture-<今天日期>-<slug>.md`。
   - 用今天的绝对日期 `YYYY-MM-DD`。
   - words 用 grundform；块内去重；空 section 省略。
   - **不要覆盖**已存在的 inbox 文件（slug 加 `-2` 等后缀）。
3. **不要写 `knowledge_base/`。** 不要自动 import。
4. 按 `sv-capture` §3 给一行回执指针。
