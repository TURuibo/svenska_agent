---
description: 生成今日情景练习（对话/功能文本/小故事）到 inbox/（主题按 day-of-year 轮换，含人读正文 + svensk-export 导入块）
argument-hint: "[YYYY-MM-DD] [index 0-13]  —— 二者可选，定时任务会自动传入"
allowed-tools: Read, Write, Edit, Glob, Grep
---

生成**今日的情景练习**（一篇对话 / 功能性文本 / 小故事），写入 `inbox/`。无需审阅、不碰 `knowledge_base/`、不自动 `/import`。

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD` 和一个 `0-13` 的主题号（顺序不限，都可选）。
**定时任务（headless）会把两者都算好传进来**，所以自动运行时无需任何计算或 Bash。

---

## 1. 定日期与主题 (Date → Topic)

- 若 `$ARGUMENTS` 含 `YYYY-MM-DD` → 用它做 DATE；否则用**今天**（会话上下文里的当前日期）。
- 若 `$ARGUMENTS` 含一个 0–13 的主题号 → **直接用它**，不要再算（定时任务已算好）。
- 仅当未传主题号时（交互手动调用）才计算：`INDEX = day-of-year(DATE) mod 14`。

**主题表（`day-of-year mod 14`）—— type 已为每个主题指定，保证 dialog/text/story 交替出现：**

| index | type | 主题 (Swedish) | slug | 中文 |
|---|---|---|---|---|
| 0 | story | Min vardag | min-vardag | 我的日常 |
| 1 | dialog | Fråga efter vägen | fraga-efter-vagen | 问路 |
| 2 | dialog | På café — beställa fika | pa-cafe-bestalla-fika | 咖啡馆点餐 |
| 3 | text | SMS till en vän | sms-till-en-van | 给朋友发短信 |
| 4 | dialog | Handla i mataffären | handla-i-mataffaren | 在超市购物 |
| 5 | story | En helg — vad jag gjorde | en-helg | 周末做了什么 |
| 6 | dialog | Hos läkaren | hos-lakaren | 看医生 |
| 7 | text | Anslag i tvättstugan | anslag-i-tvattstugan | 洗衣房告示 |
| 8 | dialog | Boka tid på telefon | boka-tid-pa-telefon | 电话预约 |
| 9 | story | Min familj | min-familj | 我的家庭 |
| 10 | dialog | Resa med buss och tåg | resa-med-buss-och-tag | 乘公交和火车 |
| 11 | text | Mejl till hyresvärden | mejl-till-hyresvarden | 给房东发邮件 |
| 12 | dialog | På restaurang — beställa middag | pa-restaurang-bestalla-middag | 餐厅点晚餐 |
| 13 | story | Vädret och årstiderna | vadret-och-arstiderna | 天气与季节 |

## 2. 读档案 + 查重 (Profile & light dedup)

- `Read` → `profile/level.md`：把已掌握（known）词尽量融入作复习，再引入约 **5–10 个新词/词组**。
- `Glob`/`Grep` → 查 `inbox/` 与 `imported/` 是否已有同 slug 的旧文件（主题每 14 天会轮回一次）。
  若有，**换一个具体情境/角度并尽量用不同的生词**，不要写出几乎一样的文本。

## 3. 生成情景 (Generate — 遵循 sv-scenario 技能)

严格按 **`sv-scenario` 技能的 §2 篇幅、§3 水平规则、§4 输出契约**生成：
- 用本主题指定的 `type`（dialog 6–12 轮 / text 80–150 词 / story 80–150 词）。
- 水平由情景决定，以 A2–B1 为主，不强行降到 A1。
- 词汇一律 **grundform**。
- `sentences:` 必须覆盖文本中每一个有意义的句子（对话每一轮、文本每一句）。

## 4. 写文件 (Write the inbox page)

写入 `inbox/scenario-<DATE>-<slug>.md`，**结构完全照搬 `sv-scenario` 技能 §4a + §4b**：

1. **可读情景**（§4a）：`# 🇸🇪 标题`、类型/CEFR/日期元信息、`## 瑞典语原文`、`## 🇨🇳 全文翻译`、`## 📌 教学备注`（2–4 条）。
2. 紧接一个 fenced ` ```svensk-export v1 ` 块（§4b）：`date` / `source: scenario — <主题>` / `words` / `phrases` / `sentences` / `grammar`。

导入命令写进正文提示行：`/import scenario-<DATE>-<slug>.md`。

## 5. 收尾 (Finish)

输出一行精简确认（headless 包装脚本会据此发系统通知）：

```
✅ 今日情景已生成: inbox/scenario-<DATE>-<slug>.md  ·  类型 <type>  ·  主题 <主题>  ·  CEFR <估计>
⏭ 想录入知识库：/import scenario-<DATE>-<slug>.md
```

不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是日后手动 `/import` 的事。
