---
description: Generate a Swedish practice scenario (dialogue/text/narrative) into inbox/ for review then /import
argument-hint: "[dialog|text|story] [A1|A2|B1|B2|C1] <场景描述, e.g. 问路 / asking for directions>"
allowed-tools: Read, Glob, Agent(sv-scenario-writer)
---

Generate a Swedish practice scenario for: **$ARGUMENTS**

## 1. 解析参数 (Parse $ARGUMENTS)

Scan the argument string for optional leading tokens, then treat the remainder as the scenario topic:

**Type token** (optional, case-insensitive, must come first if present):
- `dialog` → conversation with speaker turns
- `text` → functional text (email, notice, SMS, menu, sign)
- `story` → short narrative

**Level token** (optional, case-insensitive, may come before or after the type token):
- Any token matching `A1`, `A2`, `B1`, `B2`, `C1`, `C2` → pass as a CEFR hint to the generator.

**Scenario topic** — everything remaining after removing the type/level tokens. May be Chinese or English.
If type and/or level are absent, pass `auto` / empty string respectively — the `sv-scenario-writer`
subagent will decide based on the topic and the learner's profile.

Examples of how to parse:
- `/scenario 问路` → type=auto, level=, topic="问路"
- `/scenario dialog B1 beställa mat på restaurang` → type=dialog, level=B1, topic="beställa mat på restaurang"
- `/scenario text hyresavi från hyresvärden` → type=text, level=, topic="hyresavi från hyresvärden"
- `/scenario story min första dag i Sverige` → type=story, level=, topic="min första dag i Sverige"

## 2. 计算 inbox 路径 (Compute the inbox path)

Transliterate the scenario topic to an ascii kebab-case slug:
- å / ä → a
- ö → o
- Spaces and punctuation → `-`
- All lowercase; strip leading/trailing hyphens; collapse runs of hyphens to one.

Compute the inbox target path:
```
inbox/scenario-2026-06-03-<slug>.md
```

For example, topic "fråga efter vägen" → slug `fraga-efter-vagen` → path `inbox/scenario-2026-06-03-fraga-efter-vagen.md`.

Use the absolute path based on the project root as needed by the Write tool.

## 3. 生成情景 (Spawn the subagent)

Spawn the `sv-scenario-writer` subagent (Agent tool) with these inputs:
- **topic** — the parsed scenario topic (free text)
- **type** — the parsed type token, or `auto` if absent
- **level** — the parsed CEFR token, or empty string if absent
- **inbox_path** — the absolute path computed in step 2
- **date** — `2026-06-03`

Wait for the subagent to complete and return its concise manifest.

## 4. 聊天摘要回复 (Chat digest reply)

Output a concise summary using the manifest returned by the subagent. Format:

```
🇸🇪 情景已生成: <title>

  类型: dialog / text / story   CEFR: <estimate>
  提取: <n> 词 · <n> 词组 · <n> 句子 · <n> 语法点

📁 已写入: inbox/scenario-2026-06-03-<slug>.md

⏭ 审阅后运行 /import 录入（或 /import scenario-2026-06-03-<slug>.md）
   尚未写入 knowledge_base/ — 一切等 /import 完成后再正式录入。
```

Do NOT paste the full scenario text in the chat reply — keep it to the digest above.
Do NOT auto-import. Do NOT write anything to `knowledge_base/`.
