---
name: "source-command-dagens-scenario"
description: "生成今日情景练习（对话/功能文本/小故事）到 inbox/（一周一轮、每天 5 篇，按 day-of-year 轮换 35 个国家考试体裁，含人读正文 + svensk-export 导入块）"
---

# source-command-dagens-scenario

Use this skill when the user runs `/dagens-scenario` or asks to run the migrated Claude Code command `dagens-scenario` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

生成**今日的情景练习**（对话 / 功能性文本 / 小故事），写入 `inbox/`。无需审阅、不碰 `knowledge_base/`、不自动 `/import`。
**节奏：一周一轮——每天生成 5 篇，7 天覆盖全部 35 个体裁一次。**

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD` 和一个可选 `0-34` 的主题号（顺序不限）。
**不带主题号 = 批量模式（生成当天 5 篇）；带主题号 = 单篇模式（只生成那一篇）。** 自动运行时无需 Bash。

---

## 1. 定日期与今日批次 (Date → Today's batch)

**节奏：一周一轮，每天 5 篇。** 35 个主题分到 7 天 → 每天生成 **5 篇**，7 天正好把 35 个体裁全部轮一次。
当天取哪 5 篇由 `OFFSET = day-of-year(DATE) mod 7`（0–6）决定：取**所有满足 `index mod 7 == OFFSET`** 的行，
即 `{OFFSET, OFFSET+7, OFFSET+14, OFFSET+21, OFFSET+28}`。主题表按难度交错排，stride-7 选出的 5 篇天然
**跨难度、跨 type**（每天都有易有难、有 dialog/story/text），不会"一天全简单、一天全论说"。

- 若 `$ARGUMENTS` 含 `YYYY-MM-DD` → 用它做 DATE；否则用**今天**（会话上下文里的当前日期）。
- **不带主题号（裸调 / 定时任务）= 批量模式**：算 `OFFSET = day-of-year(DATE) mod 7`，生成今天 5 篇
  （上面那 5 个 index）。**逐篇完整生成**：先把第 1 篇整文件写完(Write)，再做第 2 篇……每篇质量独立，别 5 篇糊一起。
- 含一个 0–34 的主题号 = **单篇模式**：只生成那一个 index（手动指定体裁 / 补漏 / 逐篇调用时用）。

**主题表（一周一轮；当天取 `index mod 7 == day-of-year mod 7` 的 5 行）—— 35 个主题，覆盖 SFI /
Svenska som andraspråk 的**国家考试 (Nationella prov)** 体裁：**日常生存场景（A2）→ 社会·功能性文本
（A2–B1，含 ⭐ 用户点名的小区帖／学校通知／社区通知／面试）→ 论说·正式写作（A2–B1，避免 B2）。type 已为每个主题
指定。**完整体裁说明（语域、对应 delprov）见 `.agents/skills/sv-scenario/SKILL.md` §2 体裁目录。**

| index | type | 主题 (Swedish) | slug | 中文 | CEFR |
|---|---|---|---|---|---|
| 0 | story | Min vardag | min-vardag | 我的日常 | A2 |
| 1 | dialog | Fråga efter vägen | fraga-efter-vagen | 问路 | A2 |
| 2 | text | Anslag i trapphuset: vattenavstängning och container | anslag-vattenavstangning-container | 楼道公告：停水与院内集装箱（社区通知 ⭐） | A2 |
| 3 | dialog | På café — beställa fika | pa-cafe-bestalla-fika | 咖啡馆点餐 | A1–A2 |
| 4 | text | SMS till en vän | sms-till-en-van | 给朋友发短信 | A2 |
| 5 | story | En helg — vad jag gjorde | en-helg | 周末做了什么 | A2 |
| 6 | dialog | Handla i mataffären | handla-i-mataffaren | 在超市购物 | A2 |
| 7 | text | Information från skolan: kallelse till utvecklingssamtal | skolinfo-utvecklingssamtal | 学校通知：家长发展谈话邀请 ⭐ | A2–B1 |
| 8 | dialog | Hos läkaren | hos-lakaren | 看医生 | A2–B1 |
| 9 | text | Inbjudan till ett kalas (med OSA) | inbjudan-kalas | 生日聚会邀请函 | A2 |
| 10 | story | Min familj | min-familj | 我的家庭 | A1–A2 |
| 11 | dialog | Boka tid på telefon | boka-tid-pa-telefon | 电话预约 | A2 |
| 12 | text | Inlägg i grannforumet: störande musik | grannforum-storande-musik | 邻里论坛帖：扰民音乐（小区讨论帖 ⭐） | A2–B1 |
| 13 | dialog | Resa med buss och tåg | resa-med-buss-och-tag | 乘公交和火车 | A2 |
| 14 | text | Anslag i tvättstugan | anslag-i-tvattstugan | 洗衣房告示 | A2 |
| 15 | dialog | Arbetsintervju: jobb som vårdbiträde | arbetsintervju-vardbitrade | 求职面试：护理助理（面试 ⭐） | A2–B1 |
| 16 | text | Brev till en vän om mitt nya liv i Sverige | brev-till-van-nya-livet | 给朋友写信：在瑞典的新生活 | A2 |
| 17 | text | Berätta och ge råd: tips inför SFI | rad-borja-pa-sfi | 给即将上 SFI 的朋友的建议 | A2 |
| 18 | dialog | På restaurang — beställa middag | pa-restaurang-bestalla-middag | 餐厅点晚餐 | A2 |
| 19 | story | En vändpunkt i mitt liv | vandpunkt-i-mitt-liv | 我人生的转折点 | A2 |
| 20 | text | Annons: lägenhet uthyres | annons-lagenhet-uthyres | 广告：公寓出租 | A2 |
| 21 | dialog | Paruppgift: vad är viktigast där ni bor? | diskussion-viktigast-dar-ni-bor | 双人讨论：住处什么最重要（班级辩论 ⭐） | A2–B1 |
| 22 | text | Instruktion: så källsorterar du hemma | instruktion-kallsortering | 说明：在家如何垃圾分类 | A2 |
| 23 | text | Felanmälan till hyresvärden | felanmalan-hyresvard | 向房东报修 | A2–B1 |
| 24 | story | Vädret och årstiderna | vadret-och-arstiderna | 天气与季节 | A2 |
| 25 | text | Notis: ny cykelbana invigd i staden | notis-ny-cykelbana | 简讯：城市新自行车道 | A2 |
| 26 | text | Insändare: behöver vårt område fler cykelvägar? | insandare-fler-cykelvagar | 投书：小区需要更多自行车道吗？ | A2–B1 |
| 27 | text | Recension: en film jag nyligen sett | recension-film | 评论：我最近看的电影 | A2–B1 |
| 28 | dialog | Tidningsintervju: en bagare om sitt yrke | intervju-bagare-yrke | 报刊采访：面包师谈职业（人物专访 ⭐） | A2–B1 |
| 29 | text | Platsannons och ett kort jobbsvar | platsannons-och-jobbsvar | 招聘启事与求职回信 | A2–B1 |
| 30 | text | Mejl till hyresvärden | mejl-till-hyresvarden | 给房东发邮件（正式） | A2–B1 |
| 31 | text | Faktatext: källsortering och återvinning i Sverige | faktatext-atervinning | 事实文：瑞典的垃圾分类与回收 | A2–B1 |
| 32 | text | Krönika: att vara ny i ett nytt land | kronika-ny-i-nytt-land | 专栏随笔：在陌生国家当新人 | A2–B1 |
| 33 | text | Schema och öppettider: veckoprogram och tidtabell | schema-oppettider-tidtabell | 日程与时刻表 | A2 |
| 34 | text | Debattinlägg: sociala medier och ungas hälsa | debattinlagg-sociala-medier | 辩论帖：社交媒体与年轻人健康 | A2–B1 |

## 2. 读档案 + 查重 (Profile & light dedup)

- `Read` → `profile/level.md`：把已掌握（known）词尽量融入作复习，再引入约 **5–10 个新词/词组**。
- `Glob`/`Grep` → 查 `inbox/` 与 `imported/` 是否已有同 slug 的旧文件（每个主题每 7 天轮回一次，同一 OFFSET 每周回来）。
  若有，**换一个具体情境/角度并尽量用不同的生词**，不要写出几乎一样的文本。

## 3. 生成情景 (Generate — 遵循 sv-scenario 技能)

**批量模式：对今天选出的每个 index 依次完整跑一遍 §3+§4（生成→写文件），写完一篇再做下一篇。**
每篇都严格按 **`sv-scenario` 技能的 §2 体裁目录与篇幅、§3 水平规则、§4 输出契约**生成：
- 用本主题指定的 `type`（dialog 6–12 轮 / text 80–150 词 / story 80–150 词）。
- **按体裁选语域**（SKILL §2c）：论说/正式体裁（insändare、debattinlägg、formellt brev、felanmälan、
  referat）用书面、礼貌、结构化语域，CEFR 以 A2–B1 为主，避免 B2；功能性体裁（anslag、annons、schema）
  简洁要点式，A2 即可；对话体裁用自然口语，面试/辩论比闲聊正式半档。
- 水平以 **A1–A2 为主**，适量 B1 可接受（如面试、报修等实用场景），**避免 B2**；论说体裁也用简单词汇和短句写。
- 词汇一律 **grundform**。
- `sentences:` 必须覆盖文本中每一个有意义的句子（对话每一轮、文本每一句）。**非连续文本**
  （blankett/schema/diagram，SKILL §2b）只把完整的指令/说明句收进 `sentences:`，不要把表格字段硬拆成句子。

## 4. 写文件 (Write the inbox page)

每篇写入 `inbox/scenario-<DATE>-<slug>.md`（批量模式 = 今天 5 个文件，各用各自的 slug），**结构完全照搬 `sv-scenario` 技能 §4a + §4b**：

1. **可读情景**（§4a）：`# 🇸🇪 标题`、类型/CEFR/日期元信息、`## 瑞典语原文`、`## 🇨🇳 全文翻译`、`## 📌 教学备注`（2–4 条）。
2. 紧接一个 fenced ` ```svensk-export v1 ` 块（§4b）：`date` / `source: scenario — <主题>` / `words` / `phrases` / `sentences` / `grammar`。

导入命令写进正文提示行：`/import scenario-<DATE>-<slug>.md`。

## 5. 收尾 (Finish)

**批量模式**：5 篇全部写完后，输出一段汇总（headless 包装脚本据此发系统通知）：

```
✅ 今日情景已生成 5 篇 (offset=<OFFSET>):
   - inbox/scenario-<DATE>-<slug1>.md · <type> · <CEFR>
   - inbox/scenario-<DATE>-<slug2>.md · <type> · <CEFR>
   - …（共 5 篇）
⏭ 录入：对每个文件跑 /import scenario-<DATE>-<slug>.md（或 routine 会自动逐篇 import）
```

**单篇模式**只报那一篇。

不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是 `/import` 阶段的事。