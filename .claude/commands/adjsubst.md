---
description: 生成一页 25 组 adjektiv+substantiv 四式变形到 inbox/（主题按 day-of-year 轮换，去重递进，仅 words 导出块）
argument-hint: "[YYYY-MM-DD] [theme 0-9]  —— 二者可选，定时任务会自动传入"
allowed-tools: Read, Write, Edit, Glob, Bash
---

生成今日的 **adjektiv + substantiv 四式变形** 练习页，写入 `inbox/`。无需审阅、不碰 `knowledge_base/`、不自动 `/import`。

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD` 和一个主题号 `0-9`（顺序不限，都可选）。
**定时任务（headless）会把两者都算好传进来**，所以自动运行时无需任何计算或 Bash。

---

## 1. 定日期与主题 (Date → Theme)

- 若 `$ARGUMENTS` 含 `YYYY-MM-DD` → 用它做 DATE；否则用**今天**（会话上下文里的当前日期）。
- 若 `$ARGUMENTS` 含一个 0–9 的主题号 → **直接用它**，不要再算（定时任务已算好）。
- 仅当未传主题号时（交互手动调用）才计算：`THEME = day-of-year(DATE) mod 10`，可用 Bash
  `date -d "<DATE>" +%j` 或 PowerShell `(Get-Date '<DATE>').DayOfYear`，再 `% 10`。

**主题表（`day-of-year mod 10`）：**

| mod | 主题 | slug | 瑞典语 |
|---|---|---|---|
| 1 | 人物 | personer | Personer |
| 2 | 食物饮料 | mat-dryck | Mat & Dryck |
| 3 | 衣物 | klader | Kläder |
| 4 | 家居家具 | hem-mobler | Hem & Möbler |
| 5 | 自然 | natur | Natur |
| 6 | 城市交通 | stad-trafik | Stad & Trafik |
| 7 | 工作学校 | arbete-skola | Arbete & Skola |
| 8 | 身体健康 | kropp-halsa | Kropp & Hälsa |
| 9 | 动物 | djur | Djur |
| 0 | 混合 | blandat | Blandat |

## 2. 查去重台账 (Dedup ledger)

`Read` → `inbox/_used-vocab-adjsubst.md`。这是按「日期 — 主题」累积的已用词记录。

- **去重范围 = 按主题**：只看该主题以往用过的 adjektiv / substantiv，本次**不要重复**它们。
- **难度递进（长期数月～一年维度）**：该主题先用**最常见**的词；常见词用完了，下一轮才引入较罕见的词。
- **同页内**：25 个 adjektiv、25 个 substantiv 各自**不得重复**。
- adjektiv 跨主题可复用（形容词池有限），名词按主题天然不冲突。

挑选目标：为本主题选 **25 个名词**（最常见、未在本主题用过的优先）+ **25 个形容词**（常见、贴合主题，未在本主题用过的优先；可含 en/ett 形容词搭配演示用的特殊词）。

## 3. 生成四式变形 — 语法自检清单（必须无误）

每行 = 一个 adjektiv + 一个 substantiv，给出四式 + 中文：
**Obestämd sg. → Bestämd sg. → Obestämd pl. → Bestämd pl.**

逐行对照下列规则，写完后再复查一遍：

**冠词与基本骨架**
- en-ord 不定单数：`en + adj(grund) + 名词`（en stor hund）
- ett-ord 不定单数：`ett + adj+**t** + 名词`（ett stort hus）← ett-ord 形容词加 **-t**
- 定单数：`den/det + adj+**a** + 名词+定尾`（den stora hunden / det stora huset）
- 不定复数：`adj+**a** + 名词复数`（stora hundar）← 无冠词
- 定复数：`de + adj+**a** + 名词复数+定尾`（de stora hundarna）
- ⚠️ 定式与所有复数里，形容词一律 **-a 形**（无性数区别），只有不定单数才分 en/ett。

**形容词 -t（neutrum）特例**
- 一般：`stor→stort, snabb→snabbt, brun→brunt`
- 以 **-d** 结尾：`vild→vilt, god→gott, röd→rött`
- 单音节、重读**元音**结尾：双写 t：`grå→grått, blå→blått, ny→nytt, fri→fritt`
- 元音+t（长元音）：双写 t、缩短元音：`vit→vitt, söt→sött, het→hett, blöt→blött, våt→vått`
- 已以 **-t/-tt** 结尾（前接辅音）：不再加：`svart→svart, intelligent→intelligent`
- 以 **-a/-e** 结尾的形容词不变：`bra→bra, öde→öde`

**形容词 -a 形（定式/复数）的 syncope（缩syncope）**
- `-el/-en/-er` 结尾的形容词在 -a 形里脱去中间的 e：
  `gammal→gamla, vacker→vackra, nyfiken→nyfikna, trogen→trogna, mogen→mogna, enkel→enkla`

**特殊/不规则形容词**
- `liten`：ett 形 **litet**，定单数 **lilla**（den lilla / det lilla），复数（不定+定）**små**（små / de små）
- `gammal`：ett 形 **gammalt**，-a 形 **gamla**
- 分词作形容词：`bruten→brutet→brutna, stängd→stängt→stängda, målad→målat→målade`
- 双写辅音的保持：`tjock→tjockt→tjocka, snabb→snabbt→snabba, långsam→långsamt→långsamma`

**名词复数与定尾（务必正确）**
- 五类复数：`-or`(en flicka→flickor)、`-ar`(en hund→hundar)、`-er`(en sak→saker)、`-n`(ett äpple→äpplen)、`-∅`(ett hus→hus, en lärare→lärare)
- 定尾：en-ord 单数 +en/-n，复数 +na；ett-ord 单数 +et/-t，复数 +en
- **syncope 名词**：`fågel→fågeln→fåglar→fåglarna, tiger→tigern→tigrar→tigrarna, spindel→spindeln→spindlar→spindlarna`
- **不规则复数**（必查 swedish-dictionary 心算确认）：`mus→möss, fot→fötter, hand→händer, man→män, bok→böcker, tand→tänder, get→getter, ko→kor, öga→ögon, öra→öron, barn→barn, får→får, djur→djur, lejon→lejon`

> 拿不准任何一个变形时，调用 `swedish-dictionary` 技能核对，不要猜。**语法错误是本任务最严重的问题。**

## 4. 写文件 (Write the inbox page)

写入 `inbox/adjsubst-<DATE>-<slug>.md`，结构（照搬既有页，如 `adjsubst-2026-06-08-djur.md`）：

```
---
type: adjsubst-bojning
date: <DATE>
theme: <瑞典语主题> (<中文>)
status: ready
---

