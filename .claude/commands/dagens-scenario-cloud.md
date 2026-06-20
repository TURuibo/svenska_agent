---
description: 【云端版】生成今日情景练习 → 入库 → 重建站点 → commit+push，一次会话一条龙（Linux/云 routine 用，无 PowerShell）
argument-hint: "[YYYY-MM-DD] [index 0-13]  —— 二者可选，云 routine 留空＝今天自动算"
allowed-tools: Read, Write, Edit, Glob, Grep, Bash, Agent(sv-librarian), Agent(sv-scenario-writer)
---

**云端一条龙 (cloud one-shot)**：这是 `/dagens-scenario` 的「云 routine 专用」版本。Claude Code on the web
的容器是 **Linux + 临时**（每次全新 clone、跑完回收、`inbox/` 被 gitignore），所以不能依赖 `scripts/*.ps1`，
也不能把产物留在 `inbox/` 等下次 `/import`。本命令在**同一次会话内**走完：
**生成 → 入库 → 重建站点 → commit + push**。

> ✅ 本命令不需要联网；纯生成 + 本地入库 + git。

参数 `$ARGUMENTS`：可含日期 `YYYY-MM-DD` 和主题号 `0-13`（顺序不限）。云 routine 留空时按
今天的 `day-of-year(DATE) mod 14` 自算（可用 `date +%j`，Linux 有 `date`）。

---

## 1. 生成 inbox 文件（复用既有生成逻辑）

**完全按 `.claude/commands/dagens-scenario.md` 的 §1–§4 执行**：定日期与主题（主题表见该文件）、
读 `profile/level.md` + 轻量查重、按 `sv-scenario` 技能生成，写出
`inbox/scenario-<DATE>-<slug>.md`（可读情景 §4a + ` ```svensk-export v1 ` 块 §4b）。

可直接 spawn `sv-scenario-writer` 子智能体生成，或主线内联生成——两者皆可。写完确认文件存在
（`Glob inbox/scenario-<DATE>-*.md`）。

## 2. 入库（inline import，不调 /import 子流程）

用 **`sv-import` 技能**把刚生成文件里的 `svensk-export` 块录入 `knowledge_base/`：
解析 → swedish-* 补全 → 对照 `profile/level.md` → 查重。条目 > 3 时先建
`sources/source-<DATE>-<slug>.md` 再 spawn `sv-librarian`；完成后按 §6 更新 `review/schedule.md`。

## 3. 归档 + 重建站点（Linux，node）

```bash
mkdir -p imported
git mv inbox/scenario-<DATE>-<slug>.md imported/scenario-<DATE>-<slug>.md 2>/dev/null \
  || mv inbox/scenario-<DATE>-<slug>.md imported/scenario-<DATE>-<slug>.md
node tools/build-kb-site.js
node tools/build-reading-site.js
```

先归档到 tracked 的 `imported/`（阅读站据此判定 待导入/已导入；`inbox/` 不进 git 必须搬出），再重建两站数据。
**不跑** `build-kb-site.ps1`（Windows 专用）。

## 4. 提交并推送 (commit + push)

```bash
git add -- knowledge_base imported review/schedule.md profile \
  site/kb-data.js site/reading/reading-data.js .gitattributes 2>/dev/null
git diff --cached --quiet || git commit -m "Daily scenario <DATE> <slug> — auto-import"
git push 2>/dev/null || git push -u origin "$(git branch --show-current)"
```

**绝不** `git add inbox/`。push 失败可按 2s/4s/8s/16s 退避重试最多 4 次；仍失败不回滚导入，下次带上。

## 5. 收尾报告 (Report)

```
✅ 云端情景已入库并推送: imported/scenario-<DATE>-<slug>.md · 类型 <type> · 主题 <主题> · 已 push <branch>
```

若某步失败，说明失败在哪一步、产物在哪、是否已 push。
