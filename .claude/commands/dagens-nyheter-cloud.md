---
description: 【云端版】抓 5 条 8 Sidor 简易新闻 → 入库 → 重建站点 → commit+push，一次会话一条龙（Linux/云 routine 用，无 PowerShell）
argument-hint: "[YYYY-MM-DD]  —— 可选日期；云 routine 留空＝今天"
allowed-tools: WebSearch, WebFetch, Read, Write, Edit, Glob, Grep, Bash, Agent(sv-librarian)
---

**云端一条龙 (cloud one-shot)**：这是 `/dagens-nyheter` 的「云 routine 专用」版本。Claude Code on the web
的容器是 **Linux + 临时**（每次全新 clone、跑完回收、`inbox/` 被 gitignore），所以不能依赖 `scripts/*.ps1`
那套 Windows 流水线，也不能把产物留在 `inbox/` 等下次 `/import`。本命令在**同一次会话内**走完：
**抓取 → 入库 → 重建站点 → commit + push**，让产物落到 tracked 文件后立刻推到 GitHub。

参数 `$ARGUMENTS`：可含一个日期 `YYYY-MM-DD`。无则用**今天**（会话上下文里的当前日期）。

> ⚠️ 联网前提：本命令要抓 8 Sidor，云环境必须把 `8sidor.se`（及备用搜索命中的新闻域名）加入
> **Network access** 白名单，或用 `Full` 策略。否则 WebFetch 会 403，无新闻可抓。

---

## 1. 生成 inbox 文件（复用既有抓取逻辑）

**完全按 `.claude/commands/dagens-nyheter.md` 的 §1–§3 执行**：用 `WebFetch`/`WebSearch` 抓 8 Sidor
最新 5 条真实新闻（**不得编造**），读 `profile/level.md` 选生词，写出 `inbox/news-<DATE>.md`
（可读正文 + 末尾固定 SVT 听力链接 + 一个 ` ```svensk-export v1 ` 导入块）。

写完先确认文件已生成（`Glob inbox/news-<DATE>*.md`）。若抓取彻底失败、凑不满新闻，则**中止**并报告，
不要写空文件、不要进入后续步骤。

## 2. 入库（inline import，不调 /import 子流程）

直接用 **`sv-import` 技能**把刚生成文件里的 `svensk-export` 块录入 `knowledge_base/`：
- 解析 → 用 swedish-* 技能补全 → 对照 `profile/level.md` → 查重（dedup against live KB）。
- 条目 > 3 时，先建 `sources/source-<DATE>-news.md`，再 spawn `sv-librarian` 做批量写库 + 双向 `[[wikilinks]]`。
- 完成后按 `sv-import` §6 更新 `review/schedule.md`。

## 3. 归档 + 重建站点（Linux，node，无 PowerShell）

```bash
mkdir -p imported
git mv inbox/news-<DATE>.md imported/news-<DATE>.md 2>/dev/null || mv inbox/news-<DATE>.md imported/news-<DATE>.md
node tools/build-kb-site.js
node tools/build-reading-site.js
```

- 先归档到 tracked 的 `imported/`（阅读站靠「在 inbox 还是 imported」判定 待导入/已导入；且 `inbox/` 不进 git，
  必须搬到 `imported/` 才同步得到其它设备）。
- 再 `build-kb-site.js`（KB 查看器 + slug 清单）和 `build-reading-site.js`（Läsning 阅读数据）。
- 不跑 `build-kb-site.ps1`（Windows 专用，云端没有 PowerShell）。

## 4. 提交并推送 (commit + push)

只暂存真实内容路径（与 `tools/sync-kb.ps1` 一致），然后提交、推送当前分支：

```bash
git add -- knowledge_base imported review/schedule.md profile \
  site/kb-data.js site/reading/reading-data.js .gitattributes 2>/dev/null
git diff --cached --quiet || git commit -m "Daily news (8 Sidor) <DATE> — auto-import"
git push 2>/dev/null || git push -u origin "$(git branch --show-current)"
```

- 暂存前用 `Test-Path` 思路过滤：只 `git add` 实际存在且有改动的路径（上面命令对不存在路径会被 git 忽略报警，可加 `2>/dev/null`）。
- **绝不** `git add inbox/`（被 gitignore，且我们已把文件搬进 imported/）。
- 网络抖动时 push 失败可重试（2s/4s/8s/16s 退避，最多 4 次）。push 不成功也别回滚已成功的导入——下次会带上。

## 5. 收尾报告 (Report)

输出一行精简确认：

```
✅ 云端新闻已入库并推送: imported/news-<DATE>.md · 5 条 8 Sidor · KB+阅读站已重建 · 已 push <branch>
```

若某步失败，明确说明失败在哪一步、产物当前在哪、是否已 push。
