---
description: 抓取最新一集 SVT「Nyheter på lätt svenska」(简易瑞典语新闻视频)的字幕原文+时间轴，配中文翻译与生词，生成听力练习数据并重建 Lyssna 听力站
argument-hint: "[svt-video-id]  —— 可选；缺省自动取最新一集"
allowed-tools: WebFetch, WebSearch, Read, Write, Bash
---

抓取 **SVT「Nyheter på lätt svenska」**(SR/SVT 的简易瑞典语新闻**视频**，每个工作日 ~17:15，约 4.5 分钟)
的**字幕原文 + 时间轴**，配上**逐句中文翻译**与**生词表**，写成一集听力数据 `listening/svt-latt-<DATE>.json`，
再重建 **Lyssna 听力站**(`site/listening/`)。供在网页里**精听/盲听/跟读/单句循环**。

> 只存元数据 + 我生成的译文/生词；音频和字幕**实时从 SVT 的 CDN 取**(不下载、不转存)。媒体 URL 仅在该集
> 可看期内(~1 周)有效，过期后站点会提示并回退到「在 SVT Play 看」。

参数 `$ARGUMENTS`：可含一个 SVT video id(如 `eakkN4D`)。缺省则自动取**最新一集**。

---

## 1. 找最新一集 (Resolve episode)

- 若 `$ARGUMENTS` 给了 video id → 直接用。
- 否则 `WebFetch` → `https://www.svtplay.se/nyheter-pa-latt-svenska`，取列表里**最新一集**的
  `/video/<ID>/…` 链接，拿到其 `<ID>` 与播出日期。

## 2. 取媒体 + 字幕 (SVT API)

1. `WebFetch` → `https://api.svt.se/video/<ID>`，从 JSON 取：
   - `subtitleReferences` 里**瑞典语 WebVTT** 字幕 URL(`…/text/text-auto.vtt`)；
   - `videoReferences` 里 **HLS** 流 URL(优先 `hls-cmaf-full.m3u8`，没有就 `hls-cmaf-avc.m3u8` 等 `.m3u8`)；
   - `contentDuration`(秒)。
2. `WebFetch` 那个 `.vtt` URL → **逐句字幕**(每条带 `start --> end` 时间轴 + 瑞典语文本)。原样保留分句，
   末尾的 "Textning: SVT…©" 版权行可丢弃。

## 3. 翻译 + 生词 (遵循 swedish 技能)

- 对**每一条字幕**给出忠实的**简体中文翻译**(逐句对齐，便于对照精听)。
- 选 **10–15 个**最值得记的生词/词组(grundform)，给 `pos`(词性)、`zh`、`en`。分类遵循
  `swedish-dictionary` / `swedish-phrases`。

## 4. 查重 + 写数据文件

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
  "vocab": [ { "sv": "<lemma>", "pos": "<词性>", "zh": "<中文>", "en": "<English>" }, … ]
}
```

时间戳转成**秒**(浮点，如 `00:01:57.800` → `117.8`)。

## 5. 重建听力站 + 收尾

- 运行 `node tools/build-listening-site.js`(扫 `listening/*.json` → `site/listening/listening-data.js`)。
- 输出一行精简确认：

```
✅ 今日听力已生成: listening/svt-latt-<DATE>.json  ·  <N> 句 · <M> 生词 · <时长>
🎧 打开主站侧栏「🎧 Lyssna」即可练习(盲听/精听/单句循环/倍速)。
```

> 这是真实字幕抓取，**不得编造**台词或译文。逐句中文翻译要忠实于瑞典语原文。
