---
description: Assess current Swedish level and update the learner profile
argument-hint: [可选：full | quick]
---

Assess the learner's Swedish level. Mode (optional): **$ARGUMENTS** (default: full).

Use the `sv-assess` skill and spawn the `sv-assessor` subagent. It scans `knowledge_base/` and
`review/schedule.md`, estimates a CEFR/SFI band with concrete evidence, and updates `profile/level.md`
(已掌握 skip-list, 巩固中, 弱点, 建议) plus sets `known: true` on mastered notes. For a `quick` assessment,
estimate from the KB only; for `full`, also ask 5–8 calibrated A1→B2 probe questions first. Summarize the
result and what changed in the profile.
