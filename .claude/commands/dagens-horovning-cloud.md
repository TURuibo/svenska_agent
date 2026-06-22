---
description: 【云端版】抓最新一集 SVT 简易瑞典语新闻字幕 → 生成听力数据 + 入库 → 重建 Lyssna 站 → commit+push，一次会话一条龙（Linux/云 routine 用，无 PowerShell）
argument-hint: "[svt-video-id]  —— 可选；云 routine 留空＝最新一集"
allowed-tools: WebFetch, WebSearch, Read, Write, Edit, Glob, Grep, Bash, Agent(sv-librarian)
---

**云端一条龙 (cloud one-shot)**：这是 `/dagens-horovning` 的「云 routine 专用」版本。Claude Code on the web
的容器是 **Linux + 临时**（每次全新 clone、跑完回收、`inbox/` 被 gitignore），所以不能依赖
`scripts/daily-listening.ps1` 那套 Windows 流水线。本命令在**同一次会话内**走完：
**抓字幕 → 写听力数据 → 入库 → 重建 Lyssna 站 → commit + push**。

> ⚠️ 联网前提：本命令要抓 SVT。云环境必须把 **`svtplay.se`、`api.svt.se`**（及字幕/HLS 所在的 SVT
> CDN 域名）加入 **Network access** 白名单，或用 `Full` 策略。否则 WebFetch 403，抓不到字幕。
> 媒体/字幕只**实时引用**不下载（版权安全），URL 仅在该集可看期 ~1 周内有效。

参数 `$ARGUMENTS`：可含一个 SVT video id。缺省取**最新一集**。

---

## 1. 抓字幕 + 生成听力数据（复用既有逻辑）

**完全按 `.claude/commands/dagens-horovning.md` 的 §1–§4 执行**：
- §1 找最新一集（或用传入 id）；§2 从 `api.svt.se/video/<ID>` 取 VTT 字幕 URL + HLS 流 URL + 时长；
- §3 逐句配中文翻译 + 抽 10–15 生词/3–6 词组/1–3 语法（全部 grundform）；
- §4 **查重**：若 `listening/svt-latt-<DATE>.json` 已存在（按播出日期）→ **无新一集**，跳到第 4 步只重建+收尾，
  不重复抓取、不产生空 commit；否则写该 JSON（schema 见原命令 §4，时间戳转秒）。

`listening/` 是 tracked，会随 git 同步。

## 2. 写导入文件（让听力项进 KB）

按原命令 §5 额外写 `inbox/horning-<DATE>.md`（可读正文 + ` ```svensk-export v1 ` 块，
`sentences` 覆盖**每一条字幕** `sv | zh`）。**仅当本次确有新一集时**才需要入库。

## 3. 入库（inline import，不调 /import 子流程）

用 **`sv-import` 技能**录入 `inbox/horning-<DATE>.md` 的导入块：解析 → swedish-* 补全 → 对照
`profile/level.md` → 查重；条目 > 3 先建 `sources/source-<DATE>-horning.md` 再 spawn `sv-librarian`；
完成后按 §6 更新 `review/schedule.md`。

## 4. 归档 + 重建三个站点（Linux，node）

```bash
mkdir -p imported
# 有 horning 导入文件才归档（无新一集时跳过）
[ -f inbox/horning-<DATE>.md ] && { git mv inbox/horning-<DATE>.md imported/horning-<DATE>.md 2>/dev/null || mv inbox/horning-<DATE>.md imported/horning-<DATE>.md; }
node tools/build-kb-site.js
node tools/build-reading-site.js
node tools/build-listening-site.js
```

**不跑** `build-listening-site.ps1`/`build-kb-site.ps1`（无 PowerShell）。`build-listening-site.js` 扫
`listening/*.json` → `site/listening/listening-data.js`，并按 `lemma` 给命中 KB 的词加链接。

## 5. 提交并推送 (commit + push)

听力要把 `listening/` 与 `site/listening/listening-data.js` 一并暂存：

```bash
git add -- knowledge_base imported listening review/schedule.md profile \
  site/kb-data.js site/reading/reading-data.js site/listening/listening-data.js .gitattributes 2>/dev/null
git diff --cached --quiet || git commit -m "Daily SVT listening <DATE> — auto-import"
git push 2>/dev/null || git push -u origin "$(git branch --show-current)"
```

**绝不** `git add inbox/`。**无新一集时** `git diff --cached --quiet` 会判定无改动 → 不 commit（正常）。
push 失败可按 2s/4s/8s/16s 退避重试最多 4 次；仍失败不回滚导入，下次带上。

## 6. 收尾报告 (Report)

```
✅ 云端听力已就绪并推送: listening/svt-latt-<DATE>.json · <N> 句 · <M> 生词 · Lyssna 站已重建 · 已 push <branch>
```

无新一集时报「最新一集已在站点：svt-latt-<DATE>，未产生 commit」。
若某步失败，说明失败在哪一步、产物在哪、是否已 push。

> 真实字幕抓取，**不得编造**台词或译文；逐句中文翻译忠实于瑞典语原文。
