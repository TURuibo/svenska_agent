---
name: "source-command-dagens-horovning"
description: "抓取最新一集 SVT「Nyheter på lätt svenska」(简易瑞典语新闻视频)的字幕原文+时间轴，配中文翻译与生词，生成听力练习数据并重建 Lyssna 听力站"
---

# source-command-dagens-horovning

Use this skill when the user runs `/dagens-horovning` or asks to run the migrated Claude Code command `dagens-horovning` in Codex.

Use Codex's available equivalents for any Claude-specific tools named in the source command (for example web browsing instead of WebFetch/WebSearch, shell commands instead of Bash, and the matching Codex subagent role when available). Use the current session's absolute date; any <DATE> placeholder below means today's date in YYYY-MM-DD format.

## Migrated Command Spec

抓取 **SVT「Nyheter på lätt svenska」**(SR/SVT 的简易瑞典语新闻**视频**，每个工作日 ~17:25，约 4.5 分钟)
的**字幕原文 + 时间轴**，配上**逐句中文翻译**与**生词表**，写成一集听力数据 `listening/svt-latt-<DATE>.json`，
再重建 **Lyssna 听力站**(`site/listening/`)。供在网页里**精听/盲听/跟读/单句循环**。

> 只存元数据 + 我生成的译文/生词；音频和字幕**实时从 SVT 的 CDN 取**(不下载、不转存)。媒体 URL 仅在该集
> 可看期内(~1 周)有效，过期后站点会提示并回退到「在 SVT Play 看」。

参数 `$ARGUMENTS`：可含一个 SVT video id(如 `eakkN4D`)。缺省则自动取**最新一集**。

> ⚠️ **Remote 环境注意事项（2026-06-22 经验总结）：**
> 1. `https://www.svtplay.se/nyheter-pa-latt-svenska` 在 remote 环境返回 **HTTP 403**，无法直接抓。
> 2. 用搜索引擎找到的 video id 往往是**过时缓存**，即使标着「Idag/今日」也可能是数周前的旧集。
> 3. **可靠方案**：直接 `WebFetch` → `https://webb-tv.nu/svt-nyheter-pa-latt-svenska-svt-play/`，
>    该页面列出真实的最新集 id（格式 `/video/<ID>/`），认准今天日期对应的那条。
> 4. 若 `api.svt.se/video/<ID>` 返回空 `videoReferences`/`subtitleReferences`，说明 id 错误，
>    回去 webb-tv.nu 找正确 id。

---

## 1. 找最新一集 (Resolve episode)

- 若 `$ARGUMENTS` 给了 video id → 直接用。
- 否则：
  1. **优先** `WebFetch` → `https://webb-tv.nu/svt-nyheter-pa-latt-svenska-svt-play/`，
     取页面中当天日期对应的 `/video/<ID>/` 链接，提取 `<ID>`。
  2. 备选：`WebSearch` 搜索 `site:svtplay.se "nyheter på lätt svenska" <今日日期>`，
     但务必用 `api.svt.se/video/<ID>` 验证返回的 `videoReferences` 非空后才信任该 id。
  3. 不可直接 `WebFetch` svtplay.se 主页（remote 环境 403）。

## 2. 取媒体 + 字幕 (SVT API)

1. `WebFetch` → `https://api.svt.se/video/<ID>`，从 JSON 取：
   - `subtitleReferences` 里**瑞典语 WebVTT** 字幕 URL(`…/text/text-auto.vtt`)；
   - `videoReferences` 里 **HLS** 流 URL(优先 `hls-cmaf-full.m3u8`，没有就 `hls-cmaf-avc.m3u8` 等 `.m3u8`)；
   - `contentDuration`(秒)。
2. `WebFetch` 那个 `.vtt` URL → **逐句字幕**(每条带 `start --> end` 时间轴 + 瑞典语文本)。原样保留分句，
   末尾的 "Textning: SVT…©" 版权行可丢弃。

## 3. 翻译 + 学习项 (遵循 swedish 技能)

- 对**每一条字幕**给出忠实的**简体中文翻译**(逐句对齐，便于对照精听)。
- 抽取学习项，**全部用 grundform**，分类遵循 `swedish-dictionary` / `swedish-phrases` / `swedish-grammar`：
  - **生词** 10–15 个：`lemma`(grundform，作 KB slug 用) + 显示形 `sv` + `pos` + `zh` + `en`。
    显示形可保留字幕里的形态(如 `akuten`)，但 `lemma` 必须是基础形(`akut`)。
  - **词组** 3–6 个：`lemma`(grundform) + `sv` + `category` + `zh` + `en`。
  - **语法** 1–3 个：`name`/`lemma` + `zh` + `en`。

