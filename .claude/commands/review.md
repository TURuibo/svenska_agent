---
description: Start a spaced-repetition review session from the knowledge base
argument-hint: [类型/数量/主题，可选，如 "10 words" 或 "家具类"]
---

Run a review session. Constraints (optional): **$ARGUMENTS**

Use the `sv-review` skill. Spawn the `sv-reviewer` subagent to select due items from `knowledge_base/`
and `review/schedule.md` (respect any type/count/topic in the arguments; default 10 mixed items, skip
`known`). Then quiz the user **one item at a time** in the chat, grade with SM-2-lite, and update each
note's frontmatter + `review/schedule.md`. End with a short scoreboard and the next due date.
Reinforce links between related items (synonyms, same topic) as you go.
