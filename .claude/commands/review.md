---
description: Start a spaced-repetition review session from the knowledge base
argument-hint: [类型/数量/主题，可选，如 "10 words" 或 "家具类"]
---

Run a review session. Constraints (optional): **$ARGUMENTS**

Use the `sv-review` skill. Select due items with `node tools/schedule.js due` (respect any
type/count/topic in the arguments; default 10 mixed items, `known` already skipped) — spawn the
`sv-reviewer` subagent only if the quiz needs heavier preparation. **Never Read `review/schedule.md`
directly** (~75k tokens). Quiz the user **one item at a time** in the chat, grade with SM-2-lite, and
record each grade with `node tools/schedule.js update <slug> --q <0-5>` (writes note frontmatter +
schedule row). End with a short scoreboard and the next due date.
Reinforce links between related items (synonyms, same topic) as you go.