## 4. 查重 + 写数据文件 — ⚠️ JSON 中文引号陷阱

- `Glob`/检查 `listening/svt-latt-<DATE>.json` 是否已存在(按播出日期)。**已存在则不重复抓取**，
  直接跳到第 5 步重建即可(除非用户显式要求重抓)。
- 否则写 `listening/svt-latt-<DATE>.json`，schema：

```json
{
  "id": "<SVT video id>",
  "date": "<YYYY-MM-DD 播出日期>",
  "title": "Nyheter på lätt svenska — <D mon>",
  "source": "SVT Nyheter på lätt svenska",
  "duration": <秒>,
  "cefr": "A2–B1",
  "svtPlayUrl": "https://www.svtplay.se/video/<ID>/nyheter-pa-latt-svenska",
  "hlsUrl": "<.m3u8>",
  "vttUrl": "<.vtt>",
  "cues": [ { "start": <秒.毫秒>, "end": <秒.毫秒>, "sv": "<瑞典语>", "zh": "<中文>" }, … ],
  "vocab":   [ { "sv": "<显示形>", "lemma": "<grundform>", "pos": "<词性>", "zh": "<中文>", "en": "<English>" }, … ],
  "phrases": [ { "sv": "<词组>", "lemma": "<grundform>", "category": "<类型>", "zh": "<中文>", "en": "<English>" }, … ],
  "grammar": [ { "name": "<语法点>", "lemma": "<语法点>", "zh": "<中文>", "en": "<English>" }, … ]
}
```

时间戳转成**秒**(浮点，如 `00:01:57.800` → `117.8`)。

> ⚠️ **JSON 中文引号陷阱**：在 `zh` 字段里，绝对**不要**用 ASCII 双引号 `"` (U+0022) 作为汉语中的
> 引号（如 `"错误的"朋友`）——这会提前截断 JSON 字符串，导致 `JSON.parse` 报错。
> 有两种安全做法（优先选前者）：
> 1. **改写译文，绕开引号**（推荐）：`"错误的"朋友` → `所谓错误的朋友` 或 `问题朋友`。
> 2. **用 Unicode 弯引号**（次选）：`"` (U+201C) 和 `"` (U+201D)，不会影响 JSON 解析。
>    若用 Bash/Python 脚本写文件，注意 Python 字符串里的 `"` 仍是 ASCII 0x22，需要
>    用变量：`LQUOTE = '“'`，不能直接写 `'"'`。

`tools/build-listening-site.js` 会拿每个 `lemma` 去 `knowledge_base/_index/slugs.json` 匹配，命中就给该条目
加 KB 链接(站点上变成可点 → 跳词条解释页)，所以 `lemma` 一定要是 KB slug 用的 grundform。

## 5. 入库 (KB import — 让它进 recap/搜索/review)

听力学习项要像每日新闻一样**进知识库**(否则不会出现在 recap/Dagbok、主站搜索、`/review`，词卡也无法链接解释)。
所以**额外**写一个导入文件 `inbox/horning-<DATE>.md`：可读正文(原文+🇨🇳) + 一个 fenced ` ```svensk-export v1 ` 块，
块里 `words`(用 lemma) / `phrases` / `sentences`(覆盖**每一条字幕** `sv | zh`) / `grammar`，格式照 `EXPORT_PROTOCOL.md` Part A。
入库由日后 `/import`(或每日脚本 `scripts/daily-listening.ps1` 自动调 `import-and-rebuild.ps1`)完成 —— 本命令不直接写 `knowledge_base/`。

## 6. 重建听力站 + 收尾

- 运行 `node tools/build-listening-site.js`(扫 `listening/*.json` → `site/listening/listening-data.js`)。
- 输出一行精简确认：

```
✅ 今日听力已生成: listening/svt-latt-<DATE>.json (播放) + inbox/horning-<DATE>.md (待入库)
   <N> 句 · <M> 生词 · <P> 词组 · <时长>
🎧 打开主站侧栏「🎧 Lyssna」练习；/import horning-<DATE>.md 入库后词卡可点看解释。
```

> 这是真实字幕抓取，**不得编造**台词或译文。逐句中文翻译要忠实于瑞典语原文。