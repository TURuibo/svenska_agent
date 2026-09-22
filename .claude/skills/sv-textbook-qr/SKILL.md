---
name: sv-textbook-qr
description: End-to-end runbook for a photographed SFI textbook page (Språkvägen, Rivstart, Mål …) — especially pages carrying a QR code that links to the publisher's audio recording. Use this skill whenever Ruibo sends photos of textbook/coursebook pages, a handout, or any printed Swedish lesson material, and ALWAYS when a QR code is visible on the page or he mentions the QR/audio/听力. It covers transcription, KB storage, archiving the readable text into imported/ for the 📖 Läsning site, decoding the QR, fetching the Blipsay audio, building the 🎧 Lyssna listening episode with estimated cue timings, and cross-linking the two. Do NOT use it for generated material (/scenario, /dagens-artikel) — those already go through /import.
---

# sv-textbook-qr — 教材拍照件（含 QR 音频）完整流程

一次拍照 → **三个去处**：知识点进 `knowledge_base/`、可读正文进 📖 Läsning、朗读音频进 🎧 Lyssna，
并让两站互跳。照 §1–§7 顺序跑；没有 QR 码就跳过 §4–§6。

```
📷 照片 ──①转写确认──②KB(sv-librarian) ──③imported/ 文章 ──┐
                                                          ├──⑦互跳 + /sync
   QR ──④解码──⑤下载音频──⑥listening/*.json + 字幕 ───────┘
```

## 1. 转写 (Transcribe)

按 `swedish-text-analysis`：先把整页瑞典语原文转写出来，放进代码块给 Ruibo 确认，再往下做。
**照抄原文**，不改写、不补全、不跳过图片说明（bildtext 也是学习素材）。多页照片按页码顺序拼成一篇。

## 2. 拆进知识库 (KB)

spawn **前台** `sv-librarian`（教材一页通常 40–80 条，属于批量），交给它：
- 词/词组/句子/语法的完整清单（grundform），
- 要建的 `topics/` 主题（如选举题材 → `topic-val-demokrati`），
- `sources/source-<date>-<slug>.md` 的 slug。

查重按 CLAUDE.md §3：已存在的**只补链、不重建**。教材里的复合词记得串成 word family
（`val-`：valdag/vallokal/valsedel/valaffisch/…）。

## 3. 归档可读正文 (→ 📖 Läsning)

**必做**（CLAUDE.md §4 的固定偏好）：在 `imported/` 写 `paste-<YYYY-MM-DD>-<slug>.md`：

```markdown
# 🇸🇪 <标题> （SFI s. <页码>）

**体裁:** 教材课文（<教材名> s. <页码> · 主题：…）
**CEFR 估计:** <A2 / B1 …>
**生成日期:** <YYYY-MM-DD>
**来源:** 拍照转写（课堂教材，含 QR-kod 听力音频）

## 瑞典语原文 (Källtext)
## 🇨🇳 全文翻译 (Översättning)
## 📌 教学备注 (Teaching Notes)

```svensk-export v1
# words / # phrases / # sentences / # grammar
```
```

⚠️ **文末的 `svensk-export v1` 块不能省** —— 阅读站的「学习项」面板只从它解析，漏了正文能读但面板是空的。
内容直接取自 sv-librarian 刚写入的 KB 笔记。

## 4. 解码 QR (只在有 QR 时)

书上的 QR 很小，直接解常常失败 —— **先放大 2–4 倍**：

```bash
python3 -c "import cv2;i=cv2.imread('page.jpg');i=cv2.resize(i,None,fx=3,fy=3);print(cv2.QRCodeDetector().detectAndDecode(i)[0])"
```

（缺 opencv 就 `pip install opencv-python-headless`。）Språkvägen 系列解出来是
`https://blip.sano.ma/player/a/<code>` —— **Blipsay 听读码**，指向出版社的朗读音频。

## 5. 取音频

```bash
python3 tools/blipsay-audio.py <code> --info          # 先看元数据：篇名、页码、时长
python3 tools/blipsay-audio.py <code> -o site/listening/media/<slug>.mp3
```

脚本里写了完整接口链（byCode → playlist → POST soundfiles/sf，base64 解码）。
元数据里的 `duration` 就是 §6 排字幕要用的秒数；`name`/`page` 用来核对抓的是不是这一篇。

> 📌 **版权取舍**：SVT 那条线是**不转存**、实时流播。教材音频没有可跨域直连的地址，所以按 Ruibo
> 2026-09-22 的决定**下载存进 repo**（`site/listening/media/`，随 gh-pages 公开）。沿用即可，但**第一次
> 给新出版社的素材时提一句风险**，让他确认。

## 6. 建听力集 (→ 🎧 Lyssna)

把课文切成**句级** TSV（`P` 标记段首），用脚本按字数估算时间轴：

```bash
python3 tools/make-cues.py cues.tsv --duration <秒> > cues.json
```

再写 `listening/<教材>-<YYYY-MM-DD>-<slug>.json`：

| 字段 | 值 |
|---|---|
| `id` | 该集 id，如 `sprakvagen-d-s29-laxforhoret` |
| `title` / `source` / `cefr` / `date` / `duration` | 篇名（含页码）、教材名 + Blipsay、难度、日期、秒数 |
| `audioUrl` | `media/<slug>.mp3`（**相对 `site/listening/`**，普通音频不走 hls.js） |
| `sourceUrl` / `sourceLinkLabel` | 出版社播放器链接 + `▶ 在出版社播放器听 ↗` |
| `timingsApproximate` | `true` —— 站内会提示「字幕时间轴为估算值」 |
| `note` | 一句话说明来源与误差 |
| `readingSlug` | **§3 那篇 `imported/` 文件名（不含 .md）** ← 互跳就靠这一个字段 |
| `cues` | §6 生成的句级字幕（sv + zh） |
| `vocab` / `phrases` / `grammar` | 10–15 生词 + 关键词组/语法（会自动链到 KB 笔记） |

## 7. 重建 + 同步

```bash
node tools/build-kb-site.js        # slugs.json（listening 的 KB 链接依赖它，必须先跑）
node tools/build-listening-site.js
node tools/build-reading-site.js   # 输出末尾应显示 "N with audio"
```

自检：阅读站那篇出现 **🎧 听这篇**、听力站那集出现 **📖 读这篇原文**，且 `vocab/phrases` 的 slug 解析率接近 100%
（低了就是 `build-kb-site.js` 没先跑）。然后按 §4.3 **自动跑 `/sync`**（拍照属于"成品事件"，不等用户）。

## 常见坑

| 坑 | 症状 | 解 |
|---|---|---|
| 先 build listening 后 build kb | 生词面板没有「完整笔记」链接 | 永远先 `build-kb-site.js` |
| 忘了 `svensk-export` 块 | 阅读站文章能读、学习项面板空 | 补块后重建阅读站 |
| 忘了 `readingSlug` | 两站互不知道对方 | 补进听力 JSON，重建**两个**站 |
| mp3 放进 `listening/` | 站点 404 | 音频要放 `site/listening/media/`（gh-pages 只发布 `site/`） |
| QR 解不出 | 返回空串 | 放大倍数调到 3–4×，或让 Ruibo 用手机扫了把链接发来 |
| 交互式会话 | — | **不自动开 PR**（§4.7 只约束 routine）；要合并时问一句 |