# Adjektiv + substantiv böjning — <DATE> (<主题>)

25 组 adj + subst 四式变形。导入命令：`/import adjsubst-<DATE>-<slug>.md`
导出块只含 words（精简种子，无 böjning）→ /import 会对每词跑完整 swedish-dictionary 生成完整词条。
böjning 变形见下方人读复习表。

## 复习表（人读用，不导入）

| Obestämd sg. | Bestämd sg. | Obestämd pl. | Bestämd pl. | 中文 |
|---|---|---|---|---|
| …25 行… |

## 导入块（words only · 精简种子）

​```svensk-export v1
date: <DATE>
source: Adjektiv+substantiv böjning (<English theme>)
words:
- <adj> | adjektiv | <中文> | <English>
- <subst> | substantiv (en-ord|ett-ord) | <中文> | <English>
- …共 50 词（25 adj + 25 subst，按复习表顺序交替）…
​```
```

**导出块铁律**：
- 只含 `words` 一节，**不要** sentences/phrases/grammar。
- 每词只 4 字段：`lemma | 词性 | 中文 | 英文`，**故意不写 böjning**（变形只留在上方复习表）。
- 词性用 `adjektiv` / `substantiv (en-ord)` / `substantiv (ett-ord)`。
- 单词一律 **grundform**（名词单数不定形、形容词原级）。
- 50 词在块内不重复。

## 5. 更新台账 (Append ledger)

`Edit` → `inbox/_used-vocab-adjsubst.md`，追加一节（**幂等**：若已存在该 `<DATE>` 的小节，则
替换它而非重复追加；做去重选词时，把这个待替换的同日小节排除在「已用」之外）：

```
## <DATE> — <主题> (<中文>)

### Adjektiv
<逗号分隔的 25 个形容词 grundform>

### Substantiv
<逗号分隔的 25 个名词 grundform>
```

## 6. 收尾 (Finish)

输出一行精简确认（headless 包装脚本会据此发系统通知）：

```
✅ adjsubst 已生成: inbox/adjsubst-<DATE>-<slug>.md  ·  主题 <主题>  ·  25 组 / 50 词
⏭ 想录入知识库：/import adjsubst-<DATE>-<slug>.md
```

不写 `knowledge_base/`、不 rebuild 站点、不自动 import —— 那些是日后手动 `/import` 的事。
