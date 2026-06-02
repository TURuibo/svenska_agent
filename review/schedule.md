# 🔁 复习计划 (Review Schedule)

> 轻量 SM-2 间隔复习日志。由 `/review` (subagent `sv-reviewer`) 维护。
> 每条笔记的 frontmatter 也保存 `reviewed / interval / ease / review_count`；本表是汇总视图。
> 规则见 [.claude/skills/sv-review](../.claude/skills/sv-review/SKILL.md)。

## 待复习 / 已排期 (Items)

| slug | type | last reviewed | interval(d) | ease | due | known |
|------|------|---------------|-------------|------|-----|-------|
| [[arbeta]] | word | — | 0 | 2.5 | 立即 | no |
| [[jobba]] | word | — | 0 | 2.5 | 立即 | no |
| [[jobb]] | word | — | 0 | 2.5 | 立即 | no |
| [[sent-jag-arbetar-pa-ett-sjukhus]] | sentence | — | 0 | 2.5 | 立即 | no |
| [[grammar-v2-ordfoljd]] | grammar | — | 0 | 2.5 | 立即 | no |
| **— Astrid Lindgren 文章 (2026-06-02) — 40词 / 10词组 / 3句 / 4语法 —** | | | | | | |
| [[barnboksförfattare]] | word | — | 0 | 2.5 | 立即 | no |
| [[bonde]] | word | — | 0 | 2.5 | 立即 | no |
| [[barndom]] | word | — | 0 | 2.5 | 立即 | no |
| [[syskon]] | word | — | 0 | 2.5 | 立即 | no |
| [[saga]] | word | — | 0 | 2.5 | 立即 | no |
| [[förutom]] | word | — | 0 | 2.5 | 立即 | no |
| [[tvungen]] | word | — | 0 | 2.5 | 立即 | no |
| [[ensam]] | word | — | 0 | 2.5 | 立即 | no |
| [[gravid]] | word | — | 0 | 2.5 | 立即 | no |
| [[gift]] | word | — | 0 | 2.5 | 立即 | no |
| [[döpa]] | word | — | 0 | 2.5 | 立即 | no |
| [[längta]] | word | — | 0 | 2.5 | 立即 | no |
| [[berätta]] | word | — | 0 | 2.5 | 立即 | no |
| [[annorlunda]] | word | — | 0 | 2.5 | 立即 | no |
| [[modig]] | word | — | 0 | 2.5 | 立即 | no |
| [[orättvisa]] | word | — | 0 | 2.5 | 立即 | no |
| [[minnas]] | word | — | 0 | 2.5 | 立即 | no |
| [[fortsätta]] | word | — | 0 | 2.5 | 立即 | no |
| [[orolig]] | word | — | 0 | 2.5 | 立即 | no |
| [[lycklig]] | word | — | 0 | 2.5 | 立即 | no |
| [[tråkig]] | word | — | 0 | 2.5 | 立即 | no |
| [[låna]] | word | — | 0 | 2.5 | 立即 | no |
| [[klättra]] | word | — | 0 | 2.5 | 立即 | no |
| [[ovanlig]] | word | — | 0 | 2.5 | 立即 | no |
| [[samhälle]] | word | — | 0 | 2.5 | 立即 | no |
| [[sekreterare]] | word | — | 0 | 2.5 | 立即 | no |
| [[hemmafru]] | word | — | 0 | 2.5 | 立即 | no |
| [[bokförlag]] | word | — | 0 | 2.5 | 立即 | no |
| [[vuxen]] | word | — | 0 | 2.5 | 立即 | no |
| [[bestämma]] | word | — | 0 | 2.5 | 立即 | no |
| [[ta-hand-om]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[bland-annat]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[hitta-på]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[hälsa-på]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[tacka-nej]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[tacka-ja]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[kämpa-mot]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[leva-kvar]] | phrase | — | 0 | 2.5 | 立即 | no |
| [[sent-eftersom-astrid-var-ensam-kunde-hon]] | sentence | — | 0 | 2.5 | 立即 | no |
| [[sent-de-forstod-ocksa-att-barn-behover-leka]] | sentence | — | 0 | 2.5 | 立即 | no |
| [[sent-de-var-oroliga-att-barn-som-laste-om-pippi]] | sentence | — | 0 | 2.5 | 立即 | no |
| [[grammar-preteritum-oregelbundna]] | grammar | — | 0 | 2.5 | 立即 | no |
| [[grammar-bisats-eftersom]] | grammar | — | 0 | 2.5 | 立即 | no |
| [[grammar-att-sats]] | grammar | — | 0 | 2.5 | 立即 | no |
| [[grammar-sin-sina]] | grammar | — | 0 | 2.5 | 立即 | no |

## 说明

- `due = last_reviewed + interval`；`due = 立即` 表示从未复习。
- 答对：interval 按 1 → 6 → round(interval×ease) 增长；答错：interval 归 1，ease 降 0.2（下限 1.3）。
- 连续答对且确认掌握 → 设 `known: true`，移出复习，并通知 `sv-assessor` 记入档案。
